import { randomBytes } from 'node:crypto';
import { Request, Response } from 'express';
import Redis from 'ioredis';
import { redisConfig } from '../config/redis';
import { connectSlack, disconnectSlack, isSlackConnected } from '../services/slackService';

const redis = new Redis(redisConfig);
redis.on('error', (error) => console.error('Slack OAuth state Redis error', error));

export async function closeSlackControllerResources() {
    await redis.quit();
}

export async function beginSlackOAuth(req: Request, res: Response) {
    const clientId = process.env.SLACK_CLIENT_ID;
    const redirectUri = process.env.SLACK_REDIRECT_URI;
    const senderEmail = req.authenticatedEmail;
    if (!clientId || !redirectUri || !senderEmail) {
        return res.status(503).json({ error: 'Slack OAuth is not configured' });
    }

    try {
        const state = randomBytes(32).toString('base64url');
        await redis.set(`slack-oauth-state:${state}`, senderEmail, 'EX', 600, 'NX');
        const authorizeUrl = new URL('https://slack.com/oauth/v2/authorize');
        authorizeUrl.searchParams.set('client_id', clientId);
        authorizeUrl.searchParams.set('scope', 'incoming-webhook,chat:write');
        authorizeUrl.searchParams.set('redirect_uri', redirectUri);
        authorizeUrl.searchParams.set('state', state);
        res.json({ authorizationUrl: authorizeUrl.toString() });
    } catch (error) {
        console.error('Unable to start Slack OAuth', error);
        res.status(503).json({ error: 'Unable to start Slack connection' });
    }
}

export async function slackOAuthCallback(req: Request, res: Response) {
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!state || !code) return res.status(400).send('Slack authorization was not completed.');

    try {
        const senderEmail = await redis.eval(
            "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value",
            1,
            `slack-oauth-state:${state}`,
        ) as string | null;
        if (!senderEmail) return res.status(400).send('Slack authorization state expired or was already used.');

        const clientId = process.env.SLACK_CLIENT_ID;
        const clientSecret = process.env.SLACK_CLIENT_SECRET;
        const redirectUri = process.env.SLACK_REDIRECT_URI;
        if (!clientId || !clientSecret || !redirectUri) {
            return res.status(503).send('Slack OAuth is not configured.');
        }

        const response = await fetch('https://slack.com/api/oauth.v2.access', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                code,
                redirect_uri: redirectUri,
            }),
            signal: AbortSignal.timeout(10000),
        });
        const result = await response.json() as {
            ok?: boolean;
            error?: string;
            access_token?: string;
            incoming_webhook?: { url?: string; channel?: string };
        };
        if (!response.ok || !result.ok || !result.access_token || !result.incoming_webhook?.url) {
            console.error('Slack OAuth exchange failed', result.error || response.status);
            return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/queue?slack=error`);
        }

        await connectSlack(
            senderEmail,
            result.access_token,
            result.incoming_webhook.url,
            result.incoming_webhook.channel,
        );
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/queue?slack=connected`);
    } catch (error) {
        console.error('Slack OAuth callback failed', error);
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/queue?slack=error`);
    }
}

export async function getSlackStatus(req: Request, res: Response) {
    try {
        res.json({ connected: await isSlackConnected(req.authenticatedEmail || '') });
    } catch (error) {
        console.error('Unable to load Slack status', error);
        res.status(503).json({ error: 'Unable to load Slack connection status' });
    }
}

export async function removeSlackIntegration(req: Request, res: Response) {
    try {
        await disconnectSlack(req.authenticatedEmail || '');
        res.status(204).end();
    } catch (error) {
        console.error('Unable to disconnect Slack', error);
        res.status(500).json({ error: 'Unable to disconnect Slack' });
    }
}

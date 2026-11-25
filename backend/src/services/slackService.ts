import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import prisma from '../config/db';

const SLACK_WEBHOOK_HOST = 'hooks.slack.com';

function encryptionKey(): Buffer {
    const encodedKey = process.env.SLACK_TOKEN_ENCRYPTION_KEY;
    if (!encodedKey) throw new Error('SLACK_TOKEN_ENCRYPTION_KEY is required for Slack integration');

    const key = /^[0-9a-f]{64}$/i.test(encodedKey)
        ? Buffer.from(encodedKey, 'hex')
        : Buffer.from(encodedKey, 'base64');
    if (key.length !== 32) throw new Error('SLACK_TOKEN_ENCRYPTION_KEY must encode exactly 32 bytes');
    return key;
}

function encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64')).join('.');
}

function decrypt(value: string): string {
    const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64'));
    if (!iv || !tag || !encrypted) throw new Error('Stored Slack credential is invalid');
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export async function connectSlack(
    senderEmail: string,
    accessToken: string,
    webhookUrl: string,
    channelName?: string,
) {
    const webhook = new URL(webhookUrl);
    if (webhook.protocol !== 'https:' || webhook.hostname !== SLACK_WEBHOOK_HOST) {
        throw new Error('Slack returned an invalid incoming webhook URL');
    }

    const sender = await prisma.sender.upsert({
        where: { email: senderEmail },
        update: {},
        create: { email: senderEmail, name: senderEmail },
    });

    return prisma.slackIntegration.upsert({
        where: { senderId: sender.id },
        update: {
            encryptedAccessToken: encrypt(accessToken),
            encryptedWebhookUrl: encrypt(webhookUrl),
            channelName,
        },
        create: {
            senderId: sender.id,
            encryptedAccessToken: encrypt(accessToken),
            encryptedWebhookUrl: encrypt(webhookUrl),
            channelName,
        },
    });
}

export async function disconnectSlack(senderEmail: string) {
    const integration = await prisma.slackIntegration.findFirst({
        where: { sender: { email: senderEmail } },
        select: { encryptedAccessToken: true },
    });
    await prisma.slackIntegration.deleteMany({
        where: { sender: { email: senderEmail } },
    });
    if (integration) {
        try {
            const response = await fetch('https://slack.com/api/auth.revoke', {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${decrypt(integration.encryptedAccessToken)}`,
                    'content-type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams(),
                signal: AbortSignal.timeout(5000),
            });
            const result = await response.json() as { ok?: boolean };
            if (!response.ok || !result.ok) {
                console.warn(`Slack token revocation was rejected for ${senderEmail}`);
            }
        } catch {
            console.warn(`Slack token revocation could not be confirmed for ${senderEmail}`);
        }
    }
}

export async function isSlackConnected(senderEmail: string) {
    return Boolean(await prisma.slackIntegration.findFirst({
        where: { sender: { email: senderEmail } },
        select: { id: true },
    }));
}

export async function notifySlackRateLimit(senderEmail: string, limit: number) {
    const integration = await prisma.slackIntegration.findFirst({
        where: { sender: { email: senderEmail } },
        select: { encryptedWebhookUrl: true },
    });
    if (!integration) return;

    const webhookUrl = decrypt(integration.encryptedWebhookUrl);
    const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            text: `ReachInbox paused email delivery for ${senderEmail}: the hourly limit of ${limit} was reached. Remaining messages will resume in the next hour window.`,
        }),
        signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
        throw new Error(`Slack webhook returned HTTP ${response.status}`);
    }
}

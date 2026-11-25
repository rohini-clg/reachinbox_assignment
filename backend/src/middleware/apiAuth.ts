import { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function requireApiAuth(req: Request, res: Response, next: NextFunction) {
    const expectedToken = process.env.BACKEND_API_TOKEN;
    const authorization = req.header('authorization') || '';
    const suppliedToken = authorization.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length)
        : '';

    if (!expectedToken) {
        return res.status(503).json({ error: 'Backend API authentication is not configured' });
    }

    const expected = Buffer.from(expectedToken);
    if (process.env.NODE_ENV === 'production' && expected.length < 32) {
        return res.status(503).json({ error: 'Backend API authentication is not securely configured' });
    }
    const supplied = Buffer.from(suppliedToken);
    const validToken = expected.length === supplied.length && timingSafeEqual(expected, supplied);
    const email = (req.header('x-user-email') || '').trim().toLowerCase();

    if (!validToken || !EMAIL_PATTERN.test(email)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    req.authenticatedEmail = email;
    next();
}

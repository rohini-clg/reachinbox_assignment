import nodemailer from 'nodemailer';
import '../config/loadEnv';

const requiredSmtpSetting = (name: 'SMTP_USER' | 'SMTP_PASS', env: NodeJS.ProcessEnv): string => {
    const value = env[name];
    if (!value) {
        throw new Error(`${name} must be configured before email delivery is enabled`);
    }
    return value;
};

export function resolveSmtpTransportOptions(env: NodeJS.ProcessEnv = process.env) {
    const port = Number.parseInt(env.SMTP_PORT || '587', 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('SMTP_PORT must be a valid TCP port');
    }
    if (env.NODE_ENV === 'production' && !env.SMTP_HOST) {
        throw new Error('SMTP_HOST must be configured in production');
    }

    return {
        host: env.SMTP_HOST || 'smtp.ethereal.email',
        port,
        secure: port === 465,
        requireTLS: env.NODE_ENV === 'production' && port !== 465,
        tls: { rejectUnauthorized: true },
        auth: {
            user: requiredSmtpSetting('SMTP_USER', env),
            pass: requiredSmtpSetting('SMTP_PASS', env),
        },
    };
}

export const createTransporter = async () => nodemailer.createTransport(resolveSmtpTransportOptions());

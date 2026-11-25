import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSmtpTransportOptions } from './mailService';

test('requires configured SMTP host and STARTTLS in production on submission ports', () => {
    assert.throws(
        () => resolveSmtpTransportOptions({
            NODE_ENV: 'production',
            SMTP_PORT: '587',
            SMTP_USER: 'sender',
            SMTP_PASS: 'secret',
        }),
        /SMTP_HOST must be configured in production/,
    );

    const options = resolveSmtpTransportOptions({
        NODE_ENV: 'production',
        SMTP_HOST: 'smtp.example',
        SMTP_PORT: '587',
        SMTP_USER: 'sender',
        SMTP_PASS: 'secret',
    });
    assert.equal(options.requireTLS, true);
    assert.equal(options.secure, false);
    assert.equal(options.tls.rejectUnauthorized, true);
});

test('uses implicit TLS for port 465', () => {
    const options = resolveSmtpTransportOptions({
        NODE_ENV: 'production',
        SMTP_HOST: 'smtp.example',
        SMTP_PORT: '465',
        SMTP_USER: 'sender',
        SMTP_PASS: 'secret',
    });
    assert.equal(options.secure, true);
    assert.equal(options.requireTLS, false);
});

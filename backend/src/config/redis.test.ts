import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRedisConfig } from './redis';

test('keeps native host/port Redis configuration available in development', () => {
    const config = resolveRedisConfig({
        NODE_ENV: 'development',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: '6379',
    });

    assert.equal(config.host, '127.0.0.1');
    assert.equal(config.port, 6379);
});

test('requires authenticated TLS Redis URLs in production', () => {
    assert.throws(
        () => resolveRedisConfig({ NODE_ENV: 'production', REDIS_URL: 'redis://user:pass@cache.example:6379' }),
        /must use rediss:\/\/ and include a password/,
    );
    assert.throws(
        () => resolveRedisConfig({ NODE_ENV: 'production', REDIS_URL: 'rediss://cache.example:6379' }),
        /must use rediss:\/\/ and include a password/,
    );

    const config = resolveRedisConfig({
        NODE_ENV: 'production',
        REDIS_URL: 'rediss://worker:p%40ss@cache.example:6380/2',
    });
    assert.equal(config.host, 'cache.example');
    assert.equal(config.port, 6380);
    assert.equal(config.username, 'worker');
    assert.equal(config.password, 'p@ss');
    assert.deepEqual(config.tls, {});
});

import { RedisOptions } from 'ioredis';
import './loadEnv';

export function resolveRedisConfig(env: NodeJS.ProcessEnv = process.env): RedisOptions {
    const port = Number.parseInt(env.REDIS_PORT || '6379', 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('REDIS_PORT must be a valid TCP port');
    }

    if (env.NODE_ENV === 'production') {
        if (!env.REDIS_URL) {
            throw new Error('REDIS_URL using rediss:// and Redis authentication is required in production');
        }
        const url = new URL(env.REDIS_URL);
        if (url.protocol !== 'rediss:' || !url.password) {
            throw new Error('Production REDIS_URL must use rediss:// and include a password');
        }
    }

    return env.REDIS_URL
        ? parseRedisUrl(env.REDIS_URL)
        : {
              host: env.REDIS_HOST || '127.0.0.1',
              port,
              maxRetriesPerRequest: null,
          };
}

function parseRedisUrl(value: string): RedisOptions {
    const url = new URL(value);
    if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
        throw new Error('REDIS_URL must use the redis:// or rediss:// protocol');
    }

    const database = url.pathname.length > 1 ? Number.parseInt(url.pathname.slice(1), 10) : 0;
    if (!Number.isInteger(database) || database < 0) {
        throw new Error('REDIS_URL contains an invalid database number');
    }

    return {
        host: url.hostname,
        port: url.port ? Number.parseInt(url.port, 10) : 6379,
        username: url.username ? decodeURIComponent(url.username) : undefined,
        password: url.password ? decodeURIComponent(url.password) : undefined,
        db: database,
        tls: url.protocol === 'rediss:' ? {} : undefined,
        maxRetriesPerRequest: null,
    };
}

export const redisConfig = resolveRedisConfig();
export const getBullMQRedisConfig = (): RedisOptions => redisConfig;

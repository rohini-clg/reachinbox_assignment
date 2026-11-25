import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDatabaseUrl } from './databaseUrl';

test('requires a PostgreSQL connection URL', () => {
    assert.throws(
        () => validateDatabaseUrl('redis://localhost:6379'),
        /DATABASE_URL must use postgres/,
    );
});

test('requires verified TLS for production PostgreSQL', () => {
    assert.throws(
        () => validateDatabaseUrl('postgresql://user:pass@db.example/app?sslmode=require', 'production'),
        /sslmode=verify-full/,
    );
    assert.doesNotThrow(
        () => validateDatabaseUrl('postgresql://user:pass@db.example/app?sslmode=verify-full', 'production'),
    );
    assert.doesNotThrow(
        () => validateDatabaseUrl('postgresql://user:pass@127.0.0.1/app', 'development'),
    );
});

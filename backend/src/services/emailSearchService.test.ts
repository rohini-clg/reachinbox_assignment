import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveElasticsearchConfig } from './emailSearchService';

test('requires HTTPS and an API key for production Elasticsearch', () => {
    assert.throws(
        () => resolveElasticsearchConfig({
            NODE_ENV: 'production',
            ELASTICSEARCH_URL: 'http://search.example',
            ELASTICSEARCH_API_KEY: 'test-key',
        }),
        /requires HTTPS and ELASTICSEARCH_API_KEY/,
    );
    assert.throws(
        () => resolveElasticsearchConfig({
            NODE_ENV: 'production',
            ELASTICSEARCH_URL: 'https://search.example',
        }),
        /requires HTTPS and ELASTICSEARCH_API_KEY/,
    );

    assert.deepEqual(
        resolveElasticsearchConfig({
            NODE_ENV: 'production',
            ELASTICSEARCH_URL: 'https://search.example',
            ELASTICSEARCH_API_KEY: 'test-key',
        }),
        { node: 'https://search.example', auth: { apiKey: 'test-key' } },
    );
});

test('allows an uncredentialed HTTP Elasticsearch endpoint only outside production', () => {
    assert.equal(
        resolveElasticsearchConfig({
            NODE_ENV: 'development',
            ELASTICSEARCH_URL: 'http://127.0.0.1:9200',
        })?.node,
        'http://127.0.0.1:9200',
    );
    assert.equal(resolveElasticsearchConfig({ NODE_ENV: 'development' }), null);
});

import { Client } from '@elastic/elasticsearch';
import { Email, Sender } from '@prisma/client';

type EmailWithSender = Email & { sender: Sender };

export function resolveElasticsearchConfig(env: NodeJS.ProcessEnv = process.env) {
    const node = env.ELASTICSEARCH_URL?.trim();
    if (!node) return null;

    const url = new URL(node);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error('ELASTICSEARCH_URL must use http:// or https://');
    }
    if (env.NODE_ENV === 'production' && (url.protocol !== 'https:' || !env.ELASTICSEARCH_API_KEY)) {
        throw new Error('Production Elasticsearch requires HTTPS and ELASTICSEARCH_API_KEY');
    }

    return {
        node,
        auth: env.ELASTICSEARCH_API_KEY ? { apiKey: env.ELASTICSEARCH_API_KEY } : undefined,
    };
}

const elasticsearchConfig = resolveElasticsearchConfig();
const elasticsearch = elasticsearchConfig ? new Client(elasticsearchConfig) : null;

export const isEmailSearchConfigured = Boolean(elasticsearch);

export async function indexEmail(email: EmailWithSender): Promise<boolean> {
    if (!elasticsearch) return false;

    try {
        await elasticsearch.index({
            index: 'reachinbox-emails',
            id: email.id,
            document: {
                id: email.id,
                senderEmail: email.sender.email,
                to: email.to,
                subject: email.subject,
                body: email.body,
                scheduledAt: email.scheduledAt.toISOString(),
                sentAt: email.sentAt?.toISOString() ?? null,
                status: email.status,
            },
        });
        return true;
    } catch (error) {
        console.error(`Elasticsearch indexing failed for email ${email.id}`, error);
        return false;
    }
}

export async function searchEmails(senderEmail: string, query: string) {
    if (!elasticsearch) {
        throw new Error('Elasticsearch search is not configured');
    }

    const result = await elasticsearch.search({
        index: 'reachinbox-emails',
        size: 100,
        query: {
            bool: {
                filter: [{ term: { 'senderEmail.keyword': senderEmail } }],
                must: [{
                    multi_match: {
                        query,
                        fields: ['to', 'subject', 'body'],
                        type: 'best_fields',
                        fuzziness: 'AUTO',
                    },
                }],
            },
        },
        sort: [{ scheduledAt: 'desc' }],
    });

    return result.hits.hits.map((hit) => hit._source);
}

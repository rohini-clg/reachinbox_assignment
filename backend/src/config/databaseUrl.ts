export function validateDatabaseUrl(databaseUrl: string, nodeEnv = process.env.NODE_ENV): void {
    const url = new URL(databaseUrl);
    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
        throw new Error('DATABASE_URL must use postgres:// or postgresql://');
    }
    if (nodeEnv === 'production' && url.searchParams.get('sslmode') !== 'verify-full') {
        throw new Error('Production DATABASE_URL must set sslmode=verify-full');
    }
}

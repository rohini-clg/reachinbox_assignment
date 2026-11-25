import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import './loadEnv';
import { validateDatabaseUrl } from './databaseUrl';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error(
        'DATABASE_URL is required. Copy backend/.env.example to backend/.env and set the PostgreSQL URL before starting the backend.',
    );
}

validateDatabaseUrl(databaseUrl);

const pool = new Pool({
    connectionString: databaseUrl,
    max: Number.parseInt(process.env.DATABASE_POOL_MAX || '10', 10),
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export const closeDatabase = async () => {
    await prisma.$disconnect();
};

export default prisma;

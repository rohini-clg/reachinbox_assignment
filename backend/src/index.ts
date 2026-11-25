import './config/loadEnv';
import express, { ErrorRequestHandler } from 'express';
import cors from 'cors';
import Redis from 'ioredis';
import emailRoutes from './routes/emailRoutes';
import { requireApiAuth } from './middleware/apiAuth';
import prisma, { closeDatabase } from './config/db';
import { redisConfig } from './config/redis';
import { emailQueue } from './queues/emailQueue';
import slackRoutes from './routes/slackRoutes';
import { closeSlackControllerResources } from './controllers/slackController';

const app = express();
const port = Number.parseInt(process.env.PORT || '4000', 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid TCP port');
}

const origins = new Set(
    [
        ...(process.env.CORS_ORIGINS || '').split(','),
        process.env.FRONTEND_URL || '',
        process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000',
    ]
        .map((origin) => origin.trim())
        .filter(Boolean),
);
const corsOptions: cors.CorsOptions = {
    origin(origin, callback) {
        if (!origin || origins.has(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Origin is not allowed by CORS'));
        }
    },
    credentials: true,
};

app.disable('x-powered-by');
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => {
    res.json({
        message: 'EMAIL-SCHEDULER Backend API',
        status: 'running',
        endpoints: {
            scheduled: '/api/emails/scheduled',
            sent: '/api/emails/sent',
            schedule: 'POST /api/emails/schedule',
            readiness: '/health/ready',
        },
    });
});
app.get('/health/live', (_req, res) => res.status(200).json({ status: 'alive' }));

const healthRedis = new Redis(redisConfig);
healthRedis.on('error', (error) => console.error('Readiness Redis connection error', error));
app.get('/health/ready', async (_req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        await healthRedis.ping();
        res.status(200).json({ status: 'ready' });
    } catch (error) {
        console.error('Readiness check failed', error);
        res.status(503).json({ status: 'not ready' });
    }
});

app.use('/api/slack', slackRoutes);
app.use('/api/emails', requireApiAuth, emailRoutes);

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    console.error('Unhandled API error', error);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error' });
};
app.use(errorHandler);

if (require.main === module) {
    const server = app.listen(port, () => {
        console.log(`Backend API listening on port ${port}`);
    });

    let shuttingDown = false;
    const shutdown = async (signal: string) => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`Received ${signal}; shutting down API`);
        server.close(async (error) => {
            if (error) console.error('HTTP server shutdown failed', error);
            try {
                await Promise.all([
                    emailQueue.close(),
                    healthRedis.quit(),
                    closeSlackControllerResources(),
                    closeDatabase(),
                ]);
                process.exit(error ? 1 : 0);
            } catch (shutdownError) {
                console.error('API shutdown failed', shutdownError);
                process.exit(1);
            }
        });
    };

    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

export default app;

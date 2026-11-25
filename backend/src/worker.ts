import './config/loadEnv';
import { closeDatabase } from './config/db';
import { closeWorkerResources, recoverPendingEmailJobs, setupWorker } from './workers/emailWorker';

let worker: ReturnType<typeof setupWorker> | undefined;
let shuttingDown = false;

const shutdown = async (signal: string, exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}; shutting down email worker`);
    try {
        if (worker) await closeWorkerResources(worker);
        await closeDatabase();
        process.exit(exitCode);
    } catch (error) {
        console.error('Email worker shutdown failed', error);
        process.exit(1);
    }
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

recoverPendingEmailJobs()
    .then(() => {
        worker = setupWorker();
    })
    .catch((error) => {
        console.error('Unable to recover pending email jobs', error);
        void shutdown('startup failure', 1);
    });

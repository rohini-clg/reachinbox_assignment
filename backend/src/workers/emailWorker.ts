import { DelayedError, Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import { redisConfig } from '../config/redis';
import prisma from '../config/db';
import { createTransporter } from '../services/mailService';
import { emailQueue, EMAIL_QUEUE_NAME } from '../queues/emailQueue';
import { indexEmail } from '../services/emailSearchService';
import { notifySlackRateLimit } from '../services/slackService';

const redis = new Redis(redisConfig);

const SEND_SLOT_SCRIPT = `
local now = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local windowEnd = tonumber(ARGV[3])
local interval = tonumber(ARGV[4])
local reservedAt = redis.call('GET', KEYS[3])

if reservedAt then
  local reservedTime = tonumber(reservedAt)
  if reservedTime > now then
    return {0, reservedTime - now, 0}
  end
  return {1, 0, 0}
end

local count = tonumber(redis.call('GET', KEYS[1]) or '0')
if count >= limit then
  return {2, math.max(1, windowEnd - now), count}
end

local nextSendAt = tonumber(redis.call('GET', KEYS[2]) or '0')
if nextSendAt > now then
  return {0, nextSendAt - now, count}
end

count = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], 7200)
redis.call('SET', KEYS[2], now + interval, 'PX', 86400000)
redis.call('SET', KEYS[3], now, 'EX', 86400)
return {1, 0, count}
`;

const positiveInt = (value: string | undefined, fallback: number, name: string) => {
    const parsed = Number.parseInt(value || String(fallback), 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`${name} must be a positive integer`);
    }
    return parsed;
};

const concurrency = positiveInt(process.env.WORKER_CONCURRENCY, 5, 'WORKER_CONCURRENCY');

export const setupWorker = () => {
    const worker = new Worker(
        EMAIL_QUEUE_NAME,
        async (job: Job) => {
            const { emailId, senderId, senderEmail } = job.data;
            if (
                typeof emailId !== 'string' ||
                typeof senderId !== 'string' ||
                typeof senderEmail !== 'string'
            ) {
                throw new Error('Invalid email job payload');
            }

            const senderConfig = await prisma.sender.findUnique({
                where: { id: senderId },
                select: { hourlyLimit: true, delayBetweenEmailsMs: true },
            });
            if (!senderConfig) throw new Error(`Sender ${senderId} no longer exists`);

            const now = Date.now();
            const windowStart = Math.floor(now / 3_600_000);
            const windowEnd = (windowStart + 1) * 3_600_000;
            const windowKey = `email-rate:${senderId}:${windowStart}`;
            const slotKey = `email-send-slot:${senderId}`;
            const reservationKey = `email-send-reservation:${emailId}`;
            const reservation = await redis.eval(
                SEND_SLOT_SCRIPT,
                3,
                windowKey,
                slotKey,
                reservationKey,
                now,
                senderConfig.hourlyLimit,
                windowEnd,
                Math.max(
                    senderConfig.delayBetweenEmailsMs,
                    positiveInt(process.env.DELAY_BETWEEN_EMAILS_MS, 2000, 'DELAY_BETWEEN_EMAILS_MS'),
                ),
            ) as [number, number, number];

            if (reservation[0] !== 1) {
                const delay = Math.max(1, Number(reservation[1]));
                if (reservation[0] === 2) {
                    console.warn(`Sender ${senderEmail} reached its hourly email limit; job ${job.id} deferred`);
                    const windowKey = `email-rate-notified:${senderId}:${windowStart}`;
                    const shouldNotify = await redis.set(windowKey, '1', 'EX', 7200, 'NX');
                    if (shouldNotify) {
                        void notifySlackRateLimit(senderEmail, senderConfig.hourlyLimit).catch((error) => {
                            console.error(`Slack rate-limit notification failed for ${senderEmail}`, error);
                        });
                    }
                }
                await job.moveToDelayed(now + delay, job.token);
                throw new DelayedError();
            }

            const claim = await prisma.email.updateMany({
                where: { id: emailId, senderId, status: 'PENDING' },
                data: { status: 'PROCESSING' },
            });
            if (claim.count === 0) {
                const current = await prisma.email.findUnique({
                    where: { id: emailId },
                    select: { status: true },
                });
                if (current?.status === 'PROCESSING' && job.attemptsMade > 0) {
                    await prisma.email.updateMany({
                        where: { id: emailId, status: 'PROCESSING' },
                        data: { status: 'FAILED' },
                    });
                    console.error(`Email ${emailId} was interrupted during delivery; it was not resent to avoid a duplicate`);
                }
                return;
            }

            let smtpAccepted = false;
            try {
                const email = await prisma.email.findUnique({
                    where: { id: emailId },
                    include: { sender: true },
                });
                if (!email) throw new Error(`Email ${emailId} no longer exists`);

                const transporter = await createTransporter();
                await transporter.sendMail({
                    from: email.sender.email,
                    to: email.to,
                    subject: email.subject,
                    text: email.body,
                    messageId: `<${email.id}@reachinbox.local>`,
                });
                smtpAccepted = true;

                const sentEmail = await prisma.email.update({
                    where: { id: emailId },
                    data: { status: 'SENT', sentAt: new Date() },
                    include: { sender: true },
                });
                await indexEmail(sentEmail);
            } catch (error) {
                const attempts = typeof job.opts.attempts === 'number' ? job.opts.attempts : 1;
                const update = await prisma.email.updateMany({
                    where: { id: emailId, status: 'PROCESSING' },
                    data: {
                        status: !smtpAccepted && job.attemptsMade + 1 < attempts ? 'PENDING' : 'FAILED',
                    },
                });
                if (update.count) {
                    const failedOrRetryingEmail = await prisma.email.findUnique({
                        where: { id: emailId },
                        include: { sender: true },
                    });
                    if (failedOrRetryingEmail) await indexEmail(failedOrRetryingEmail);
                }
                console.error(`Email delivery attempt failed for ${emailId}`, error);
                throw error;
            }
        },
        {
            connection: redisConfig,
            concurrency,
        },
    );

    worker.on('completed', (job) => {
        console.log(`Email job ${job.id} completed`);
    });
    worker.on('failed', (job, error) => {
        console.error(`Email job ${job?.id} failed`, error);
    });
    worker.on('error', (error) => {
        console.error('Email worker error', error);
    });

    return worker;
};

export async function recoverPendingEmailJobs() {
    let cursor: string | undefined;
    while (true) {
        const emails = await prisma.email.findMany({
            where: { status: 'PENDING' },
            include: { sender: true },
            orderBy: { id: 'asc' },
            take: 500,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });
        if (emails.length === 0) return;

        await emailQueue.addBulk(emails.map((email) => ({
            name: 'send-email',
            data: {
                emailId: email.id,
                senderId: email.senderId,
                senderEmail: email.sender.email,
            },
            opts: {
                jobId: email.id,
                delay: Math.max(0, email.scheduledAt.getTime() - Date.now()),
            },
        })));
        cursor = emails[emails.length - 1].id;
        if (emails.length < 500) return;
    }
}

export async function closeWorkerResources(worker: Worker) {
    await worker.close();
    await redis.quit();
}

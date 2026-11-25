import { createHash } from 'node:crypto';
import { Request, Response } from 'express';
import prisma from '../config/db';
import { emailQueue } from '../queues/emailQueue';
import { indexEmail, isEmailSearchConfigured, searchEmails } from '../services/emailSearchService';
import { ScheduleValidationError, validateScheduleRequest } from '../utils/scheduleValidation';

const getPositiveInteger = (name: string, fallback: number): number => {
    const value = Number.parseInt(process.env[name] || String(fallback), 10);
    if (!Number.isInteger(value) || value < 1) {
        throw new Error(`${name} must be a positive integer`);
    }
    return value;
};

const logFailure = (operation: string, error: unknown) => {
    console.error(`${operation} failed`, error);
};

export const scheduleEmails = async (req: Request, res: Response) => {
    try {
        const senderEmail = req.authenticatedEmail;
        const requestKey = req.header('idempotency-key');
        if (!senderEmail) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!requestKey || !/^[A-Za-z0-9._:-]{16,128}$/.test(requestKey)) {
            return res.status(400).json({ error: 'A valid Idempotency-Key header is required' });
        }

        const maximumHourlyLimit = getPositiveInteger('MAX_EMAILS_PER_HOUR', 200);
        const minimumDelay = getPositiveInteger('DELAY_BETWEEN_EMAILS_MS', 2000);
        const validatedRequest = validateScheduleRequest(req.body, {
            delayBetweenEmails: minimumDelay,
            hourlyLimit: maximumHourlyLimit,
        });
        const request = {
            ...validatedRequest,
            hourlyLimit: Math.min(validatedRequest.hourlyLimit, maximumHourlyLimit),
            delayBetweenEmails: Math.max(validatedRequest.delayBetweenEmails, minimumDelay),
        };

        const sender = await prisma.sender.upsert({
            where: { email: senderEmail },
            update: {
                hourlyLimit: request.hourlyLimit,
                delayBetweenEmailsMs: request.delayBetweenEmails,
            },
            create: {
                email: senderEmail,
                name: senderEmail,
                hourlyLimit: request.hourlyLimit,
                delayBetweenEmailsMs: request.delayBetweenEmails,
            },
        });

        const requestHash = createHash('sha256')
            .update(JSON.stringify({
                subject: request.subject,
                body: request.body,
                recipients: request.recipients,
                startTime: request.startTime.toISOString(),
                delayBetweenEmails: request.delayBetweenEmails,
                hourlyLimit: request.hourlyLimit,
            }))
            .digest('hex');
        const keys = request.recipients.map((recipient) =>
            createHash('sha256')
                .update(`${senderEmail}:${requestKey}:${recipient}`)
                .digest('hex'),
        );

        await prisma.email.createMany({
            data: request.recipients.map((recipient, index) => ({
                idempotencyKey: keys[index],
                requestHash,
                to: recipient,
                subject: request.subject,
                body: request.body,
                scheduledAt: request.startTime,
                senderId: sender.id,
            })),
            skipDuplicates: true,
        });

        const existingEmails = await prisma.email.findMany({
            where: { idempotencyKey: { in: keys }, senderId: sender.id },
            include: { sender: true },
        });
        if (existingEmails.some((email) => email.requestHash !== requestHash)) {
            return res.status(409).json({ error: 'Idempotency-Key was already used with a different request' });
        }

        const queueEmails = existingEmails.filter((email) => email.status === 'PENDING' || email.status === 'PROCESSING');
        const jobs = await emailQueue.addBulk(
            queueEmails.map((email) => ({
                name: 'send-email',
                data: {
                    emailId: email.id,
                    senderId: sender.id,
                    senderEmail,
                },
                opts: {
                    jobId: email.id,
                    delay: Math.max(0, request.startTime.getTime() - Date.now()),
                },
            })),
        );
        const searchResults = await Promise.all(existingEmails.map(indexEmail));

        res.status(201).json({
            message: 'Emails scheduled successfully',
            jobs: jobs.map((job) => ({ emailId: job.data.emailId, jobId: job.id })),
            searchIndexing: isEmailSearchConfigured && searchResults.every(Boolean),
        });
    } catch (error) {
        if (error instanceof ScheduleValidationError) {
            return res.status(400).json({ error: error.message });
        }
        logFailure('Scheduling emails', error);
        res.status(500).json({ error: 'Unable to schedule emails' });
    }
};

export const getScheduledEmails = async (req: Request, res: Response) => {
    try {
        const sender = await prisma.sender.findUnique({
            where: { email: req.authenticatedEmail },
            select: { id: true },
        });
        if (!sender) return res.json([]);

        const emails = await prisma.email.findMany({
            where: { senderId: sender.id, status: { in: ['PENDING', 'PROCESSING'] } },
            orderBy: { scheduledAt: 'asc' },
            take: 500,
            include: { sender: true },
        });
        res.json(emails);
    } catch (error) {
        logFailure('Loading scheduled emails', error);
        res.status(500).json({ error: 'Unable to load scheduled emails' });
    }
};

export const getSentEmails = async (req: Request, res: Response) => {
    try {
        const sender = await prisma.sender.findUnique({
            where: { email: req.authenticatedEmail },
            select: { id: true },
        });
        if (!sender) return res.json([]);

        const emails = await prisma.email.findMany({
            where: { senderId: sender.id, status: { in: ['SENT', 'FAILED'] } },
            orderBy: { createdAt: 'desc' },
            take: 500,
            include: { sender: true },
        });
        res.json(emails);
    } catch (error) {
        logFailure('Loading sent emails', error);
        res.status(500).json({ error: 'Unable to load sent emails' });
    }
};

export const getEmailById = async (req: Request, res: Response) => {
    try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const email = await prisma.email.findFirst({
            where: { id, sender: { email: req.authenticatedEmail } },
            include: { sender: true },
        });

        if (!email) return res.status(404).json({ error: 'Email not found' });
        res.json(email);
    } catch (error) {
        logFailure('Loading email', error);
        res.status(500).json({ error: 'Unable to load email' });
    }
};

export const getEmailSearch = async (req: Request, res: Response) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (query.length < 2 || query.length > 200) {
        return res.status(400).json({ error: 'Search query must be between 2 and 200 characters' });
    }

    try {
        const results = await searchEmails(req.authenticatedEmail || '', query);
        res.json(results);
    } catch (error) {
        if (error instanceof Error && error.message === 'Elasticsearch search is not configured') {
            return res.status(503).json({ error: error.message });
        }
        logFailure('Searching emails', error);
        res.status(503).json({ error: 'Email search is temporarily unavailable' });
    }
};

export const getQueueOverview = async (req: Request, res: Response) => {
    try {
        const sender = await prisma.sender.findUnique({
            where: { email: req.authenticatedEmail },
            select: { id: true },
        });
        if (!sender) {
            return res.json({ counts: { waiting: 0, active: 0, delayed: 0, failed: 0 }, jobs: [] });
        }

        const jobs = await emailQueue.getJobs(
            ['waiting', 'active', 'delayed', 'failed'],
            0,
            499,
        );
        const ownedJobs = jobs.filter((job) => job.data.senderId === sender.id);
        const detailedJobs = await Promise.all(ownedJobs.map(async (job) => ({
            id: job.id,
            name: job.name,
            state: await job.getState(),
            emailId: job.data.emailId,
            timestamp: job.timestamp,
            processedOn: job.processedOn,
            delay: job.delay,
            failedReason: job.failedReason,
        })));
        const counts = detailedJobs.reduce<Record<string, number>>((result, job) => {
            result[job.state] = (result[job.state] || 0) + 1;
            return result;
        }, { waiting: 0, active: 0, delayed: 0, failed: 0 });

        res.json({ counts, jobs: detailedJobs });
    } catch (error) {
        logFailure('Loading queue overview', error);
        res.status(503).json({ error: 'Queue dashboard is temporarily unavailable' });
    }
};

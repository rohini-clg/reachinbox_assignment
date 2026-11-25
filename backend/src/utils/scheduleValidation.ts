export interface ValidScheduleRequest {
    subject: string;
    body: string;
    recipients: string[];
    startTime: Date;
    delayBetweenEmails: number;
    hourlyLimit: number;
}

export class ScheduleValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ScheduleValidationError';
    }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateScheduleRequest(
    input: unknown,
    defaults: { delayBetweenEmails: number; hourlyLimit: number },
    now = Date.now(),
): ValidScheduleRequest {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new ScheduleValidationError('Request body must be an object');
    }

    const body = input as Record<string, unknown>;
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const content = typeof body.body === 'string' ? body.body.trim() : '';

    if (!subject || subject.length > 255) {
        throw new ScheduleValidationError('Subject is required and must be at most 255 characters');
    }
    if (!content || content.length > 100_000) {
        throw new ScheduleValidationError('Body is required and must be at most 100000 characters');
    }
    if (!Array.isArray(body.recipients) || body.recipients.length === 0 || body.recipients.length > 1000) {
        throw new ScheduleValidationError('Recipients must contain between 1 and 1000 email addresses');
    }

    const recipients = Array.from(
        new Set(
            body.recipients.map((recipient) => {
                if (typeof recipient !== 'string' || !EMAIL_PATTERN.test(recipient.trim())) {
                    throw new ScheduleValidationError('Every recipient must be a valid email address');
                }
                return recipient.trim().toLowerCase();
            }),
        ),
    );

    const startTime = typeof body.startTime === 'string' ? new Date(body.startTime) : new Date(Number.NaN);
    if (!Number.isFinite(startTime.getTime()) || startTime.getTime() < now) {
        throw new ScheduleValidationError('Start time must be a valid date in the future');
    }

    const delayBetweenEmails = body.delayBetweenEmails === undefined
        ? defaults.delayBetweenEmails
        : Number(body.delayBetweenEmails);
    const hourlyLimit = body.hourlyLimit === undefined
        ? defaults.hourlyLimit
        : Number(body.hourlyLimit);

    if (!Number.isInteger(delayBetweenEmails) || delayBetweenEmails < 1 || delayBetweenEmails > 60_000) {
        throw new ScheduleValidationError('Delay must be an integer between 1 and 60000 milliseconds');
    }
    if (!Number.isInteger(hourlyLimit) || hourlyLimit < 1 || hourlyLimit > 100_000) {
        throw new ScheduleValidationError('Hourly limit must be an integer between 1 and 100000');
    }

    return { subject, body: content, recipients, startTime, delayBetweenEmails, hourlyLimit };
}

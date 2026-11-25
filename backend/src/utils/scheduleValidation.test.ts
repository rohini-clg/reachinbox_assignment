import assert from 'node:assert/strict';
import test from 'node:test';
import { ScheduleValidationError, validateScheduleRequest } from './scheduleValidation';

const now = Date.parse('2026-01-01T00:00:00.000Z');
const defaults = { delayBetweenEmails: 2000, hourlyLimit: 200 };

test('normalizes and deduplicates recipient addresses', () => {
    const request = validateScheduleRequest({
        subject: '  Follow up  ',
        body: '  Hello  ',
        recipients: ['Person@example.com', 'person@example.com'],
        startTime: '2026-01-01T01:00:00.000Z',
    }, defaults, now);

    assert.deepEqual(request.recipients, ['person@example.com']);
    assert.equal(request.subject, 'Follow up');
    assert.equal(request.delayBetweenEmails, 2000);
    assert.equal(request.hourlyLimit, 200);
});

test('rejects invalid addresses and past schedule times', () => {
    assert.throws(
        () => validateScheduleRequest({
            subject: 'Hello',
            body: 'Message',
            recipients: ['not-an-email'],
            startTime: '2026-01-01T01:00:00.000Z',
        }, defaults, now),
        ScheduleValidationError,
    );
    assert.throws(
        () => validateScheduleRequest({
            subject: 'Hello',
            body: 'Message',
            recipients: ['person@example.com'],
            startTime: '2025-12-31T23:59:59.000Z',
        }, defaults, now),
        ScheduleValidationError,
    );
});

test('rejects oversized batches and invalid throttling values', () => {
    assert.throws(
        () => validateScheduleRequest({
            subject: 'Hello',
            body: 'Message',
            recipients: Array.from({ length: 1001 }, (_, index) => `person${index}@example.com`),
            startTime: '2026-01-01T01:00:00.000Z',
        }, defaults, now),
        /between 1 and 1000/,
    );
    assert.throws(
        () => validateScheduleRequest({
            subject: 'Hello',
            body: 'Message',
            recipients: ['person@example.com'],
            startTime: '2026-01-01T01:00:00.000Z',
            delayBetweenEmails: 0,
        }, defaults, now),
        /Delay must be an integer/,
    );
});

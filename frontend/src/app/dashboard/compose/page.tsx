'use client';

import { ChangeEvent, useState } from 'react';
import { ArrowLeft, Send, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import axios from 'axios';

export default function ComposePage() {
    const router = useRouter();
    const { data: session } = useSession();
    const [recipients, setRecipients] = useState<string[]>([]);
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [startTime, setStartTime] = useState('');
    const [delayBetweenEmails, setDelayBetweenEmails] = useState('2000');
    const [hourlyLimit, setHourlyLimit] = useState('200');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');
    const [fileError, setFileError] = useState('');
    const [idempotencyKey, setIdempotencyKey] = useState('');

    const edited = () => setIdempotencyKey('');

    const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        setFileError('');
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            setFileError('Choose a CSV or text file smaller than 2 MB.');
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onerror = () => setFileError('The selected file could not be read.');
        reader.onload = () => {
            const text = typeof reader.result === 'string' ? reader.result : '';
            const emails = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
            const uniqueEmails = Array.from(new Set(emails.map((email) => email.toLowerCase())));
            setRecipients(uniqueEmails);
            setFileError(uniqueEmails.length ? '' : 'No email addresses were found in that file.');
        };
        reader.readAsText(file);
        event.target.value = '';
    };

    const handleSchedule = async () => {
        setError('');
        if (!subject.trim() || !body.trim() || recipients.length === 0 || !startTime) {
            setError('Enter a subject, message, at least one recipient, and a start time.');
            return;
        }
        if (!session?.user?.email) {
            setError('Your sign-in session has expired. Sign in again to continue.');
            return;
        }

        setLoading(true);
        const requestId = idempotencyKey || crypto.randomUUID();
        setIdempotencyKey(requestId);
        try {
            await axios.post('/api/emails/schedule', {
                subject: subject.trim(),
                body: body.trim(),
                recipients,
                startTime: new Date(startTime).toISOString(),
                delayBetweenEmails: Number(delayBetweenEmails),
                hourlyLimit: Number(hourlyLimit),
            }, {
                headers: { 'Idempotency-Key': requestId },
            });
            setIdempotencyKey('');
            setSuccess(true);
            window.setTimeout(() => router.push('/dashboard'), 1200);
        } catch (requestError) {
            const message = axios.isAxiosError<{ error?: string }>(requestError)
                ? requestError.response?.data?.error
                : undefined;
            setError(message || 'Unable to schedule emails. Check the backend connection and try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-full flex flex-col pt-4">
            <div className="px-8 flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard" aria-label="Back to dashboard" className="text-gray-400 hover:text-gray-600"><ArrowLeft size={20} /></Link>
                    <h1 className="text-xl font-semibold">Compose New Email</h1>
                </div>
                <button
                    type="button"
                    onClick={handleSchedule}
                    disabled={loading || success}
                    className="px-6 py-2 bg-green-500 text-white rounded-full text-sm font-medium hover:bg-green-600 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                    {success ? <><CheckCircle size={16} /> Scheduled!</> : loading ? 'Scheduling…' : 'Schedule Emails'}
                </button>
            </div>

            <div className="px-8 md:px-16 lg:px-32 flex-1 relative">
                <div className="flex flex-col gap-6">
                    <div className="flex items-center gap-4">
                        <label htmlFor="sender" className="text-gray-400 w-24">From</label>
                        <input id="sender" readOnly value={session?.user?.email || ''} className="bg-gray-50 px-3 py-1.5 rounded-lg text-sm" />
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-4">
                            <label htmlFor="recipients" className="text-gray-400 w-24">To</label>
                            <input
                                id="recipients"
                                type="text"
                                placeholder="recipient@example.com, another@example.com"
                                value={recipients.join(', ')}
                                onChange={(event) => {
                                    edited();
                                    setRecipients(event.target.value.split(',').map((email) => email.trim()).filter(Boolean));
                                }}
                                className="flex-1 outline-none border-b border-gray-100 focus:border-green-500 py-1"
                            />
                            <label className="text-green-600 text-sm font-medium cursor-pointer hover:underline flex items-center gap-1">
                                <Send size={14} className="-rotate-45" /> Upload List
                                <input type="file" className="hidden" accept=".csv,.txt,text/csv,text/plain" onChange={handleFileUpload} />
                            </label>
                        </div>
                        {recipients.length > 0 && <p className="ml-28 text-xs text-gray-400">{recipients.length} unique recipient(s)</p>}
                        {fileError && <p role="alert" className="ml-28 text-sm text-red-600">{fileError}</p>}
                    </div>

                    <div className="flex items-center gap-4">
                        <label htmlFor="subject" className="text-gray-400 w-24">Subject</label>
                        <input id="subject" type="text" maxLength={255} placeholder="Subject" value={subject} onChange={(event) => { edited(); setSubject(event.target.value); }} className="flex-1 outline-none border-b border-gray-100 focus:border-green-500 py-1" />
                    </div>

                    <div className="flex items-center gap-4">
                        <label htmlFor="start-time" className="text-gray-400 w-24">Start Time</label>
                        <input id="start-time" type="datetime-local" value={startTime} onChange={(event) => { edited(); setStartTime(event.target.value); }} className="bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200 outline-none text-sm" />
                    </div>

                    <div className="flex flex-wrap items-center gap-8 border-t border-gray-50 pt-6">
                        <div className="flex items-center gap-3">
                            <label htmlFor="delay" className="text-gray-400 text-sm">Delay between emails (ms)</label>
                            <input id="delay" type="number" min="1" max="60000" value={delayBetweenEmails} onChange={(event) => { edited(); setDelayBetweenEmails(event.target.value); }} className="w-24 h-10 bg-gray-50 rounded-lg text-center outline-none border border-gray-100" />
                        </div>
                        <div className="flex items-center gap-3">
                            <label htmlFor="hourly-limit" className="text-gray-400 text-sm">Hourly Limit</label>
                            <input id="hourly-limit" type="number" min="1" value={hourlyLimit} onChange={(event) => { edited(); setHourlyLimit(event.target.value); }} className="w-24 h-10 bg-gray-50 rounded-lg text-center outline-none border border-gray-100" />
                        </div>
                    </div>

                    <textarea
                        aria-label="Email body"
                        placeholder="Type your email content..."
                        value={body}
                        onChange={(event) => { edited(); setBody(event.target.value); }}
                        maxLength={100000}
                        className="w-full h-64 outline-none resize-y text-gray-600 leading-relaxed border border-gray-100 rounded-lg p-4"
                    />
                    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                    {success && <p role="status" className="text-sm text-green-700">Email(s) scheduled successfully.</p>}
                </div>
            </div>
        </div>
    );
}

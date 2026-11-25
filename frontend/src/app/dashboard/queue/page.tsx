'use client';

import axios from 'axios';
import { useCallback, useEffect, useState } from 'react';

interface QueueJob {
    id: string;
    state: string;
    emailId: string;
    timestamp: number;
    processedOn?: number;
    delay: number;
    failedReason?: string;
}

interface QueueOverview {
    counts: Record<string, number>;
    jobs: QueueJob[];
}

export default function QueuePage() {
    const [overview, setOverview] = useState<QueueOverview | null>(null);
    const [error, setError] = useState('');
    const [slackConnected, setSlackConnected] = useState(false);
    const [slackError, setSlackError] = useState('');
    const [slackLoading, setSlackLoading] = useState(false);

    const refresh = useCallback(async () => {
        try {
            const response = await axios.get<QueueOverview>('/api/emails/queue');
            setOverview(response.data);
            setError('');
        } catch (requestError) {
            setError(axios.isAxiosError<{ error?: string }>(requestError)
                ? requestError.response?.data?.error || 'Unable to load queue status.'
                : 'Unable to load queue status.');
        }
    }, []);

    useEffect(() => {
        const initialRefresh = window.setTimeout(() => void refresh(), 0);
        const timer = window.setInterval(() => void refresh(), 5000);
        void axios.get<{ connected: boolean }>('/api/slack')
            .then((response) => setSlackConnected(response.data.connected))
            .catch(() => setSlackError('Slack connection status is unavailable.'));
        return () => {
            window.clearTimeout(initialRefresh);
            window.clearInterval(timer);
        };
    }, [refresh]);

    const connectSlack = async () => {
        setSlackLoading(true);
        setSlackError('');
        try {
            const response = await axios.post<{ authorizationUrl: string }>('/api/slack');
            window.location.assign(response.data.authorizationUrl);
        } catch (requestError) {
            setSlackError(axios.isAxiosError<{ error?: string }>(requestError)
                ? requestError.response?.data?.error || 'Unable to start Slack OAuth.'
                : 'Unable to start Slack OAuth.');
            setSlackLoading(false);
        }
    };

    const disconnectSlack = async () => {
        setSlackLoading(true);
        setSlackError('');
        try {
            await axios.delete('/api/slack');
            setSlackConnected(false);
        } catch {
            setSlackError('Unable to disconnect Slack.');
        } finally {
            setSlackLoading(false);
        }
    };

    return (
        <section className="p-8">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-xl font-semibold">Email queue</h1>
                <div className="flex items-center gap-4">
                    <p className="text-sm text-gray-500">Auto-refreshes every 5 seconds</p>
                    <button
                        type="button"
                        disabled={slackLoading}
                        onClick={slackConnected ? disconnectSlack : connectSlack}
                        className="rounded-full border border-purple-200 px-4 py-2 text-sm text-purple-700 disabled:opacity-50"
                    >
                        {slackLoading ? 'Connecting…' : slackConnected ? 'Disconnect Slack' : 'Connect Slack'}
                    </button>
                </div>
            </div>
            {slackError && <p role="alert" className="mb-4 text-sm text-red-600">{slackError}</p>}
            {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
            {!overview && !error && <p role="status" className="text-gray-500">Loading queue…</p>}
            {overview && (
                <>
                    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                        {['waiting', 'active', 'delayed', 'failed'].map((state) => (
                            <div key={state} className="rounded-lg border border-gray-100 p-4">
                                <p className="text-sm capitalize text-gray-500">{state}</p>
                                <p className="mt-1 text-2xl font-semibold">{overview.counts[state] || 0}</p>
                            </div>
                        ))}
                    </div>
                    {overview.jobs.length === 0 ? (
                        <p className="text-gray-500">No recent queue jobs.</p>
                    ) : (
                        <div className="overflow-x-auto rounded-lg border border-gray-100">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-gray-600">
                                    <tr>
                                        <th className="p-3">Job</th>
                                        <th className="p-3">State</th>
                                        <th className="p-3">Queued</th>
                                        <th className="p-3">Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {overview.jobs.map((job) => (
                                        <tr key={job.id} className="border-t border-gray-100">
                                            <td className="p-3 font-mono">{job.id}</td>
                                            <td className="p-3 capitalize">{job.state}</td>
                                            <td className="p-3">{new Date(job.timestamp).toLocaleString()}</td>
                                            <td className="max-w-sm truncate p-3 text-red-600">{job.failedReason || job.emailId}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}

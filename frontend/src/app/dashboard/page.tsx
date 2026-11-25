"use client"
import { Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';

interface Email {
    id: string;
    to: string;
    subject: string;
    body: string;
    scheduledAt: string;
    status: string;
}

export default function DashboardPage() {
    const [emails, setEmails] = useState<Email[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const router = useRouter();
    const searchParams = useSearchParams();
    const query = searchParams.get('search')?.trim() || '';

    useEffect(() => {
        const fetchScheduledEmails = async () => {
            setLoading(true);
            setError('');
            try {
                const response = query
                    ? await axios.get('/api/emails/search', { params: { q: query } })
                    : await axios.get('/api/emails/scheduled');
                setEmails(response.data);
            } catch (error) {
                console.error('Failed to fetch scheduled emails:', error);
                setError(axios.isAxiosError<{ error?: string }>(error)
                    ? error.response?.data?.error || 'Unable to load emails.'
                    : 'Unable to load emails.');
            } finally {
                setLoading(false);
            }
        };

        fetchScheduledEmails();
    }, [query]);

    if (loading) {
        return (
            <div className="p-8 text-center text-gray-400">
                Loading scheduled emails...
            </div>
        );
    }

    if (emails.length === 0) {
        return (
            <div className="p-8 text-center text-gray-400">
                {error ? (
                    <div>
                        <p role="alert" className="text-red-600">{error}</p>
                        <button type="button" onClick={() => window.location.reload()} className="mt-3 text-green-700 underline">Retry</button>
                    </div>
                ) : (
                    <>
                        <p className="text-lg mb-2">{query ? 'No matching emails found' : 'No scheduled emails yet'}</p>
                <p className="text-sm">Click &quot;Compose&quot; to schedule your first email</p>
                    </>
                )}
            </div>
        );
    }

    return (
        <div className="p-8">
            {query && <h1 className="mb-4 text-lg font-semibold">Search results for &quot;{query}&quot;</h1>}
            <div className="flex flex-col gap-1">
                {emails.map((email) => (
                    <div 
                        key={email.id} 
                        onClick={() => router.push(`/dashboard/email/${email.id}`)}
                        className="flex items-center gap-4 py-3 border-b border-gray-50 hover:bg-gray-50/50 transition-colors px-4 group cursor-pointer"
                    >
                        <div className="w-1/4">
                            <span className="font-semibold text-sm">To: {email.to}</span>
                        </div>

                        <div className="flex-1 flex items-center gap-3">
                            <span className="bg-orange-50 text-orange-600 text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1 shrink-0">
                                <span className="w-2 h-2 rounded-full border border-orange-400"></span> 
                                {new Date(email.scheduledAt).toLocaleString()}
                            </span>
                            <span className="font-bold text-sm truncate">{email.subject} - </span>
                            <span className="text-gray-400 text-sm truncate">{email.body}</span>
                            <span className="text-xs text-gray-500">{email.status}</span>
                        </div>

                        <button 
                            onClick={(e) => e.stopPropagation()}
                            className="text-gray-300 hover:text-orange-400 transition-colors"
                        >
                            <Star size={18} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

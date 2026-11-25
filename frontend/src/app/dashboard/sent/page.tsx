"use client"
import { CheckCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

interface Email {
    id: string;
    to: string;
    subject: string;
    body: string;
    sentAt: string | null;
    createdAt: string;
    status: string;
}

export default function SentPage() {
    const [emails, setEmails] = useState<Email[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const router = useRouter();

    useEffect(() => {
        const fetchSentEmails = async () => {
            try {
                const response = await axios.get('/api/emails/sent');
                setEmails(response.data);
            } catch (error) {
                console.error('Failed to fetch sent emails:', error);
                setError(axios.isAxiosError<{ error?: string }>(error)
                    ? error.response?.data?.error || 'Unable to load sent emails.'
                    : 'Unable to load sent emails.');
            } finally {
                setLoading(false);
            }
        };

        fetchSentEmails();
    }, []);

    if (loading) {
        return (
            <div className="p-8 text-center text-gray-400">
                Loading sent emails...
            </div>
        );
    }

    if (emails.length === 0) {
        return (
            <div className="p-8 text-center text-gray-400">
                {error ? (
                    <>
                        <p role="alert" className="text-red-600">{error}</p>
                        <button type="button" onClick={() => window.location.reload()} className="mt-3 text-green-700 underline">Retry</button>
                    </>
                ) : (
                    <>
                        <p className="text-lg mb-2">No sent emails yet</p>
                        <p className="text-sm">Sent and failed emails will appear here</p>
                    </>
                )}
            </div>
        );
    }

    return (
        <div className="p-8">
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
                            <span className={`${email.status === 'SENT' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'} text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1 shrink-0`}>
                                <CheckCircle size={10} />
                                {email.status}
                            </span>
                            <span className="bg-gray-50 px-2 py-1 text-[10px] rounded">{new Date(email.sentAt || email.createdAt).toLocaleString()}</span>
                            <span className="font-bold text-sm truncate">{email.subject} - </span>
                            <span className="text-gray-400 text-sm truncate">{email.body}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

function LoginContent() {
    const searchParams = useSearchParams();
    const [loading, setLoading] = useState(false);
    const error = searchParams.get('error');

    return (
        <main className="min-h-screen bg-gray-900/90 flex items-center justify-center p-4">
            <section className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-12 flex flex-col items-center gap-8">
                <h1 className="text-4xl font-bold text-gray-800">Login</h1>
                <p className="text-center text-gray-500">Sign in with your Google account to access your email scheduler.</p>
                {error && (
                    <p role="alert" className="w-full rounded-lg bg-red-50 p-3 text-sm text-red-700">
                        Google sign-in failed. Check the OAuth configuration and try again.
                    </p>
                )}
                <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                        setLoading(true);
                        void signIn('google', { callbackUrl: '/dashboard' }).catch(() => setLoading(false));
                    }}
                    className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-green-50 text-[#00a854] rounded-lg font-semibold hover:bg-green-100 transition-colors border border-green-100 disabled:opacity-50"
                >
                    {loading ? 'Redirecting to Google…' : 'Continue with Google'}
                </button>
            </section>
        </main>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<main className="min-h-screen bg-gray-900/90" />}>
            <LoginContent />
        </Suspense>
    );
}

import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';

async function proxySlackRequest(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiToken = process.env.BACKEND_API_TOKEN;
    if (!apiToken) {
        return NextResponse.json({ error: 'Backend API is not configured' }, { status: 503 });
    }

    const backendPath = request.method === 'POST'
        ? 'slack/connect'
        : request.method === 'DELETE'
            ? 'slack'
            : 'slack/status';
    const backendUrl = new URL(
        backendPath,
        `${(process.env.BACKEND_API_URL || 'http://localhost:4000/api').replace(/\/+$/, '')}/`,
    );
    const response = await fetch(backendUrl, {
        method: request.method === 'DELETE' ? 'DELETE' : request.method,
        headers: {
            authorization: `Bearer ${apiToken}`,
            'x-user-email': session.user.email,
        },
        cache: 'no-store',
    });

    if (response.status === 204) return new NextResponse(null, { status: 204 });
    const payload = await response.json().catch(() => ({ error: 'Slack service returned an invalid response' }));
    return NextResponse.json(payload, { status: response.status });
}

export const GET = proxySlackRequest;
export const POST = proxySlackRequest;
export const DELETE = proxySlackRequest;

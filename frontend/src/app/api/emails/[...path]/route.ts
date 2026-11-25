import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxyEmailRequest(request: NextRequest, context: RouteContext) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiToken = process.env.BACKEND_API_TOKEN;
    if (!apiToken) {
        return NextResponse.json({ error: 'Backend API is not configured' }, { status: 503 });
    }

    const { path } = await context.params;
    const backendUrl = new URL(
        `emails/${path.map(encodeURIComponent).join('/')}`,
        `${(process.env.BACKEND_API_URL || 'http://localhost:4000/api').replace(/\/+$/, '')}/`,
    );
    backendUrl.search = request.nextUrl.search;

    const headers = new Headers({
        authorization: `Bearer ${apiToken}`,
        'x-user-email': session.user.email,
    });
    const contentType = request.headers.get('content-type');
    const idempotencyKey = request.headers.get('idempotency-key');
    if (contentType) headers.set('content-type', contentType);
    if (idempotencyKey) headers.set('idempotency-key', idempotencyKey);

    const body = request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : await request.text();
    const response = await fetch(backendUrl, {
        method: request.method,
        headers,
        body,
        cache: 'no-store',
    });
    return new NextResponse(response.body, {
        status: response.status,
        headers: {
            'content-type': response.headers.get('content-type') || 'application/json',
        },
    });
}

export const GET = proxyEmailRequest;
export const POST = proxyEmailRequest;

import { NextRequest, NextResponse } from 'next/server';
import { fetchFlexStatement, FlexServiceError } from '@/lib/brokers/ibkrFlexClient';
import { createLogger } from '@/lib/logger';

const log = createLogger('IBKR Flex');

// Fetches an IBKR Flex statement for the browser. The token is only forwarded to IBKR
// and is never logged or echoed back.
export async function POST(req: NextRequest) {
    let body: { token?: unknown; queryId?: unknown };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
    }

    try {
        const xml = await fetchFlexStatement({ token: String(body.token ?? ''), queryId: String(body.queryId ?? '') });
        return NextResponse.json({ xml });
    } catch (error) {
        if (error instanceof FlexServiceError) {
            return NextResponse.json(
                { error: error.message, code: error.code, retryable: error.retryable },
                { status: error.retryable ? 503 : 400 }
            );
        }
        log.error('Unexpected error');
        return NextResponse.json({ error: 'Abruf fehlgeschlagen.' }, { status: 500 });
    }
}

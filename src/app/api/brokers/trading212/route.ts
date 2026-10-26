import { NextRequest, NextResponse } from 'next/server';
import { fetchTrading212Data, Trading212Error } from '@/lib/brokers/trading212Client';
import { createLogger } from '@/lib/logger';
import { LANGUAGE_HEADER, MESSAGES, parseLanguage } from '@/lib/i18n';

const log = createLogger('Trading 212');

// Reads history and positions from Trading 212 for the browser. Credentials are only
// forwarded to Trading 212 and are never logged or echoed back.
export async function POST(req: NextRequest) {
    const t = MESSAGES[parseLanguage(req.headers.get(LANGUAGE_HEADER))];
    let body: { apiKey?: unknown; apiSecret?: unknown; environment?: unknown; since?: unknown };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: t.services.invalidRequest }, { status: 400 });
    }

    const since = typeof body.since === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.since) ? body.since : undefined;
    try {
        const data = await fetchTrading212Data(
            {
                apiKey: String(body.apiKey ?? ''),
                apiSecret: String(body.apiSecret ?? ''),
                environment: body.environment === 'demo' ? 'demo' : 'live'
            },
            { since, t }
        );
        return NextResponse.json({ data });
    } catch (error) {
        if (error instanceof Trading212Error) {
            const status = error.status === 401 || error.status === 403 || error.status === 0 ? 400 : 502;
            return NextResponse.json({ error: error.message }, { status });
        }
        log.error('Unexpected error');
        return NextResponse.json({ error: t.services.fetchFailed }, { status: 500 });
    }
}

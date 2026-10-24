import { NextRequest, NextResponse } from 'next/server';
import { fetchTrading212Data, Trading212Error } from '@/lib/brokers/trading212Client';

// Reads history and positions from Trading 212 for the browser. Credentials are only
// forwarded to Trading 212 and are never logged or echoed back.
export async function POST(req: NextRequest) {
    let body: { apiKey?: unknown; apiSecret?: unknown; environment?: unknown; since?: unknown };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
    }

    const since = typeof body.since === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.since) ? body.since : undefined;
    try {
        const data = await fetchTrading212Data(
            {
                apiKey: String(body.apiKey ?? ''),
                apiSecret: String(body.apiSecret ?? ''),
                environment: body.environment === 'demo' ? 'demo' : 'live'
            },
            { since }
        );
        return NextResponse.json({ data });
    } catch (error) {
        if (error instanceof Trading212Error) {
            const status = error.status === 401 || error.status === 403 || error.status === 0 ? 400 : 502;
            return NextResponse.json({ error: error.message }, { status });
        }
        console.error('[Trading 212] Unexpected error');
        return NextResponse.json({ error: 'Abruf fehlgeschlagen.' }, { status: 500 });
    }
}

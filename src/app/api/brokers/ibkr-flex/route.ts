import { NextRequest, NextResponse } from 'next/server';
import { isCrossSiteRequest, readJsonObject } from '@/lib/brokers/requestGuard';
import { fetchFlexStatement, FlexServiceError } from '@/lib/brokers/ibkrFlexClient';
import { createLogger } from '@/lib/logger';
import { LANGUAGE_HEADER, MESSAGES, parseLanguage } from '@/lib/i18n';

const log = createLogger('IBKR Flex');

// Fetches an IBKR Flex statement for the browser. The token is only forwarded to IBKR
// and is never logged or echoed back.
export async function POST(req: NextRequest) {
    const t = MESSAGES[parseLanguage(req.headers.get(LANGUAGE_HEADER))];
    if (isCrossSiteRequest(req)) return NextResponse.json({ error: t.services.crossSite }, { status: 403 });
    const body: { token?: unknown; queryId?: unknown } | null = await readJsonObject(req);
    if (!body) return NextResponse.json({ error: t.services.invalidRequest }, { status: 400 });

    try {
        const xml = await fetchFlexStatement({ token: String(body.token ?? ''), queryId: String(body.queryId ?? '') }, { t });
        return NextResponse.json({ xml });
    } catch (error) {
        if (error instanceof FlexServiceError) {
            return NextResponse.json(
                { error: error.message, code: error.code, retryable: error.retryable },
                { status: error.retryable ? 503 : 400 }
            );
        }
        log.error('Unexpected error');
        return NextResponse.json({ error: t.services.fetchFailed }, { status: 500 });
    }
}

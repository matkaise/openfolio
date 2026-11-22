import { NextRequest, NextResponse } from 'next/server';
import { completeComdirectLogin, ComdirectError, startComdirectLogin, type ComdirectLoginState } from '@/lib/brokers/comdirectClient';
import { createFlowStore } from '@/lib/brokers/flowStore';
import { isCrossSiteRequest, readJsonObject } from '@/lib/brokers/requestGuard';
import { createLogger } from '@/lib/logger';
import { type Messages, LANGUAGE_HEADER, MESSAGES, parseLanguage } from '@/lib/i18n';

const log = createLogger('comdirect');

// Two steps because comdirect needs a TAN: "start" logs in and returns the TAN challenge,
// "complete" activates the session with the TAN and returns depot and account data.
// The login state (tokens, client secret) stays in this server's memory for 5 minutes;
// the PIN is used once and not kept. Nothing is logged.
const flows = createFlowStore<ComdirectLoginState>(5 * 60 * 1000);

const errorResponse = (t: Messages, error: unknown) => {
    if (error instanceof ComdirectError) {
        return NextResponse.json({ error: error.message }, { status: error.status >= 500 ? 502 : 400 });
    }
    log.error('Unexpected error');
    return NextResponse.json({ error: t.services.fetchFailed }, { status: 500 });
};

export async function POST(req: NextRequest) {
    const t = MESSAGES[parseLanguage(req.headers.get(LANGUAGE_HEADER))];
    if (isCrossSiteRequest(req)) return NextResponse.json({ error: t.services.crossSite }, { status: 403 });
    const body = await readJsonObject(req);
    if (!body) return NextResponse.json({ error: t.services.invalidRequest }, { status: 400 });

    if (body.action === 'start') {
        try {
            const { state, challenge } = await startComdirectLogin({
                clientId: String(body.clientId ?? ''),
                clientSecret: String(body.clientSecret ?? ''),
                username: String(body.username ?? ''),
                pin: String(body.pin ?? '')
            }, { t });
            return NextResponse.json({ flowId: flows.put(state), challenge });
        } catch (error) {
            return errorResponse(t, error);
        }
    }

    if (body.action === 'complete') {
        const flowId = String(body.flowId ?? '');
        const waiting = flows.peek(flowId);
        if (!waiting) return NextResponse.json({ error: t.services.loginExpired }, { status: 400 });
        // A mistyped TAN (wrong length) keeps the login open for another try
        if (waiting.challengeType !== 'P_TAN_PUSH' && !/^\d{6}$/.test(typeof body.tan === 'string' ? body.tan : '')) {
            return NextResponse.json({ error: t.services.comdirect.tanDigits }, { status: 400 });
        }
        const state = flows.take(flowId);
        if (!state) return NextResponse.json({ error: t.services.loginExpired }, { status: 400 });
        try {
            const data = await completeComdirectLogin(state, typeof body.tan === 'string' ? body.tan : undefined, { t });
            return NextResponse.json({ data });
        } catch (error) {
            return errorResponse(t, error);
        }
    }

    if (body.action === 'cancel') {
        flows.take(String(body.flowId ?? ''));
        return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: t.services.unknownAction }, { status: 400 });
}

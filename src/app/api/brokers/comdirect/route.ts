import { NextRequest, NextResponse } from 'next/server';
import { completeComdirectLogin, ComdirectError, startComdirectLogin, type ComdirectLoginState } from '@/lib/brokers/comdirectClient';
import { createFlowStore } from '@/lib/brokers/flowStore';
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
    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: t.services.invalidRequest }, { status: 400 });
    }

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
        const state = flows.take(String(body.flowId ?? ''));
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

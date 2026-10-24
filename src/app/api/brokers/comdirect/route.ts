import { NextRequest, NextResponse } from 'next/server';
import { completeComdirectLogin, ComdirectError, startComdirectLogin, type ComdirectLoginState } from '@/lib/brokers/comdirectClient';
import { createFlowStore } from '@/lib/brokers/flowStore';

// Two steps because comdirect needs a TAN: "start" logs in and returns the TAN challenge,
// "complete" activates the session with the TAN and returns depot and account data.
// The login state (tokens, client secret) stays in this server's memory for 5 minutes;
// the PIN is used once and not kept. Nothing is logged.
const flows = createFlowStore<ComdirectLoginState>(5 * 60 * 1000);

const errorResponse = (error: unknown) => {
    if (error instanceof ComdirectError) {
        return NextResponse.json({ error: error.message }, { status: error.status >= 500 ? 502 : 400 });
    }
    console.error('[comdirect] Unexpected error');
    return NextResponse.json({ error: 'Abruf fehlgeschlagen.' }, { status: 500 });
};

export async function POST(req: NextRequest) {
    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
    }

    if (body.action === 'start') {
        try {
            const { state, challenge } = await startComdirectLogin({
                clientId: String(body.clientId ?? ''),
                clientSecret: String(body.clientSecret ?? ''),
                username: String(body.username ?? ''),
                pin: String(body.pin ?? '')
            });
            return NextResponse.json({ flowId: flows.put(state), challenge });
        } catch (error) {
            return errorResponse(error);
        }
    }

    if (body.action === 'complete') {
        const state = flows.take(String(body.flowId ?? ''));
        if (!state) return NextResponse.json({ error: 'Die Anmeldung ist abgelaufen. Bitte neu starten.' }, { status: 400 });
        try {
            const data = await completeComdirectLogin(state, typeof body.tan === 'string' ? body.tan : undefined);
            return NextResponse.json({ data });
        } catch (error) {
            return errorResponse(error);
        }
    }

    if (body.action === 'cancel') {
        flows.take(String(body.flowId ?? ''));
        return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unbekannte Aktion.' }, { status: 400 });
}

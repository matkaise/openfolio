import type { ComdirectData } from '@/lib/importers/comdirect';

// Server side only. Implements the login of the official comdirect REST API
// ("Schnittstellenspezifikation", chapter 2): password grant -> session -> TAN challenge
// -> session TAN activation -> cd_secondary token. Credentials, PIN and tokens are never
// logged or returned to the browser.
//
// Nothing here retries: five unanswered TAN challenges or three wrong TANs lock the
// online banking access.

const API = 'https://api.comdirect.de';
const PAGE_SIZE = 500;
const MAX_PAGES = 20;

export class ComdirectError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
        this.name = 'ComdirectError';
    }
}

export interface ComdirectCredentials {
    clientId: string;
    clientSecret: string;
    username: string; // Zugangsnummer
    pin: string;
}

export interface ComdirectChallenge {
    type: string; // P_TAN (photoTAN image), M_TAN (SMS), P_TAN_PUSH (app approval)
    challenge?: string; // P_TAN: base64 PNG, M_TAN: masked phone number
    availableTypes: string[];
}

/** Kept on the local server between the two steps; never sent to the browser. */
export interface ComdirectLoginState {
    clientId: string;
    clientSecret: string;
    accessToken: string;
    sessionIdentifier: string;
    challengeId: string;
    challengeType: string;
    requestSessionId: string;
}

type Deps = { fetchImpl?: (url: string, init: RequestInit & { headers: Record<string, string> }) => Promise<Response> };

const getFetch = (deps: Deps) => deps.fetchImpl ?? ((url: string, init: RequestInit) => fetch(url, init));

const requestInfo = (sessionId: string) => JSON.stringify({
    clientRequestId: { sessionId, requestId: String(Date.now()).slice(-9) }
});

const jsonHeaders = (accessToken: string, sessionId: string): Record<string, string> => ({
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    'x-http-request-info': requestInfo(sessionId)
});

/** The API reports errors as { messages: [{ message }] } (German). */
const apiMessage = async (res: Response): Promise<string> => {
    try {
        const body = await res.json() as { messages?: { message?: string }[]; error_description?: string };
        return body.messages?.map((m) => m.message).filter(Boolean).join(' ') || body.error_description || '';
    } catch {
        return '';
    }
};

const call = async (deps: Deps, url: string, init: RequestInit & { headers: Record<string, string> }, failure: string) => {
    let res: Response;
    try {
        res = await getFetch(deps)(url, init);
    } catch {
        throw new ComdirectError('comdirect ist nicht erreichbar.', 0);
    }
    if (!res.ok) {
        const detail = await apiMessage(res);
        throw new ComdirectError(`${failure}${detail ? `: ${detail}` : ''} (HTTP ${res.status})`, res.status);
    }
    return res;
};

const tokenRequest = (deps: Deps, form: Record<string, string>, failure: string) => call(deps, `${API}/oauth/token`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString()
}, failure);

export const startComdirectLogin = async (
    credentials: ComdirectCredentials,
    deps: Deps = {}
): Promise<{ state: ComdirectLoginState; challenge: ComdirectChallenge }> => {
    const { clientId, clientSecret, username, pin } = credentials;
    if (!clientId?.trim() || !clientSecret?.trim()) throw new ComdirectError('client_id und client_secret fehlen.', 0);
    if (!/^\d{8}$/.test(username || '')) throw new ComdirectError('Die Zugangsnummer hat acht Ziffern.', 0);
    if (!/^\d{4,8}$/.test(pin || '')) throw new ComdirectError('Die PIN hat ein ungültiges Format.', 0);

    // 2.1 Resource owner password credentials
    const tokenRes = await tokenRequest(deps, {
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
        grant_type: 'password',
        username,
        password: pin
    }, 'Anmeldung abgelehnt (Zugangsdaten prüfen)');
    const { access_token: accessToken } = await tokenRes.json() as { access_token?: string };
    if (!accessToken) throw new ComdirectError('comdirect hat kein Token geliefert.', 0);

    const requestSessionId = crypto.randomUUID();

    // 2.2 Session status
    const sessionRes = await call(deps, `${API}/api/session/clients/user/v1/sessions`, {
        method: 'GET',
        headers: jsonHeaders(accessToken, requestSessionId)
    }, 'Session konnte nicht abgerufen werden');
    const sessionBody = await sessionRes.json() as { identifier?: string } | { identifier?: string }[];
    const sessionIdentifier = (Array.isArray(sessionBody) ? sessionBody[0] : sessionBody)?.identifier;
    if (!sessionIdentifier) throw new ComdirectError('comdirect hat keine Session geliefert.', 0);

    // 2.3 Request a TAN challenge for the session
    const validateRes = await call(deps, `${API}/api/session/clients/user/v1/sessions/${encodeURIComponent(sessionIdentifier)}/validate`, {
        method: 'POST',
        headers: jsonHeaders(accessToken, requestSessionId),
        body: JSON.stringify({ identifier: sessionIdentifier, sessionTanActive: true, activated2FA: true })
    }, 'TAN-Anforderung fehlgeschlagen');
    const rawInfo = validateRes.headers.get('x-once-authentication-info');
    let info: { id?: string; typ?: string; challenge?: string; availableTypes?: string[] } = {};
    try {
        info = rawInfo ? JSON.parse(rawInfo) : {};
    } catch {
        info = {};
    }
    if (!info.id || !info.typ) throw new ComdirectError('comdirect hat keine TAN-Challenge geliefert.', 0);

    return {
        state: {
            clientId: clientId.trim(),
            clientSecret: clientSecret.trim(),
            accessToken,
            sessionIdentifier,
            challengeId: info.id,
            challengeType: info.typ,
            requestSessionId
        },
        challenge: { type: info.typ, ...(info.challenge ? { challenge: info.challenge } : {}), availableTypes: info.availableTypes || [] }
    };
};

/** Pages through a list resource ({ paging: { index, matches }, values }). */
const fetchAll = async <T>(deps: Deps, url: string, headers: () => Record<string, string>, failure: string): Promise<T[]> => {
    const items: T[] = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
        const separator = url.includes('?') ? '&' : '?';
        const res = await call(deps, `${url}${separator}paging-first=${items.length}&paging-count=${PAGE_SIZE}`, { method: 'GET', headers: headers() }, failure);
        const body = await res.json() as { paging?: { matches?: number }; values?: T[] };
        const values = body.values || [];
        items.push(...values);
        const total = body.paging?.matches ?? items.length;
        // Stop when complete, or when the API ignores the paging parameters
        if (values.length === 0 || items.length >= total) break;
    }
    return items;
};

export const completeComdirectLogin = async (
    state: ComdirectLoginState,
    tan: string | undefined,
    deps: Deps = {}
): Promise<ComdirectData> => {
    const isPush = state.challengeType === 'P_TAN_PUSH';
    if (!isPush && !/^\d{6}$/.test(tan || '')) throw new ComdirectError('Bitte die sechsstellige TAN eingeben.', 0);

    // 2.4 Activate the session TAN
    await call(deps, `${API}/api/session/clients/user/v1/sessions/${encodeURIComponent(state.sessionIdentifier)}`, {
        method: 'PATCH',
        headers: {
            ...jsonHeaders(state.accessToken, state.requestSessionId),
            'x-once-authentication-info': JSON.stringify({ id: state.challengeId }),
            ...(isPush ? {} : { 'x-once-authentication': tan as string })
        },
        body: JSON.stringify({ identifier: state.sessionIdentifier, sessionTanActive: true, activated2FA: true })
    }, isPush ? 'Freigabe in der photoTAN-App nicht erkannt' : 'TAN wurde nicht akzeptiert');

    // 2.5 cd_secondary: token with banking and brokerage rights
    const secondaryRes = await tokenRequest(deps, {
        client_id: state.clientId,
        client_secret: state.clientSecret,
        grant_type: 'cd_secondary',
        token: state.accessToken
    }, 'Zugriffstoken konnte nicht erstellt werden');
    const { access_token: token } = await secondaryRes.json() as { access_token?: string };
    if (!token) throw new ComdirectError('comdirect hat kein Zugriffstoken geliefert.', 0);
    const headers = () => jsonHeaders(token, state.requestSessionId);

    try {
        const depotRes = await call(deps, `${API}/api/brokerage/clients/user/v3/depots`, { method: 'GET', headers: headers() }, 'Depot konnte nicht abgerufen werden');
        const depots = (await depotRes.json() as { values?: ComdirectData['depot'][] }).values || [];
        const depot = depots[0];
        if (!depot?.depotId) throw new ComdirectError('Kein Depot gefunden.', 404);

        const depotPath = `${API}/api/brokerage/v3/depots/${encodeURIComponent(depot.depotId)}`;
        const positions = await fetchAll<ComdirectData['positions'][number]>(deps, `${depotPath}/positions?with-attr=instrument`, headers, 'Depotpositionen konnten nicht abgerufen werden');
        const depotTransactions = await fetchAll<ComdirectData['depotTransactions'][number]>(deps, `${depotPath}/transactions`, headers, 'Depotumsätze konnten nicht abgerufen werden');
        const accountTransactions = depot.defaultSettlementAccountId
            ? await fetchAll<ComdirectData['accountTransactions'][number]>(
                deps,
                `${API}/api/banking/v1/accounts/${encodeURIComponent(depot.defaultSettlementAccountId)}/transactions?transactionState=BOOKED`,
                headers,
                'Kontoumsätze konnten nicht abgerufen werden'
            )
            : [];

        return { depot, positions, depotTransactions, accountTransactions };
    } finally {
        // 3.1.2 Revoke: ends token and session TAN; best effort
        await getFetch(deps)(`${API}/oauth/revoke`, {
            method: 'DELETE',
            headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Bearer ${token}` }
        }).catch(() => undefined);
    }
};

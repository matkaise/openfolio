import { parseFlexStatementResponse } from '@/lib/importers/ibkrFlex';
import { MESSAGES, type Messages } from '@/lib/i18n';

// Server side only (Next.js API route): the token goes from the browser to the local
// server and from there to IBKR, nowhere else. It must never appear in errors or logs.

const FLEX_BASE = 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService';
// IBKR limit: 1 request per second, 10 per minute and token. Keep the total under that.
const POLL_DELAYS_MS = [2000, 3000, 5000, 5000, 8000, 10000, 10000, 10000];

export class FlexServiceError extends Error {
    constructor(message: string, readonly code: number, readonly retryable: boolean) {
        super(message);
        this.name = 'FlexServiceError';
    }
}

type Deps = {
    fetchImpl?: (url: string) => Promise<Response>;
    sleep?: (ms: number) => Promise<void>;
    maxPolls?: number;
    /** Texts for error messages (the request's interface language); German by default. */
    t?: Messages;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const flexUrl = (endpoint: 'SendRequest' | 'GetStatement', token: string, q: string) => (
    `${FLEX_BASE}/${endpoint}?${new URLSearchParams({ t: token, q, v: '3' }).toString()}`
);

export const fetchFlexStatement = async (
    credentials: { token: string; queryId: string },
    deps: Deps = {}
): Promise<string> => {
    const { token, queryId } = credentials;
    const t = (deps.t ?? MESSAGES.de).services.ibkr;
    if (!/^[A-Za-z0-9]{8,64}$/.test(token || '')) throw new FlexServiceError(t.tokenFormat, 0, false);
    if (!/^\d{1,20}$/.test(queryId || '')) throw new FlexServiceError(t.queryIdFormat, 0, false);

    const fetchImpl = deps.fetchImpl ?? ((url: string) => fetch(url, { headers: { 'User-Agent': 'Openfolio/1.0' } }));
    const sleep = deps.sleep ?? defaultSleep;
    const maxPolls = deps.maxPolls ?? POLL_DELAYS_MS.length;

    const request = async (url: string): Promise<string> => {
        let res: Response;
        try {
            res = await fetchImpl(url);
        } catch {
            throw new FlexServiceError(t.unreachable, 0, true);
        }
        if (!res.ok) throw new FlexServiceError(t.http(res.status), res.status, res.status >= 500);
        return res.text();
    };

    const sent = parseFlexStatementResponse(await request(flexUrl('SendRequest', token, queryId)));
    if (!sent) throw new FlexServiceError(t.unexpected, 0, false);
    if (sent.status === 'fail') throw new FlexServiceError(`IBKR: ${sent.message} (Code ${sent.code})`, sent.code, sent.retryable);

    let lastError: FlexServiceError | null = null;
    for (let attempt = 0; attempt < maxPolls; attempt += 1) {
        await sleep(POLL_DELAYS_MS[Math.min(attempt, POLL_DELAYS_MS.length - 1)]);
        const body = await request(flexUrl('GetStatement', token, sent.referenceCode));
        const answer = parseFlexStatementResponse(body);
        if (!answer) return body; // the statement itself
        if (answer.status === 'success') continue;
        lastError = new FlexServiceError(`IBKR: ${answer.message} (Code ${answer.code})`, answer.code, answer.retryable);
        if (!answer.retryable) throw lastError;
    }
    throw lastError ?? new FlexServiceError(t.timeout, 0, true);
};

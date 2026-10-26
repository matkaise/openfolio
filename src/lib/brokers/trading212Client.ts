import type { Trading212Data } from '@/lib/importers/trading212';
import { MESSAGES, type Messages } from '@/lib/i18n';

// Server side only. API key and secret go from the browser to the local server and from
// there to Trading 212 as HTTP Basic auth; they are never logged or returned.

const HOSTS = { live: 'https://live.trading212.com', demo: 'https://demo.trading212.com' } as const;
const PAGE_LIMIT = 50;
// History endpoints allow 20 requests per minute: pace pages at 3 s.
const PAGE_DELAY_MS = 3000;
const MAX_PAGES = 200;
const MAX_RATE_LIMIT_RETRIES = 3;

export class Trading212Error extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
        this.name = 'Trading212Error';
    }
}

type Credentials = { apiKey: string; apiSecret: string; environment: 'live' | 'demo' };
type Deps = {
    fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
    sleep?: (ms: number) => Promise<void>;
    /** YYYY-MM-DD: stop paging once a page only has older items (lists are newest first). */
    since?: string;
    /** Texts for error messages (the request's interface language); German by default. */
    t?: Messages;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const toBase64 = (value: string) => (
    typeof Buffer !== 'undefined' ? Buffer.from(value).toString('base64') : btoa(value)
);

const itemDate = (item: Record<string, unknown>): string => {
    const fill = item.fill as { filledAt?: string } | undefined;
    const order = item.order as { createdAt?: string } | undefined;
    return String(fill?.filledAt || order?.createdAt || item.paidOn || item.dateTime || '').slice(0, 10);
};

export const fetchTrading212Data = async (credentials: Credentials, deps: Deps = {}): Promise<Trading212Data> => {
    const { apiKey, apiSecret, environment } = credentials;
    const t = (deps.t ?? MESSAGES.de).services.t212;
    if (!apiKey?.trim() || !apiSecret?.trim()) throw new Trading212Error(t.missingKeys, 0);
    if (environment !== 'live' && environment !== 'demo') throw new Trading212Error(t.unknownEnvironment, 0);

    const host = HOSTS[environment];
    const fetchImpl = deps.fetchImpl ?? ((url: string, init: RequestInit) => fetch(url, init));
    const sleep = deps.sleep ?? defaultSleep;
    const headers = { Authorization: `Basic ${toBase64(`${apiKey.trim()}:${apiSecret.trim()}`)}`, Accept: 'application/json' };

    const getJson = async (path: string): Promise<unknown> => {
        for (let attempt = 0; ; attempt += 1) {
            let res: Response;
            try {
                res = await fetchImpl(`${host}${path}`, { headers });
            } catch {
                throw new Trading212Error(t.unreachable, 0);
            }
            if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
                const reset = Number(res.headers.get('x-ratelimit-reset'));
                const waitMs = Number.isFinite(reset) && reset > 0 ? Math.max(1000, reset * 1000 - Date.now()) : 10000;
                await sleep(Math.min(waitMs, 60000));
                continue;
            }
            if (res.status === 401 || res.status === 403) {
                throw new Trading212Error(t.rejected, res.status);
            }
            if (!res.ok) throw new Trading212Error(t.http(res.status), res.status);
            return res.json();
        }
    };

    const paginate = async <T>(endpoint: string): Promise<T[]> => {
        const items: T[] = [];
        let path: string | null = `${endpoint}?limit=${PAGE_LIMIT}`;
        for (let page = 0; path && page < MAX_PAGES; page += 1) {
            if (page > 0) await sleep(PAGE_DELAY_MS);
            const body = await getJson(path) as { items?: T[]; nextPagePath?: string | null };
            const pageItems = body.items || [];
            items.push(...pageItems);
            const next = body.nextPagePath ?? null;
            if (next !== null && !next.startsWith(`${endpoint}?`)) {
                throw new Trading212Error(t.unexpectedPage, 0);
            }
            const reachedSince = deps.since && pageItems.length > 0
                && pageItems.every((item) => itemDate(item as Record<string, unknown>) < deps.since!);
            path = reachedSince ? null : next;
        }
        return items;
    };

    const orders = await paginate<Trading212Data['orders'][number]>('/api/v0/equity/history/orders');
    const dividends = await paginate<Trading212Data['dividends'][number]>('/api/v0/equity/history/dividends');
    const transactions = await paginate<Trading212Data['transactions'][number]>('/api/v0/equity/history/transactions');
    const positions = await getJson('/api/v0/equity/positions') as Trading212Data['positions'];

    return { orders, dividends, transactions, positions: Array.isArray(positions) ? positions : [] };
};

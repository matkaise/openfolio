/**
 * Checks for the local broker routes. They forward credentials to brokers, so only the
 * Openfolio page itself may call them: a page on another site could otherwise send a
 * "simple" request (text/plain, no preflight) to 127.0.0.1.
 */

type HeaderSource = { headers: { get(name: string): string | null }; url: string };

/** True when the request comes from another site than the app (Fetch Metadata, else Origin). */
export const isCrossSiteRequest = (req: HeaderSource): boolean => {
    const site = req.headers.get('sec-fetch-site');
    if (site) return site !== 'same-origin' && site !== 'none';
    const origin = req.headers.get('origin');
    if (!origin) return false; // same-origin GETs and non-browser clients send none
    try {
        return new URL(origin).host !== new URL(req.url).host;
    } catch {
        return true;
    }
};

/** The parsed body if it is a JSON object; `null`, arrays and other values are rejected. */
export const readJsonObject = async (req: { json(): Promise<unknown> }): Promise<Record<string, unknown> | null> => {
    try {
        const body = await req.json();
        return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
    } catch {
        return null;
    }
};

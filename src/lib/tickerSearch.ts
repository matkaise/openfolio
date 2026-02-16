export type CompanyMatch = {
    symbol: string;
    name?: string;
    exchange?: string;
    currency?: string;
    quoteType?: string;
};

export type ResolveTickerResult = {
    status: 'resolved' | 'unresolved' | 'error';
    symbol?: string;
    isin?: string;
    name?: string;
    currency?: string;
    source?: 'kursliste' | 'openfigi' | 'yahoo' | 'manual' | 'unknown';
    matchBy?: 'isin' | 'valor' | 'wkn' | 'symbol' | 'input';
};

export const searchCompanyMatches = async (query: string): Promise<CompanyMatch[]> => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    try {
        const res = await fetch('/api/ticker-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: trimmed })
        });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data?.matches) ? data.matches : [];
    } catch (e) {
        console.warn('[TickerSearch] Failed to search company matches', e);
        return [];
    }
};

export const resolveTicker = async (input: string, options?: { currency?: string; isin?: string }): Promise<ResolveTickerResult | null> => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    try {
        const res = await fetch('/api/resolve-ticker', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                input: trimmed,
                currency: options?.currency,
                isin: options?.isin
            })
        });
        if (!res.ok) return null;
        return res.json();
    } catch (e) {
        console.warn('[TickerSearch] Failed to resolve ticker', e);
        return null;
    }
};

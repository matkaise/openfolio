import { NextRequest, NextResponse } from 'next/server';

type SearchMatch = {
  symbol: string;
  name?: string;
  exchange?: string;
  currency?: string;
  quoteType?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = typeof body?.query === 'string' ? body.query.trim() : '';

    if (!query) {
      return NextResponse.json({ matches: [], error: 'Query required' }, { status: 400 });
    }

    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=12&newsCount=0`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    if (!res.ok) {
      return NextResponse.json({ matches: [], error: 'Search failed' }, { status: 502 });
    }

    const data = await res.json();
    const quotes = Array.isArray(data?.quotes) ? data.quotes : [];

    const seen = new Set<string>();
    const matches = quotes
      .filter((q: { symbol?: string }) => !!q?.symbol)
      .map((q: { symbol: string; shortname?: string; longname?: string; exchDisp?: string; exchange?: string; currency?: string; quoteType?: string }) => ({
        symbol: q.symbol,
        name: q.shortname || q.longname || q.symbol,
        exchange: q.exchDisp || q.exchange,
        currency: q.currency,
        quoteType: q.quoteType
      }))
      .filter((match: SearchMatch) => {
        if (!match.symbol) return false;
        if (seen.has(match.symbol)) return false;
        seen.add(match.symbol);
        return true;
      });

    return NextResponse.json({ matches });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Search failed';
    return NextResponse.json({ matches: [], error: message }, { status: 500 });
  }
}

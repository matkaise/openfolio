import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

type KurslisteEntry = {
  isin?: string;
  valorNumber?: string;
  wkn?: string;
  name?: string;
  currency?: string;
  type?: string;
  symbol?: string;
};

type ResolveStatus = 'resolved' | 'unresolved' | 'error';

type ResolveResult = {
  status: ResolveStatus;
  symbol?: string;
  isin?: string;
  name?: string;
  currency?: string;
  source?: 'kursliste' | 'openfigi' | 'yahoo';
  matchBy?: 'isin' | 'valor' | 'wkn' | 'symbol' | 'input';
  message?: string;
};

type ResolveRequest = {
  input?: string;
  currency?: string;
  isin?: string;
  name?: string;
};

type KurslisteIndex = {
  isin: Map<string, KurslisteEntry>;
  symbol: Map<string, KurslisteEntry>;
  valor: Map<string, KurslisteEntry>;
  wkn: Map<string, KurslisteEntry>;
};

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const WKN_REGEX = /^[A-Z0-9]{6}$/;

const EXCH_TO_YAHOO: Record<string, string> = {
  US: '',
  UA: '',
  UQ: '',
  UR: '',
  SW: '.SW',
  VX: '.SW',
  GY: '.DE',
  GR: '.F',
  GF: '.F',
  GS: '.SG',
  GM: '.MU',
  GH: '.HM',
  GD: '.DU',
  GB: '.BE',
  HA: '.HA',
  LN: '.L',
  NA: '.AS',
  FP: '.PA',
  IM: '.MI',
  SM: '.MC',
  BB: '.BR',
  PL: '.LS',
  AV: '.VI',
  DC: '.CO',
  FH: '.HE',
  SS: '.ST',
  NO: '.OL',
  CN: '.TO',
  CV: '.V',
  HK: '.HK',
  JP: '.T',
  AU: '.AX'
};

const MIC_TO_YAHOO: Record<string, string> = {
  XNYS: '',
  XNAS: '',
  XASE: '',
  ARCX: '',
  XSWX: '.SW',
  XVTX: '.SW',
  XETR: '.DE',
  XFRA: '.F',
  XLON: '.L',
  XAMS: '.AS',
  XPAR: '.PA',
  XMIL: '.MI',
  BMEX: '.MC',
  XBRU: '.BR',
  XLIS: '.LS',
  XWBO: '.VI',
  XCSE: '.CO',
  XHEL: '.HE',
  XSTO: '.ST',
  XOSL: '.OL',
  XTSE: '.TO',
  XTSX: '.V',
  XHKG: '.HK',
  XTKS: '.T',
  XASX: '.AX'
};

const COUNTRY_TO_YAHOO: Record<string, string> = {
  US: '',
  CA: '.TO',
  GB: '.L',
  CH: '.SW',
  DE: '.DE',
  FR: '.PA',
  NL: '.AS',
  IT: '.MI',
  ES: '.MC',
  BE: '.BR',
  PT: '.LS',
  AT: '.VI',
  DK: '.CO',
  FI: '.HE',
  SE: '.ST',
  NO: '.OL',
  IE: '.IR',
  LU: '.LU',
  LI: '.LI',
  GG: '.GG',
  HR: '.ZA',
  MT: '.MT',
  KY: '.KY',
  JE: '.L',
  VC: '',
  VG: '',
  BM: '',
  PA: '',
  EE: '.TL',
  PL: '.WA',
  GI: '.L',
  BS: '',
  JP: '.T',
  HK: '.HK',
  AU: '.AX'
};

let kurslisteCache: { loadedAt: number; entries: KurslisteEntry[]; index: KurslisteIndex } | null = null;

const normalize = (value: string) => value.trim().toUpperCase();
const normalizeSymbol = (value: string) => normalize(value).replace(/\s+/g, '');
const normalizeId = (value: string) => normalize(value).replace(/\s+/g, '');

const toIsinCountry = (isin?: string) => (isin && isin.length >= 2 ? isin.slice(0, 2).toUpperCase() : '');

const resolveLocalPath = async (): Promise<string | null> => {
  const envPath = process.env.KURSLISTE_PATH;
  if (envPath) return envPath;

  const candidate = path.resolve(process.cwd(), '..', 'Kursliste', 'ictax_clean_list.json');
  try {
    await fs.access(candidate);
    return candidate;
  } catch {
    return null;
  }
};

const loadKursliste = async (): Promise<{ entries: KurslisteEntry[]; index: KurslisteIndex } | null> => {
  const now = Date.now();
  if (kurslisteCache && now - kurslisteCache.loadedAt < CACHE_TTL_MS) {
    return kurslisteCache;
  }

  const url = process.env.KURSLISTE_URL;
  let raw: string | null = null;

  if (url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (res.ok) {
      raw = await res.text();
    } else {
      console.warn(`[ResolveTicker] Kursliste URL fetch failed: ${res.status}`);
    }
  }

  if (!raw) {
    const localPath = await resolveLocalPath();
    if (localPath) {
      raw = await fs.readFile(localPath, 'utf-8');
    }
  }

  if (!raw) {
    return null;
  }

  const entries = JSON.parse(raw) as KurslisteEntry[];
  const index: KurslisteIndex = {
    isin: new Map(),
    symbol: new Map(),
    valor: new Map(),
    wkn: new Map()
  };

  for (const entry of entries) {
    if (entry.isin) index.isin.set(normalizeId(entry.isin), entry);
    if (entry.symbol) index.symbol.set(normalizeSymbol(entry.symbol), entry);
    if (entry.valorNumber) index.valor.set(normalizeId(entry.valorNumber), entry);
    if (entry.wkn) index.wkn.set(normalizeId(entry.wkn), entry);
  }

  kurslisteCache = { loadedAt: now, entries, index };
  return kurslisteCache;
};

const findInKursliste = (index: KurslisteIndex, input: string) => {
  const normalized = normalizeId(input);
  const symbolNormalized = normalizeSymbol(input);

  if (index.isin.has(normalized)) return { entry: index.isin.get(normalized)!, matchBy: 'isin' as const };
  if (index.valor.has(normalized)) return { entry: index.valor.get(normalized)!, matchBy: 'valor' as const };
  if (index.wkn.has(normalized)) return { entry: index.wkn.get(normalized)!, matchBy: 'wkn' as const };
  if (index.symbol.has(symbolNormalized)) return { entry: index.symbol.get(symbolNormalized)!, matchBy: 'symbol' as const };

  const altSymbol = symbolNormalized.includes('.') ? symbolNormalized.replace('.', '-') : symbolNormalized.replace('-', '.');
  if (altSymbol && index.symbol.has(altSymbol)) return { entry: index.symbol.get(altSymbol)!, matchBy: 'symbol' as const };

  return null;
};

const normalizeTickerForYahoo = (ticker: string, suffix: string) => {
  if (!ticker) return '';
  let normalized = normalizeSymbol(ticker);
  if (!suffix && normalized.includes('.')) {
    normalized = normalized.replace(/\./g, '-');
  }
  return normalized;
};

const guessYahooSuffix = (exch?: string, mic?: string, isinCountry?: string) => {
  if (exch && EXCH_TO_YAHOO[exch] !== undefined) return EXCH_TO_YAHOO[exch];
  if (mic && MIC_TO_YAHOO[mic] !== undefined) return MIC_TO_YAHOO[mic];
  if (isinCountry && COUNTRY_TO_YAHOO[isinCountry] !== undefined) return COUNTRY_TO_YAHOO[isinCountry];
  return undefined;
};

const scoreCandidate = (suffix: string, currency?: string, resultCurrency?: string) => {
  let score = 0;
  if (currency && resultCurrency && currency === resultCurrency) score += 20;
  if (suffix === '' && currency === 'USD') score += 10;
  if (suffix === '.SW' && currency === 'CHF') score += 10;
  if (suffix === '.DE' && currency === 'EUR') score += 8;
  if (suffix === '.L' && currency === 'GBP') score += 8;
  return score;
};

const resolveViaOpenFigi = async (idType: string, idValue: string, currency?: string, isinCountry?: string) => {
  const apiKey = process.env.OPENFIGI_API_KEY;
  const body = [{ idType, idValue, ...(currency ? { currency } : {}) }];
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['X-OPENFIGI-APIKEY'] = apiKey;
  }
  const res = await fetch('https://api.openfigi.com/v3/mapping', {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ data?: Array<{ ticker?: string; exchCode?: string; mic?: string; currency?: string; name?: string }> }>;
  const results = data?.[0]?.data;
  if (!results || results.length === 0) return null;

  const candidates = results
    .map((result) => {
      const ticker = result.ticker;
      if (!ticker) return null;
      const exch = result.exchCode ? result.exchCode.trim().toUpperCase() : '';
      const micRaw = (result as { mic?: string; micCode?: string }).mic || (result as { micCode?: string }).micCode;
      const mic = micRaw ? micRaw.trim().toUpperCase() : '';
      const suffix = guessYahooSuffix(exch, mic, isinCountry);
      if (suffix === undefined) return null;

      const normalized = normalizeTickerForYahoo(ticker, suffix);
      if (!normalized) return null;

      return {
        symbol: `${normalized}${suffix}`,
        score: scoreCandidate(suffix, currency, result.currency),
        name: result.name,
        currency: result.currency
      };
    })
    .filter(Boolean) as Array<{ symbol: string; score: number; name?: string; currency?: string }>;

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
};

const resolveViaYahooSearch = async (query: string) => {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=6&newsCount=0`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0'
    }
  });
  if (!res.ok) return null;
  const data = await res.json();
  const quote = Array.isArray(data?.quotes) ? data.quotes.find((q: { symbol?: string }) => q?.symbol) : null;
  if (!quote?.symbol) return null;

  return {
    symbol: quote.symbol as string,
    name: quote.shortname || quote.longname || quote.symbol,
    currency: quote.currency
  };
};

const inferIdType = (value: string) => {
  const normalized = normalizeId(value);
  if (ISIN_REGEX.test(normalized)) return 'ID_ISIN';
  if (WKN_REGEX.test(normalized)) return 'ID_WERTPAPIER';
  if (/^[0-9]+$/.test(normalized) && normalized.length >= 5 && normalized.length <= 10) {
    return 'ID_WERTPAPIER';
  }
  return 'TICKER';
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ResolveRequest;
    const input = body.input?.trim();

    if (!input) {
      return NextResponse.json({ status: 'error', message: 'Input required' } satisfies ResolveResult, { status: 400 });
    }

    const kursliste = await loadKursliste();
    let kurslisteMatch: { entry: KurslisteEntry; matchBy: ResolveResult['matchBy'] } | null = null;

    if (kursliste?.index) {
      kurslisteMatch = findInKursliste(kursliste.index, input);
      if (kurslisteMatch?.entry?.symbol) {
        const entry = kurslisteMatch.entry;
        return NextResponse.json({
          status: 'resolved',
          symbol: entry.symbol,
          isin: entry.isin,
          name: entry.name,
          currency: entry.currency,
          source: 'kursliste',
          matchBy: kurslisteMatch.matchBy
        } satisfies ResolveResult);
      }
    }

    const fallbackEntry = kurslisteMatch?.entry;
    const bodyIsin = body.isin && ISIN_REGEX.test(normalizeId(body.isin)) ? body.isin : undefined;
    const candidateIsin = fallbackEntry?.isin || bodyIsin;
    const isinCountry = toIsinCountry(candidateIsin);
    const openFigiValue = candidateIsin || input;
    const openFigiType = candidateIsin ? 'ID_ISIN' : inferIdType(openFigiValue);

    const openFigi = await resolveViaOpenFigi(openFigiType, openFigiValue, body.currency, isinCountry);
    if (openFigi?.symbol) {
      return NextResponse.json({
        status: 'resolved',
        symbol: openFigi.symbol,
        isin: candidateIsin,
        name: openFigi.name || fallbackEntry?.name || body.name,
        currency: openFigi.currency || fallbackEntry?.currency || body.currency,
        source: 'openfigi',
        matchBy: 'input'
      } satisfies ResolveResult);
    }

    const yahoo = await resolveViaYahooSearch(input);
    if (yahoo?.symbol) {
      return NextResponse.json({
        status: 'resolved',
        symbol: yahoo.symbol,
        isin: candidateIsin,
        name: yahoo.name || fallbackEntry?.name || body.name,
        currency: yahoo.currency || fallbackEntry?.currency || body.currency,
        source: 'yahoo',
        matchBy: 'input'
      } satisfies ResolveResult);
    }

    return NextResponse.json({
      status: 'unresolved',
      isin: candidateIsin,
      name: fallbackEntry?.name || body.name,
      currency: fallbackEntry?.currency || body.currency,
      source: kurslisteMatch ? 'kursliste' : undefined,
      matchBy: kurslisteMatch?.matchBy
    } satisfies ResolveResult);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Resolve failed';
    return NextResponse.json({ status: 'error', message } satisfies ResolveResult, { status: 500 });
  }
}

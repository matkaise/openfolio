import { NextRequest, NextResponse } from 'next/server';
import { parseEcbXml } from '@/lib/ecbXml';

const ECB_URLS = {
    daily: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',
    '90d': 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml',
    hist: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml'
};

type EcbMode = keyof typeof ECB_URLS;

const parseMode = (value: string | null): EcbMode => (
    value === 'hist' || value === '90d' || value === 'daily' ? value : '90d'
);

export async function GET(request: NextRequest) {
    const mode = parseMode(request.nextUrl.searchParams.get('mode'));

    try {
        const url = ECB_URLS[mode];
        console.log(`[ECB Proxy] Fetching ${mode} data from ${url}`);

        const response = await fetch(url, { headers: { 'User-Agent': 'OpenParqet/1.0' } });

        if (!response.ok) {
            throw new Error(`ECB fetch failed: ${response.statusText}`);
        }

        const result = parseEcbXml(await response.text());

        return NextResponse.json({
            success: true,
            count: result.length,
            data: result
        });

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'ECB Proxy Error';
        console.error("ECB Proxy Error:", error);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

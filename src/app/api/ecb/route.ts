import { NextRequest, NextResponse } from 'next/server';

const ECB_URLS = {
    daily: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',
    hist: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml'
};

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get('mode') === 'hist' ? 'hist' : 'daily';

    try {
        const url = ECB_URLS[mode];
        console.log(`[ECB Proxy] Fetching ${mode} data from ${url}`);

        const response = await fetch(url, { headers: { 'User-Agent': 'OpenParqet/1.0' } });

        if (!response.ok) {
            throw new Error(`ECB fetch failed: ${response.statusText}`);
        }

        const xmlText = await response.text();

        // Simple XML Parsing using Regex to avoid heavy XML DOM dependencies
        // Structure: <Cube time="2023-10-27"> <Cube currency="USD" rate="1.05" /> ... </Cube>

        const result: any[] = [];
        const dateRegex = /<Cube time="(\d{4}-\d{2}-\d{2})">/g;
        let dateMatch;

        // Iterate over dates
        while ((dateMatch = dateRegex.exec(xmlText)) !== null) {
            const date = dateMatch[1];
            const rates: Record<string, number> = { EUR: 1 };

            // Find end of this date block or file
            const startIndex = dateMatch.index;
            const nextDateMatch = xmlText.slice(startIndex + 1).match(/<Cube time="/);
            const endIndex = nextDateMatch ? (startIndex + 1 + nextDateMatch.index!) : xmlText.length;
            const block = xmlText.slice(startIndex, endIndex);

            // Extract rates within block
            const rateRegex = /currency="([A-Z]{3})" rate="([\d.]+)"/g;
            let rateMatch;
            while ((rateMatch = rateRegex.exec(block)) !== null) {
                rates[rateMatch[1]] = parseFloat(rateMatch[2]);
            }

            result.push({ date, rates });
        }

        return NextResponse.json({
            success: true,
            count: result.length,
            data: result
        });

    } catch (error: any) {
        console.error("ECB Proxy Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

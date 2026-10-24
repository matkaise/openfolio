export type EcbDay = { date: string; rates: Record<string, number> };

// Minimal parser for the ECB eurofxref feeds (daily, hist-90d, hist):
// <Cube time="2023-10-27"> <Cube currency="USD" rate="1.05" /> ... </Cube>
export const parseEcbXml = (xmlText: string): EcbDay[] => {
    const result: EcbDay[] = [];
    const dateRegex = /<Cube time="(\d{4}-\d{2}-\d{2})">/g;
    let dateMatch: RegExpExecArray | null;

    while ((dateMatch = dateRegex.exec(xmlText)) !== null) {
        const date = dateMatch[1];
        const rates: Record<string, number> = { EUR: 1 };

        // The block runs until the next date or the end of the file
        const startIndex = dateMatch.index;
        const nextDateMatch = xmlText.slice(startIndex + 1).match(/<Cube time="/);
        const endIndex = nextDateMatch && nextDateMatch.index !== undefined
            ? (startIndex + 1 + nextDateMatch.index)
            : xmlText.length;
        const block = xmlText.slice(startIndex, endIndex);

        const rateRegex = /currency="([A-Z]{3})" rate="([\d.]+)"/g;
        let rateMatch;
        while ((rateMatch = rateRegex.exec(block)) !== null) {
            rates[rateMatch[1]] = parseFloat(rateMatch[2]);
        }

        result.push({ date, rates });
    }

    return result;
};

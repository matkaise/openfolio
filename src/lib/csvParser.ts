import { Transaction } from '../types/domain';

// Helper to parse Floats (handles "1.234,56" vs "1234.56")
// The sample provided shows DOT as decimal separator e.g. "-1.43", "1.0770".
// But German CSVs often use Comma. We will try to detect or strictly follow the sample.
// Sample: "21-01-2026,06:31,...-1.43" -> Dot decimal.
const parseNumber = (val: string): number => {
    if (!val) return 0;
    // Remove currency symbols if attached (though sample splits them)
    const clean = val.replace(/[^\d.-]/g, '');
    return parseFloat(clean);
};

const parseDate = (dateStr: string): string => {
    // Input: "21-01-2026" (DD-MM-YYYY)
    // Output: "2026-01-21" (ISO)
    if (!dateStr) return new Date().toISOString();
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return new Date().toISOString();
};

export const parseFlatexCsv = (text: string): Transaction[] => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const transactions: Transaction[] = [];

    // Header detection
    const header = lines[0];

    // Strategy 1: "Transactions.csv" (Trades)
    // Header: Datum,Uhrzeit,Produkt,ISIN,Referenzbörse,Ausführungsort,Anzahl,Kurs,,Wert in Lokalwährung...
    if (header.includes('Referenzbörse') && header.includes('Anzahl')) {
        console.log("Detected Flatex Transactions CSV");
        // Skip header
        for (let i = 1; i < lines.length; i++) {
            const row = parseCsvLine(lines[i]);
            if (row.length < 10) continue;

            // Map columns (Indices based on sample)
            // 0: Datum, 1: Uhrzeit, 2: Produkt, 3: ISIN, 4: Ref, 5: Ausf, 6: Anzahl, 7: Kurs, 8: empty?, 9: WertLocal
            const date = parseDate(row[0]);
            const isin = row[3];
            const name = row[2];
            const quantity = parseNumber(row[6]); // Negative for Sell? Sample: -1359 for Sell (Val positive).
            const price = parseNumber(row[7]);
            const currency = row[8] || 'EUR'; // Col 8 is currency name?
            // Sample: 6: 122, 7: 17.5559, 8: EUR

            // Logic:
            // Quantity > 0 => Buy (Cost negative)
            // Quantity < 0 => Sell (Revenue positive)

            let type: Transaction['type'] = 'Buy';
            if (quantity < 0) {
                type = 'Sell';
            }

            // Amount: "Wert in Lokalwährung" (Col 9?)
            // Sample line 2: 
            // 0: 01-12-2025, 1: 13:43, 2: WISDOM..., 3: GB..., 4: TDG, 5: XGAT, 6: 122, 7: 17.5559, 8: EUR, 9: -2141.82
            const amount = parseNumber(row[9]);

            transactions.push({
                id: crypto.randomUUID(),
                date,
                type,
                isin,
                name,
                shares: Math.abs(quantity),
                amount: amount, // Keep sign from CSV (Negative for Buy, Positive for Sell)
                currency: row[8],
                broker: 'Flatex',
                originalData: row
            });
        }
    }
    // Strategy 2: "Account.csv" (Dividends, Cash)
    // Header: Datum,Uhrze,Valutadatum,Produkt,ISIN,Beschreibung...
    else if (header.includes('Valutadatum') && header.includes('Beschreibung')) {
        console.log("Detected Flatex Account CSV");
        for (let i = 1; i < lines.length; i++) {
            const row = parseCsvLine(lines[i]);
            if (row.length < 6) continue;

            const description = row[5];
            const isin = row[4];

            // Interest
            if (description.includes('Zinsen') || description.includes('Interest')) {
                // Not strictly a transaction for portfolio perf unless we track Cash? 
                // Let's skip for now or add as 'Fee'/'Dividend'?
                // User goal is dividends mostly.
                // Line 5: Zinsen, Line 6: Flatex Interest Income
                // We'll treat Interest as a specialized Dividend? Or just ignore?
                // Use 'Dividend' type for now but name it Interest.
                const amount = parseNumber(row[7] || row[9]); // Col 7 or 9? 
                // Sample line 5: 6: CHF, 7: -287.33 (Amount), 8: CHF (SaldoCcy), 9: Saldo
                // Wait, Sample line 3: "Währungswechsel...", 6: 1.0770 (FX?), 7: EUR (Ccy?), 8: 1.54 (Amount?)

                // Let's look closely at Account.csv Line 10 (Dividend):
                // 30-12-2025,07:38,24-12-2025,ISHARES...,IE00BSKRJZ44,Dividende,,USD,2962.49,USD,2962.49,
                // Col 0: Datum
                // Col 3: Product
                // Col 4: ISIN
                // Col 5: Desc ("Dividende")
                // Col 6: FX (empty)
                // Col 7: Currency (USD)
                // Col 8: Amount (2962.49)

                const type: Transaction['type'] = 'Dividend';
                const date = parseDate(row[0]);

                transactions.push({
                    id: crypto.randomUUID(),
                    date,
                    type,
                    isin,
                    name: row[3] || 'Zinsen',
                    amount: parseNumber(row[8]),
                    currency: row[7],
                    broker: 'Flatex',
                    originalData: row
                });
            }

            // Dividend
            else if (description.includes('Dividende')) {
                const type: Transaction['type'] = 'Dividend';
                const date = parseDate(row[0]);
                const amount = parseNumber(row[8]);
                const currency = row[7];
                const isin = row[4];
                const name = row[3];

                transactions.push({
                    id: crypto.randomUUID(),
                    date,
                    type,
                    isin,
                    name,
                    amount,
                    currency,
                    broker: 'Flatex',
                    originalData: row
                });
            }
        }
    }

    return transactions;
};

// Simple CSV Splitter that handles quoted fields
// e.g. "Mes, XETB",123
const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result.map(c => c.trim().replace(/^"|"$/g, ''));
};

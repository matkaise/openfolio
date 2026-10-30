// Writes small PDFs for tests: Helvetica text at given positions, one content stream per page.
// Synthetic documents run through the real extraction (pdf.js), so tests cover text order,
// columns and page breaks, not only the importers' regular expressions.

/** One piece of text; x/y in points from the bottom left of an A4 page. */
export interface PdfTextRun {
    x: number;
    y: number;
    text: string;
    size?: number;
}

export interface SyntheticPage {
    runs: PdfTextRun[];
    /** Draws a filled rectangle instead of text, like a scanned page without a text layer. */
    imageOnly?: boolean;
}

// WinAnsiEncoding: Latin-1 for the umlauts, plus the few characters it places in 0x80–0x9f
const WIN_ANSI: Record<string, number> = { '€': 0x80, '•': 0x95, '–': 0x96, '—': 0x97 };

const encode = (text: string): string => Array.from(text).map((char) => {
    const code = WIN_ANSI[char] ?? char.charCodeAt(0);
    if (code > 0xff) throw new Error(`not encodable: ${char}`);
    if (char === '(' || char === ')' || char === '\\') return `\\${char}`;
    return code < 0x20 || code > 0x7e ? `\\${code.toString(8).padStart(3, '0')}` : char;
}).join('');

const content = (page: SyntheticPage): string => (page.imageOnly
    ? '0.5 g 50 50 495 742 re f'
    : page.runs.map((run) => `BT /F1 ${run.size || 10} Tf ${run.x} ${run.y} Td (${encode(run.text)}) Tj ET`).join('\n'));

/**
 * A PDF with one page per entry. Bytes are Latin-1, so the string maps 1:1 to the output.
 * `encrypted` adds a standard security handler whose user password is not empty, so a
 * reader has to ask for it (the content itself stays unencrypted; it is never reached).
 */
export const syntheticPdf = (pages: SyntheticPage[], options: { encrypted?: boolean } = {}): Uint8Array => {
    const objects: string[] = [];
    const add = (body: string) => objects.push(body) - 1 + 1; // object number
    const catalog = add('');
    const pagesId = add('');
    const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const kids = pages.map((page) => {
        const stream = content(page);
        const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
        return add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${contentId} 0 R >>`);
    });
    const encrypt = options.encrypted
        ? add(`<< /Filter /Standard /V 1 /R 2 /Length 40 /P -4 /O <${'ab'.repeat(32)}> /U <${'cd'.repeat(32)}> >>`)
        : 0;
    objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((id) => `${id} 0 R`).join(' ')}] /Count ${kids.length} >>`;

    let out = '%PDF-1.4\n';
    const offsets = objects.map((body, index) => {
        const offset = out.length;
        out += `${index + 1} 0 obj\n${body}\nendobj\n`;
        return offset;
    });
    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
    const security = encrypt ? ` /Encrypt ${encrypt} 0 R /ID [<${'01'.repeat(16)}> <${'01'.repeat(16)}>]` : '';
    out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R${security} >>\nstartxref\n${xref}\n%%EOF\n`;
    return Uint8Array.from(out, (char) => char.charCodeAt(0));
};

/**
 * Lays out lines top to bottom, one array per page, the way a settlement prints them:
 * a line is either text at the left margin or cells with their x position.
 */
export const pdfFromLines = (pages: (string | [number, string][])[][]): Uint8Array => syntheticPdf(pages.map((lines) => ({
    runs: lines.flatMap((line, index) => {
        const y = 800 - index * 14;
        return typeof line === 'string' ? [{ x: 50, y, text: line }] : line.map(([x, text]) => ({ x, y, text }));
    })
})));

'use client';

// Replaces the root layout, so the app stylesheet is not loaded: inline styles only.
export default function GlobalError({
    error: _error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    void _error;
    return (
        <html lang="de">
            <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'oklch(0.145 0.012 285)', color: 'oklch(0.97 0.005 285)', fontFamily: 'system-ui, sans-serif' }}>
                <main style={{ textAlign: 'center', padding: 24 }}>
                    <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>Kritischer Fehler</h1>
                    <p style={{ margin: '0 0 20px', color: 'oklch(0.76 0.012 285)' }}>Openfolio konnte nicht geladen werden. Deine Projektdatei wurde nicht verändert.</p>
                    <button
                        type="button"
                        onClick={() => reset()}
                        style={{ height: 42, padding: '0 18px', border: 0, borderRadius: 14, background: 'oklch(0.72 0.19 295)', color: 'oklch(0.16 0.03 295)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
                    >
                        Neu laden
                    </button>
                </main>
            </body>
        </html>
    );
}

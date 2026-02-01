'use client';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <html>
            <body className="bg-slate-900 text-slate-200">
                <div className="flex flex-col items-center justify-center min-h-screen p-4">
                    <h2 className="text-xl font-bold mb-4">Kritischer Fehler</h2>
                    <p className="text-slate-400 mb-6">Die Anwendung konnte nicht geladen werden.</p>
                    <button
                        onClick={() => reset()}
                        className="px-4 py-2 bg-emerald-500 text-white rounded hover:bg-emerald-600 transition"
                    >
                        Neu laden
                    </button>
                </div>
            </body>
        </html>
    );
}

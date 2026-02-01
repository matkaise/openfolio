'use client';

import { useEffect } from 'react';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-slate-200 p-4">
            <h2 className="text-xl font-bold mb-4">Etwas ist schief gelaufen!</h2>
            <p className="text-slate-400 mb-6">{error.message || 'Ein unbekannter Fehler ist aufgetreten.'}</p>
            <button
                onClick={() => reset()}
                className="px-4 py-2 bg-emerald-500 text-white rounded hover:bg-emerald-600 transition"
            >
                Erneut versuchen
            </button>
        </div>
    );
}

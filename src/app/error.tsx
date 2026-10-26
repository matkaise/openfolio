'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { createLogger } from '@/lib/logger';
import { useT } from '@/lib/i18n';
import { Button, EmptyState } from '@/components/ui/primitives';

const log = createLogger('App');

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const t = useT();
    useEffect(() => {
        log.error(error);
    }, [error]);

    return (
        <div className="theme-md3 md3-app ui-launcher">
            <div className="app-glow app-glow-1" aria-hidden="true" />
            <main className="ui-launcher-card glass">
                <EmptyState
                    icon={<AlertTriangle size={22} />}
                    title={t.errors.title}
                    text={error.message || t.errors.unknown}
                    action={<Button variant="primary" onClick={() => reset()}>{t.errors.retry}</Button>}
                />
            </main>
        </div>
    );
}

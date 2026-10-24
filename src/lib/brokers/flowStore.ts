/**
 * Short-lived server memory for multi-step logins (e.g. comdirect TAN). Entries hold
 * tokens and secrets, so they expire quickly and are deleted once used.
 */
export const createFlowStore = <T>(ttlMs: number, now: () => number = Date.now) => {
    const entries = new Map<string, { value: T; expiresAt: number }>();

    const prune = () => {
        const time = now();
        entries.forEach((entry, key) => {
            if (entry.expiresAt <= time) entries.delete(key);
        });
    };

    return {
        put(value: T): string {
            prune();
            const id = crypto.randomUUID();
            entries.set(id, { value, expiresAt: now() + ttlMs });
            return id;
        },
        /** Returns and removes the entry (each flow step can be used once). */
        take(id: string): T | null {
            prune();
            const entry = entries.get(id);
            entries.delete(id);
            return entry ? entry.value : null;
        },
        size: () => entries.size
    };
};

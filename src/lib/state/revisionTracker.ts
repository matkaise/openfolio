/**
 * Counts project changes so async work (saving, syncing) can tell whether the project
 * changed while it was running.
 */
export interface RevisionTracker {
    /** Call for every change to the project. */
    bump(): void;
    current(): number;
    /**
     * Runs `write` and reports whether the project is still exactly what was written.
     * If anything changed meanwhile, the project must stay marked as modified.
     */
    save(write: () => Promise<void>): Promise<{ clean: boolean }>;
}

export const createRevisionTracker = (): RevisionTracker => {
    let revision = 0;
    return {
        bump() {
            revision += 1;
        },
        current() {
            return revision;
        },
        async save(write) {
            const revisionAtStart = revision;
            await write();
            return { clean: revision === revisionAtStart };
        }
    };
};

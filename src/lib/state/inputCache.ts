/**
 * A cached result is valid for the same key and the very same input objects. Project
 * updates are immutable, so a sync or an edit replaces the objects and the cache misses;
 * a key string alone cannot see that prices arrived.
 */
export interface InputCache {
    key: string;
    inputs: readonly unknown[];
}

export const isCacheFor = <T extends InputCache>(cache: T | null | undefined, key: string, inputs: readonly unknown[]): cache is T =>
    cache != null
    && cache.key === key
    && cache.inputs.length === inputs.length
    && cache.inputs.every((input, i) => input === inputs[i]);

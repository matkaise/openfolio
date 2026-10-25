import { wrap, type Remote } from 'comlink';
import { createLogger } from '@/lib/logger';
import { calculations, type CalculationInput, type CalculationName, type CalculationResult, type Calculations } from './portfolioCalculations';

const log = createLogger('Calculations');

class WorkerFailedError extends Error {}

interface CalculationWorker {
    remote: Remote<Calculations>;
    /** Rejects when the worker script fails; comlink itself would wait forever. */
    failed: Promise<never>;
}

// undefined = not tried yet, null = no worker in this environment (SSR, tests) or it failed
let worker: CalculationWorker | null | undefined;

const createWorker = (): CalculationWorker | null => {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') return null;
    try {
        const instance = new Worker(new URL('./calculations.worker.ts', import.meta.url), { type: 'module', name: 'openfolio-calculations' });
        const failed = new Promise<never>((_, reject) => {
            instance.addEventListener('error', (event) => reject(new WorkerFailedError(event.message || 'Calculation worker failed')));
        });
        // Keep the rejection from surfacing as unhandled while no calculation waits for it
        failed.catch(() => undefined);
        return { remote: wrap<Calculations>(instance), failed };
    } catch (error) {
        log.warn('Calculation worker unavailable, calculating on the main thread', error);
        return null;
    }
};

const getWorker = (): CalculationWorker | null => {
    if (worker === undefined) worker = createWorker();
    return worker;
};

const runSync = <K extends CalculationName>(name: K, input: CalculationInput<K>): CalculationResult<K> =>
    (calculations[name] as (input: CalculationInput<K>) => CalculationResult<K>)(input);

const isWorkerFailure = (error: unknown) =>
    error instanceof WorkerFailedError
    || (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'DataCloneError');

/**
 * Runs a calculation in the calculation worker. Without Worker support (SSR, tests) or after
 * the worker failed, it calculates synchronously on the main thread instead, with the same result.
 */
export const runCalculation = async <K extends CalculationName>(name: K, input: CalculationInput<K>): Promise<CalculationResult<K>> => {
    const active = getWorker();
    if (!active) return runSync(name, input);
    const call = active.remote[name] as unknown as (input: CalculationInput<K>) => Promise<CalculationResult<K>>;
    try {
        return await Promise.race([call(input), active.failed]);
    } catch (error) {
        // A calculation that throws would throw on the main thread too; only a broken worker falls back
        if (!isWorkerFailure(error)) throw error;
        log.warn(`Calculation worker failed, calculating "${name}" on the main thread`, error);
        if (worker === active) worker = null;
        return runSync(name, input);
    }
};

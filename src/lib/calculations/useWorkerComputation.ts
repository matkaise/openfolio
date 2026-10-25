import { useEffect, useState } from 'react';
import { runCalculation } from './calculationClient';
import { type CalculationInput, type CalculationName, type CalculationResult } from './portfolioCalculations';

export interface WorkerComputation<R> {
    /**
     * Latest result; while a newer input is computing it still belongs to the previous input.
     * `null` before the first result and after a failed calculation.
     */
    result: R | null;
    /** The result (or error) belongs to the current input. */
    isCurrent: boolean;
    isComputing: boolean;
    error: unknown;
}

interface Settled<I, R> {
    input: I;
    result: R | null;
    error: unknown;
}

/**
 * Runs a calculation off the main thread whenever `input` changes (compared by identity, so
 * memoize it); `null` means nothing to compute. Results of inputs that changed in the meantime
 * are dropped, so a slow old calculation never overwrites a newer one.
 */
export function useWorkerComputation<K extends CalculationName>(
    name: K,
    input: CalculationInput<K> | null
): WorkerComputation<CalculationResult<K>> {
    const [settled, setSettled] = useState<Settled<CalculationInput<K>, CalculationResult<K>> | null>(null);

    useEffect(() => {
        if (input === null) return;
        let stale = false;
        runCalculation(name, input).then(
            (result) => { if (!stale) setSettled({ input, result, error: undefined }); },
            (error: unknown) => { if (!stale) setSettled({ input, result: null, error }); }
        );
        return () => { stale = true; };
    }, [name, input]);

    const isCurrent = input !== null && settled?.input === input;
    return {
        result: settled?.result ?? null,
        isCurrent,
        isComputing: input !== null && !isCurrent,
        error: isCurrent ? settled.error : undefined
    };
}

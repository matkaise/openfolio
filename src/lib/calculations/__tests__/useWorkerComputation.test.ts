// @vitest-environment jsdom
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkerComputation, type WorkerComputation } from '../useWorkerComputation';
import { computeAnalysis, type AnalysisInput, type CalculationName } from '../portfolioCalculations';
import type * as Client from '../calculationClient';

// null = the real client (no Worker in jsdom, so it calculates synchronously)
let override: ((name: CalculationName, input: unknown) => Promise<unknown>) | null = null;

vi.mock('../calculationClient', async (importOriginal) => {
    const actual = await importOriginal<typeof Client>();
    return {
        runCalculation: (name: CalculationName, input: never) => (override ? override(name, input) : actual.runCalculation(name, input))
    };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const makeInput = (shares: number): AnalysisInput => ({
    transactions: [
        { id: 'd1', date: '2024-01-01', type: 'Deposit', amount: 1000, currency: 'EUR', broker: 'Test' },
        { id: 'b1', date: '2024-01-02', type: 'Buy', isin: 'TEST0000001', shares, amount: -10 * shares, currency: 'EUR', broker: 'Test' }
    ],
    securities: [{
        isin: 'TEST0000001',
        name: 'Test Security',
        currency: 'EUR',
        priceHistory: { '2024-01-02': 10, '2024-01-03': 11, '2024-01-04': 12 }
    }],
    fxData: { baseCurrency: 'EUR', rates: {}, lastUpdated: '2024-01-04' },
    cashAccounts: [],
    baseCurrency: 'EUR',
    riskFreeRate: 0.02
});

type Analysis = WorkerComputation<ReturnType<typeof computeAnalysis>>;

let container: HTMLDivElement;
let root: Root;
let latest: Analysis;

const Probe = ({ input, report }: { input: AnalysisInput | null; report: (state: Analysis) => void }) => {
    report(useWorkerComputation('computeAnalysis', input));
    return null;
};

const render = async (input: AnalysisInput | null) => {
    await act(async () => { root.render(createElement(Probe, { input, report: (state) => { latest = state; } })); });
};

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
};

beforeEach(() => {
    container = document.createElement('div');
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    override = null;
});

describe('useWorkerComputation', () => {
    it('calculates synchronously on the main thread when no Worker exists', async () => {
        expect(typeof Worker).toBe('undefined');
        const input = makeInput(10);

        await render(input);

        expect(latest.isCurrent).toBe(true);
        expect(latest.isComputing).toBe(false);
        expect(latest.result).toEqual(computeAnalysis(input));
        expect(latest.result?.historyData.length).toBeGreaterThan(0);
    });

    it('stays idle for a null input', async () => {
        override = vi.fn(() => Promise.resolve('unused'));

        await render(null);

        expect(override).not.toHaveBeenCalled();
        expect(latest).toEqual({ result: null, isCurrent: false, isComputing: false, error: undefined });
    });

    it('drops a result that arrives after the input changed', async () => {
        const calls: { input: unknown; done: ReturnType<typeof deferred<unknown>> }[] = [];
        override = (_name, input) => {
            const done = deferred<unknown>();
            calls.push({ input, done });
            return done.promise;
        };
        const first = makeInput(10);
        const second = makeInput(20);

        await render(first);
        expect(latest.isComputing).toBe(true);
        await render(second);
        expect(calls.map((c) => c.input)).toEqual([first, second]);

        // The newer calculation finishes first, the old one afterwards
        await act(async () => { calls[1].done.resolve('second'); });
        await act(async () => { calls[0].done.resolve('first'); });

        expect(latest.result).toBe('second');
        expect(latest.isCurrent).toBe(true);
        expect(latest.isComputing).toBe(false);
    });

    it('keeps the previous result while a new input is computing', async () => {
        const pending = deferred<unknown>();
        override = vi.fn()
            .mockImplementationOnce(() => Promise.resolve('old'))
            .mockImplementationOnce(() => pending.promise);

        await render(makeInput(10));
        expect(latest.result).toBe('old');

        await render(makeInput(20));
        expect(latest).toMatchObject({ result: 'old', isCurrent: false, isComputing: true });

        await act(async () => { pending.resolve('new'); });
        expect(latest).toMatchObject({ result: 'new', isCurrent: true, isComputing: false });
    });

    it('ignores results after unmount', async () => {
        const pending = deferred<unknown>();
        override = () => pending.promise;
        const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        await render(makeInput(10));
        act(() => root.unmount());
        await act(async () => { pending.resolve('late'); });

        expect(errors).not.toHaveBeenCalled();
        errors.mockRestore();
        root = createRoot(container);
    });

    it('reports a failed calculation without passing off the previous result as current', async () => {
        const failure = new Error('boom');
        override = vi.fn()
            .mockImplementationOnce(() => Promise.resolve('old'))
            .mockImplementationOnce(() => Promise.reject(failure));

        await render(makeInput(10));
        await render(makeInput(20));

        expect(latest).toEqual({ result: null, isCurrent: true, isComputing: false, error: failure });
    });
});

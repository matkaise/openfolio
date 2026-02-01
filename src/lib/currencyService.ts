import { FxData, CurrencyHistory } from '@/types/domain';

interface EcbResponse {
    success: boolean;
    count: number;
    data: {
        date: string;
        rates: Record<string, number>
    }[];
}

export const CurrencyService = {
    /**
     * Syncs the provided FxData with the latest data from ECB (via our Proxy).
     * If FxData is empty (no lastUpdated), it fetches full history.
     * Otherwise it fetches daily updates (last 90 days usually).
     */
    syncRates: async (currentFx: FxData): Promise<FxData> => {
        const isFullSync = !currentFx.lastUpdated;
        const mode = isFullSync ? 'hist' : 'daily';

        console.log(`[CurrencyService] Starting ${mode} sync...`);

        try {
            const res = await fetch(`/api/ecb?mode=${mode}`);
            if (!res.ok) throw new Error('Proxy fetch failed');

            const result: EcbResponse = await res.json();
            if (!result.success) throw new Error('ECB Proxy returned error');

            console.log(`[CurrencyService] Received ${result.count} days of data`);

            // Merge data
            // We need to invert the structure: ECB gives [Date -> { USD: 1.1 }]
            // We want { USD: { Date: 1.1 } }

            const newRates: Record<string, CurrencyHistory> = { ...currentFx.rates };

            // Ensure all currencies exist in map
            // We assume EUR is base, so we don't store EUR->EUR = 1 explicitly in history usually, 
            // but the domain model allows it.

            result.data.forEach(day => {
                const date = day.date;
                Object.entries(day.rates).forEach(([currency, rate]) => {
                    if (currency === 'EUR') return; // Base

                    if (!newRates[currency]) {
                        newRates[currency] = {};
                    }
                    newRates[currency][date] = rate;
                });
            });

            // Update lastUpdated to the most recent date in the feed
            // The feed is sorted descending (usually), checking the first item or sorting dates
            const sortedDates = result.data.map(d => d.date).sort();
            const latestDate = sortedDates[sortedDates.length - 1] || new Date().toISOString().split('T')[0];

            return {
                ...currentFx,
                rates: newRates,
                lastUpdated: latestDate
            };

        } catch (error) {
            console.error('[CurrencyService] Sync failed:', error);
            throw error;
        }
    },

    /**
     * Helper to get rate for a specific date. 
     * If exact date missing, falls back to previous available date (simple).
     */
    getRate: (fxData: FxData, currency: string, date: string): number => {
        if (currency === 'EUR' || currency === fxData.baseCurrency) return 1;

        const history = fxData.rates[currency];
        if (!history) return 0; // or 1? Warning?

        // 1. Exact match
        if (history[date]) return history[date];

        // 2. Fallback: Find closest previous date
        // Naive approach: sort keys and find. Performance hit if called often.
        // Optimization: Cache sorted keys?
        const dates = Object.keys(history).sort(); // Ascending 

        // Binary search or reverse iteration
        for (let i = dates.length - 1; i >= 0; i--) {
            if (dates[i] <= date) {
                return history[dates[i]];
            }
        }

        // 3. If date is before first record? Return first record? 
        return history[dates[0]] || 1;
    }
};

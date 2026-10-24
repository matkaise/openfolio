import { FxData, CurrencyHistory } from '@/types/domain';

interface EcbResponse {
    success: boolean;
    count: number;
    data: {
        date: string;
        rates: Record<string, number>
    }[];
}

// The 90-day feed covers gaps of up to ~3 months; keep a margin before switching to the full history.
const MAX_GAP_DAYS_FOR_90D_FEED = 85;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Picks the ECB feed that covers everything since `lastUpdated` (YYYY-MM-DD).
 * The single-day feed is never enough: a few days offline would leave gaps.
 */
export const chooseEcbSyncMode = (lastUpdated: string, today: string): 'hist' | '90d' => {
    const last = Date.parse(`${(lastUpdated || '').slice(0, 10)}T00:00:00Z`);
    const now = Date.parse(`${today}T00:00:00Z`);
    if (!lastUpdated || !Number.isFinite(last) || !Number.isFinite(now)) return 'hist';
    const gapDays = Math.round((now - last) / MS_PER_DAY);
    return gapDays > MAX_GAP_DAYS_FOR_90D_FEED ? 'hist' : '90d';
};

export const CurrencyService = {
    /**
     * Syncs the provided FxData with the latest data from ECB (via our Proxy).
     * Fetches the full history for new projects or long gaps, otherwise the last 90 days.
     */
    syncRates: async (currentFx: FxData): Promise<FxData> => {
        const today = new Date().toISOString().split('T')[0];
        const mode = chooseEcbSyncMode(currentFx.lastUpdated, today);

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
    }
};

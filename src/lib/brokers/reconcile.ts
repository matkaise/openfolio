import { calculateProjectHoldings, selectCalculationTransactions } from '@/lib/portfolioSelectors';
import type { ProjectData } from '@/types/domain';

export interface PositionMismatch {
    isin: string;
    symbol?: string;
    expected: number; // broker
    actual: number; // Openfolio
}

/**
 * Compares the broker's open positions with the quantities Openfolio derives from the
 * portfolio's bookings. A difference usually means history before the export period is
 * missing, or a corporate action Openfolio does not know about.
 */
export const reconcilePositions = (
    project: ProjectData,
    portfolioId: string,
    positions: { isin: string; symbol?: string; quantity: number }[],
    tolerance = 0.0001
): PositionMismatch[] => {
    const { holdings } = calculateProjectHoldings(project, selectCalculationTransactions(project, [portfolioId]));
    const actualByIsin = new Map(holdings.map((h) => [h.security.isin, h.quantity]));
    const expectedByIsin = new Map(positions.map((p) => [p.isin, p]));

    const mismatches: PositionMismatch[] = [];
    expectedByIsin.forEach((position, isin) => {
        const actual = actualByIsin.get(isin) ?? 0;
        if (Math.abs(actual - position.quantity) > tolerance) {
            mismatches.push({ isin, symbol: position.symbol, expected: position.quantity, actual });
        }
    });
    actualByIsin.forEach((actual, isin) => {
        if (!expectedByIsin.has(isin) && Math.abs(actual) > tolerance) {
            mismatches.push({ isin, expected: 0, actual });
        }
    });
    return mismatches;
};

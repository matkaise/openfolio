import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { reconcilePositions } from '../reconcile';
import { parseIbkrFlexXml } from '@/lib/importers/ibkrFlex';
import { applyImportBatch } from '@/lib/importers/importBatch';
import { createEmptyProject } from '@/types/domain';

const xml = readFileSync(path.join(__dirname, '..', '..', '__tests__', 'fixtures', 'ibkr-flex.xml'), 'utf-8');

describe('reconcilePositions', () => {
  const { batch, positions } = parseIbkrFlexXml(xml);
  const { project } = applyImportBatch(createEmptyProject(), batch, { id: 'ib', name: 'IBKR', isNew: true });

  it('reports no difference when the bookings explain the broker positions', () => {
    expect(reconcilePositions(project, 'ib', positions)).toEqual([]);
  });

  it('reports positions that differ or are missing on either side', () => {
    const mismatches = reconcilePositions(project, 'ib', [
      { isin: 'US0000000001', symbol: 'ACME', quantity: 16 },
      { isin: 'XX0000000009', symbol: 'NEW', quantity: 5 }
    ]);
    expect(mismatches).toEqual([
      { isin: 'US0000000001', symbol: 'ACME', expected: 16, actual: 6 },
      { isin: 'XX0000000009', symbol: 'NEW', expected: 5, actual: 0 },
      { isin: 'DE0000000002', expected: 0, actual: 20 }
    ]);
  });
});

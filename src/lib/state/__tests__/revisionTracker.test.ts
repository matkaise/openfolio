import { describe, expect, it } from 'vitest';
import { createRevisionTracker } from '../revisionTracker';

describe('createRevisionTracker (B5)', () => {
  it('reports a clean project when nothing changed during the save', async () => {
    const tracker = createRevisionTracker();
    tracker.bump();
    expect(await tracker.save(async () => {})).toEqual({ clean: true });
  });

  it('keeps the project modified when it changed while writing', async () => {
    const tracker = createRevisionTracker();
    const result = await tracker.save(async () => {
      tracker.bump(); // e.g. a transaction added during a slow write
    });
    expect(result).toEqual({ clean: false });
  });

  it('propagates write errors', async () => {
    const tracker = createRevisionTracker();
    await expect(tracker.save(async () => { throw new Error('disk full'); })).rejects.toThrow('disk full');
  });
});

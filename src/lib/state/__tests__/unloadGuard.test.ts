import { describe, expect, it, vi } from 'vitest';
import { createBeforeUnloadHandler } from '../unloadGuard';

const fakeEvent = () => ({ preventDefault: vi.fn(), returnValue: undefined as unknown });

describe('createBeforeUnloadHandler (B17)', () => {
  it('asks the browser to confirm when there are unsaved changes', () => {
    const event = fakeEvent();
    createBeforeUnloadHandler(() => true)(event as unknown as BeforeUnloadEvent);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.returnValue).toBe('');
  });

  it('lets the tab close when everything is saved', () => {
    const event = fakeEvent();
    createBeforeUnloadHandler(() => false)(event as unknown as BeforeUnloadEvent);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

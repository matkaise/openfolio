import { describe, expect, it } from 'vitest';
import { createFlowStore } from '../flowStore';

describe('createFlowStore', () => {
  it('hands out an entry once', () => {
    const store = createFlowStore<string>(1000);
    const id = store.put('state');
    expect(store.take(id)).toBe('state');
    expect(store.take(id)).toBeNull();
  });

  it('forgets entries after the time limit', () => {
    let time = 0;
    const store = createFlowStore<string>(1000, () => time);
    const id = store.put('state');
    time = 1001;
    expect(store.take(id)).toBeNull();
    expect(store.size()).toBe(0);
  });
});

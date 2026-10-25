import { describe, expect, it } from 'vitest';
import { resolveThemePreference } from '../theme';

describe('resolveThemePreference', () => {
  it('uses the stored theme', () => {
    expect(resolveThemePreference({ theme: 'light' })).toBe('light');
  });

  it('follows the system without a setting', () => {
    expect(resolveThemePreference({})).toBe('system');
    expect(resolveThemePreference(null)).toBe('system');
  });
});

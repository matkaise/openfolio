import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger, redact, setLogLevel } from '../logger';

afterEach(() => {
  setLogLevel(null);
  vi.restoreAllMocks();
});

describe('logger', () => {
  it('drops messages below the level and prefixes the scope', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setLogLevel('warn');
    const log = createLogger('Test');
    log.debug('hidden');
    log.warn('shown', 1);
    expect(debug).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('[Test]', 'shown', 1);
  });

  it('is silent with level "silent"', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setLogLevel('silent');
    createLogger('Test').error('nope');
    expect(error).not.toHaveBeenCalled();
  });

  it('masks secrets in logged objects', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setLogLevel('debug');
    createLogger('Broker').warn('connection', { label: 'IBKR', token: 'abc', nested: { apiSecret: 'x', pin: '1234' } });
    const logged = warn.mock.calls[0][2] as Record<string, unknown>;
    expect(logged).toEqual({ label: 'IBKR', token: '***', nested: { apiSecret: '***', pin: '***' } });
  });

  it('redact keeps errors readable and leaves primitives alone', () => {
    const error = new Error('boom');
    expect(redact(error)).toBe(error);
    expect(redact('text')).toBe('text');
    expect(redact({ Authorization: 'Bearer x', password: 'p', amount: 5 })).toEqual({ Authorization: '***', password: '***', amount: 5 });
  });
});

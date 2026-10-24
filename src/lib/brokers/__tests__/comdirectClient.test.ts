import { describe, expect, it, vi } from 'vitest';
import { completeComdirectLogin, ComdirectError, startComdirectLogin } from '../comdirectClient';

const CREDS = { clientId: 'User_ABC', clientSecret: 'S3cr3t-value', username: '12345678', pin: '987654' };
const res = (body: unknown, status = 200, headers: Record<string, string> = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(headers),
  json: async () => body,
  text: async () => JSON.stringify(body)
}) as unknown as Response;

const challengeHeader = (typ: string, challenge?: string) => ({
  'x-once-authentication-info': JSON.stringify({ id: '7654321', typ, ...(challenge ? { challenge } : {}), availableTypes: ['P_TAN', 'M_TAN'] })
});

const startMock = (typ = 'P_TAN', challenge: string | undefined = 'iVBORw0KGgo=') => vi.fn()
  .mockResolvedValueOnce(res({ access_token: 'AT1', refresh_token: 'RT1', expires_in: 599, scope: 'TWO_FACTOR' }))
  .mockResolvedValueOnce(res([{ identifier: 'SESSION-1', sessionTanActive: false, activated2FA: false }]))
  .mockResolvedValueOnce(res({ identifier: 'SESSION-1' }, 201, challengeHeader(typ, challenge)));

describe('startComdirectLogin', () => {
  it('runs password grant, session lookup and TAN challenge as specified', async () => {
    const fetchImpl = startMock();
    const { state, challenge } = await startComdirectLogin(CREDS, { fetchImpl });

    expect(challenge).toEqual({ type: 'P_TAN', challenge: 'iVBORw0KGgo=', availableTypes: ['P_TAN', 'M_TAN'] });
    expect(state).toMatchObject({ accessToken: 'AT1', sessionIdentifier: 'SESSION-1', challengeId: '7654321' });

    const [tokenUrl, tokenInit] = fetchImpl.mock.calls[0];
    expect(tokenUrl).toBe('https://api.comdirect.de/oauth/token');
    const form = new URLSearchParams(String(tokenInit.body));
    expect(Object.fromEntries(form)).toEqual({
      client_id: 'User_ABC', client_secret: 'S3cr3t-value', grant_type: 'password', username: '12345678', password: '987654'
    });

    const [sessionUrl, sessionInit] = fetchImpl.mock.calls[1];
    expect(sessionUrl).toBe('https://api.comdirect.de/api/session/clients/user/v1/sessions');
    expect(sessionInit.headers.Authorization).toBe('Bearer AT1');
    expect(JSON.parse(sessionInit.headers['x-http-request-info']).clientRequestId.sessionId).toBeTruthy();

    const [validateUrl, validateInit] = fetchImpl.mock.calls[2];
    expect(validateUrl).toBe('https://api.comdirect.de/api/session/clients/user/v1/sessions/SESSION-1/validate');
    expect(validateInit.method).toBe('POST');
    expect(JSON.parse(validateInit.body)).toEqual({ identifier: 'SESSION-1', sessionTanActive: true, activated2FA: true });
  });

  it('does not retry a rejected login and does not leak credentials', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res({ error: 'invalid_grant' }, 401));
    const error = await startComdirectLogin(CREDS, { fetchImpl }).catch((e) => e);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(ComdirectError);
    expect(error.message).not.toContain('987654');
    expect(error.message).not.toContain('S3cr3t-value');
  });
});

describe('completeComdirectLogin', () => {
  const state = {
    clientId: 'User_ABC', clientSecret: 'S3cr3t-value', accessToken: 'AT1', sessionIdentifier: 'SESSION-1',
    challengeId: '7654321', challengeType: 'P_TAN', requestSessionId: 'req-session'
  };
  const page = (values: unknown[], matches = values.length) => res({ paging: { index: 0, matches }, values });

  const completeMock = () => vi.fn()
    .mockResolvedValueOnce(res({ identifier: 'SESSION-1', sessionTanActive: true, activated2FA: true }))
    .mockResolvedValueOnce(res({ access_token: 'AT2', refresh_token: 'RT2', scope: 'BANKING_RO BROKERAGE_RW SESSION_RW' }))
    .mockResolvedValueOnce(page([{ depotId: 'D1', depotDisplayId: '1234567', defaultSettlementAccountId: 'A1' }]))
    .mockResolvedValueOnce(page([{ positionId: 'P1' }]))
    .mockResolvedValueOnce(page([{ transactionId: 'T1' }]))
    .mockResolvedValueOnce(page([{ reference: 'R1' }]))
    .mockResolvedValueOnce(res({}, 204));

  it('activates the session TAN, gets the secondary token and reads depot and account', async () => {
    const fetchImpl = completeMock();
    const data = await completeComdirectLogin(state, '123456', { fetchImpl });

    expect(data.depot.depotId).toBe('D1');
    expect(data.positions).toHaveLength(1);
    expect(data.depotTransactions).toHaveLength(1);
    expect(data.accountTransactions).toHaveLength(1);

    const [patchUrl, patchInit] = fetchImpl.mock.calls[0];
    expect(patchUrl).toBe('https://api.comdirect.de/api/session/clients/user/v1/sessions/SESSION-1');
    expect(patchInit.method).toBe('PATCH');
    expect(patchInit.headers['x-once-authentication-info']).toBe('{"id":"7654321"}');
    expect(patchInit.headers['x-once-authentication']).toBe('123456');

    const secondary = Object.fromEntries(new URLSearchParams(String(fetchImpl.mock.calls[1][1].body)));
    expect(secondary).toEqual({ client_id: 'User_ABC', client_secret: 'S3cr3t-value', grant_type: 'cd_secondary', token: 'AT1' });

    const urls = fetchImpl.mock.calls.map(([url]) => String(url));
    expect(urls[2]).toBe('https://api.comdirect.de/api/brokerage/clients/user/v3/depots');
    expect(urls[3]).toContain('/api/brokerage/v3/depots/D1/positions?with-attr=instrument');
    expect(urls[4]).toContain('/api/brokerage/v3/depots/D1/transactions');
    expect(urls[5]).toContain('/api/banking/v1/accounts/A1/transactions');
    expect(fetchImpl.mock.calls[3][1].headers.Authorization).toBe('Bearer AT2');
    // token revoked at the end
    expect(urls[6]).toBe('https://api.comdirect.de/oauth/revoke');
    expect(fetchImpl.mock.calls[6][1].method).toBe('DELETE');
  });

  it('sends no TAN for photoTAN push', async () => {
    const fetchImpl = completeMock();
    await completeComdirectLogin({ ...state, challengeType: 'P_TAN_PUSH' }, undefined, { fetchImpl });
    expect(fetchImpl.mock.calls[0][1].headers['x-once-authentication']).toBeUndefined();
  });

  it('reports a rejected TAN without retrying', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res({ messages: [{ message: 'TAN ungültig' }] }, 422));
    const error = await completeComdirectLogin(state, '000000', { fetchImpl }).catch((e) => e);
    expect(error).toBeInstanceOf(ComdirectError);
    expect(error.message).toContain('TAN');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

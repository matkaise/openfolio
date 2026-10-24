import { describe, expect, it, vi } from 'vitest';
import { fetchFlexStatement, FlexServiceError } from '../ibkrFlexClient';

const TOKEN = '123456789012345678901234';
const ok = (body: string) => ({ ok: true, status: 200, text: async () => body }) as Response;
const sendSuccess = ok('<FlexStatementResponse><Status>Success</Status><ReferenceCode>555</ReferenceCode><url>x</url></FlexStatementResponse>');
const fail = (code: number, message: string) => ok(`<FlexStatementResponse><Status>Fail</Status><ErrorCode>${code}</ErrorCode><ErrorMessage>${message}</ErrorMessage></FlexStatementResponse>`);
const statement = ok('<FlexQueryResponse><FlexStatements count="1"><FlexStatement accountId="U1" /></FlexStatements></FlexQueryResponse>');
const noSleep = async () => {};

describe('fetchFlexStatement', () => {
  it('requests the report and returns the statement', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(sendSuccess).mockResolvedValueOnce(statement);
    const xml = await fetchFlexStatement({ token: TOKEN, queryId: '987654' }, { fetchImpl, sleep: noSleep });

    expect(xml).toContain('FlexQueryResponse');
    const [sendUrl] = fetchImpl.mock.calls[0];
    const [getUrl] = fetchImpl.mock.calls[1];
    expect(String(sendUrl)).toBe(`https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest?t=${TOKEN}&q=987654&v=3`);
    expect(String(getUrl)).toBe(`https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/GetStatement?t=${TOKEN}&q=555&v=3`);
  });

  it('waits while the statement is still being generated', async () => {
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(sendSuccess)
      .mockResolvedValueOnce(fail(1019, 'Statement generation in progress. Please try again shortly.'))
      .mockResolvedValueOnce(statement);

    await fetchFlexStatement({ token: TOKEN, queryId: '987654' }, { fetchImpl, sleep });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalled();
  });

  it('stops with a readable error for an invalid token, without leaking it', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(fail(1015, 'Token is invalid.'));
    const error = await fetchFlexStatement({ token: TOKEN, queryId: '987654' }, { fetchImpl, sleep: noSleep }).catch((e) => e);

    expect(error).toBeInstanceOf(FlexServiceError);
    expect(error.code).toBe(1015);
    expect(error.message).toContain('Token is invalid');
    expect(error.message).not.toContain(TOKEN);
  });

  it('gives up after the retry budget', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(sendSuccess).mockResolvedValue(fail(1019, 'in progress'));
    const error = await fetchFlexStatement({ token: TOKEN, queryId: '987654' }, { fetchImpl, sleep: noSleep, maxPolls: 3 }).catch((e) => e);

    expect(error).toBeInstanceOf(FlexServiceError);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('rejects malformed credentials before calling IBKR', async () => {
    const fetchImpl = vi.fn();
    await expect(fetchFlexStatement({ token: 'abc&x=1', queryId: '1' }, { fetchImpl, sleep: noSleep })).rejects.toThrow(/Token/);
    await expect(fetchFlexStatement({ token: TOKEN, queryId: '12a' }, { fetchImpl, sleep: noSleep })).rejects.toThrow(/Query/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

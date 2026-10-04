import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isUnsupportedError, resetMethodPreferences, rpc } from './rpc';
import { endpointsFor, rpcUrlFor, useSettings } from '../settings';

type Reply = { status?: number; result?: unknown; error?: { message: string; code: number }; throws?: boolean };
type Handler = (method: string) => Reply | undefined;

/** Each endpoint gets a handler; unknown endpoints answer 403 like Solana's public server. */
function serve(handlers: Record<string, Handler>) {
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { body: string }) => {
      const { id, method } = JSON.parse(init.body);
      calls.push({ url, method });
      const r = handlers[url]?.(method) ?? { status: 403 };
      if (r.throws) throw new TypeError('Failed to fetch');
      if (r.status && r.status !== 200) return new Response('no', { status: r.status });
      return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: r.result, error: r.error }));
    }),
  );
  return calls;
}

let eps: string[];
beforeEach(() => {
  useSettings.getState().update({ cluster: 'mainnet-beta', customRpcUrl: '' });
  resetMethodPreferences();
  eps = endpointsFor(useSettings.getState());
});
afterEach(() => vi.unstubAllGlobals());

describe('Mainnet RPC fallback', () => {
  it('moves past blocked, refused and 400 responses for the same request', async () => {
    const [a, b, c, d] = eps;
    serve({ [a]: () => ({ throws: true }), [b]: () => ({ status: 403 }), [c]: () => ({ status: 400 }), [d]: () => ({ result: 7 }) });
    expect(await rpc<number>('getSlot')).toBe(7);
  });

  it('uses different servers for different methods and remembers each', async () => {
    const [a, b] = eps;
    const calls = serve({
      [a]: (m) => (m === 'getVoteAccounts' ? { status: 400 } : { result: 1 }),
      [b]: (m) => (m === 'getVoteAccounts' ? { result: { current: [], delinquent: [] } } : { result: 2 }),
    });
    expect(await rpc('getSlot')).toBe(1);
    expect(await rpc('getVoteAccounts')).toEqual({ current: [], delinquent: [] });
    calls.length = 0;
    await rpc('getVoteAccounts');
    await rpc('getSlot');
    expect(calls.map((c) => c.url)).toEqual([b, a]);
  });

  it('retries "method not available" style errors elsewhere', async () => {
    const [a, b] = eps;
    serve({
      [a]: () => ({ error: { code: -32601, message: 'Method not found' } }),
      [b]: () => ({ result: 'ok' }),
    });
    expect(await rpc('getHealth')).toBe('ok');
    expect(isUnsupportedError({ code: -32000, message: 'This method is not available on the free plan' })).toBe(true);
    expect(isUnsupportedError({ code: -32002, message: 'Transaction simulation failed: insufficient funds' })).toBe(false);
  });

  it('does not retry genuine request errors', async () => {
    const [a] = eps;
    const calls = serve({ [a]: () => ({ error: { message: 'Invalid param: WrongSize', code: -32602 } }) });
    await expect(rpc('getBalance', ['x'])).rejects.toThrow('Invalid param');
    expect(calls).toHaveLength(1);
  });

  it('lists what each server said when none can answer', async () => {
    serve({});
    await expect(rpc('getSlot')).rejects.toThrow(/No free Mainnet server would answer getSlot \(.*HTTP 403.*\).*Custom RPC/);
  });

  it('puts servers that are down last for later requests', async () => {
    const [a, b] = eps;
    serve({ [a]: () => ({ status: 403 }), [b]: () => ({ result: 3 }) });
    await rpc('getSlot');
    expect(rpcUrlFor(useSettings.getState())).not.toBe(a);
  });

  it('uses only the custom RPC when one is set', () => {
    useSettings.getState().update({ cluster: 'custom', customRpcUrl: ' https://mainnet.helius-rpc.com/?api-key=k ' });
    expect(endpointsFor(useSettings.getState())).toEqual(['https://mainnet.helius-rpc.com/?api-key=k']);
  });
});

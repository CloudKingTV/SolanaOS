import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rpc } from './rpc';
import { MAINNET_ENDPOINTS, endpointsFor, rpcUrlFor, useSettings } from '../settings';

type Reply = { status?: number; result?: unknown; error?: { message: string; code: number }; throws?: boolean };

function serve(replies: Record<string, Reply>) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { body: string }) => {
      calls.push(url);
      const r = replies[url] ?? { status: 403 };
      if (r.throws) throw new TypeError('Failed to fetch');
      const { id } = JSON.parse(init.body);
      if (r.status && r.status !== 200) return new Response('no', { status: r.status });
      return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: r.result, error: r.error }));
    }),
  );
  return calls;
}

beforeEach(() => useSettings.getState().update({ cluster: 'mainnet-beta', customRpcUrl: '' }));
afterEach(() => vi.unstubAllGlobals());

describe('Mainnet RPC fallback', () => {
  it('skips servers that refuse websites and remembers the one that works', async () => {
    const [a, b, c] = MAINNET_ENDPOINTS;
    const working = rpcUrlFor(useSettings.getState()) === a ? c : a;
    const calls = serve({ [a]: { status: 403 }, [b]: { throws: true }, [c]: { result: 42 }, ...(working === a ? { [a]: { result: 42 } } : {}) });
    expect(await rpc<number>('getSlot')).toBe(42);
    expect(calls.at(-1)).toBe(working);
    // The next request goes straight to the server that answered.
    expect(rpcUrlFor(useSettings.getState())).toBe(working);
    calls.length = 0;
    await rpc<number>('getSlot');
    expect(calls).toEqual([working]);
  });

  it('does not switch servers for normal JSON-RPC errors', async () => {
    const first = rpcUrlFor(useSettings.getState());
    const calls = serve({ [first]: { error: { message: 'Invalid param', code: -32602 } } });
    await expect(rpc('getBalance', ['x'])).rejects.toThrow('Invalid param');
    expect(calls).toEqual([first]);
    expect(rpcUrlFor(useSettings.getState())).toBe(first);
  });

  it('explains what to do when every free server refuses', async () => {
    serve({});
    await expect(rpc('getSlot')).rejects.toThrow(/Custom RPC/);
  });

  it('uses only the custom RPC when one is set', () => {
    useSettings.getState().update({ cluster: 'custom', customRpcUrl: ' https://mainnet.helius-rpc.com/?api-key=k ' });
    expect(endpointsFor(useSettings.getState())).toEqual(['https://mainnet.helius-rpc.com/?api-key=k']);
  });
});

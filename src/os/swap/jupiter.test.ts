import { afterEach, describe, expect, it, vi } from 'vitest';
import { getQuote, quoteUrl, routeLabel, getSwapTransaction, type Quote } from './jupiter';
import { useSettings } from '../settings';

afterEach(() => {
  vi.unstubAllGlobals();
  useSettings.getState().update({ jupiterApiKey: '' });
});

describe('jupiter client', () => {
  it('builds quote URLs against the keyed API', () => {
    const u = new URL(quoteUrl('A', 'B', 1500n, 50));
    expect(u.origin + u.pathname).toBe('https://api.jup.ag/swap/v1/quote');
    expect(u.searchParams.get('amount')).toBe('1500');
    expect(u.searchParams.get('slippageBps')).toBe('50');
  });

  it('requires an API key and sends it as x-api-key', async () => {
    await expect(getQuote('A', 'B', 1n, 50)).rejects.toThrow(/Jupiter API key/);
    useSettings.getState().update({ jupiterApiKey: 'k123' });
    const f = vi.fn(async () => new Response(JSON.stringify({ outAmount: '9' })));
    vi.stubGlobal('fetch', f);
    await getQuote('A', 'B', 1n, 50);
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toEqual({ 'x-api-key': 'k123' });
  });

  it('explains a rejected key', async () => {
    useSettings.getState().update({ jupiterApiKey: 'bad' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 401 })));
    await expect(getQuote('A', 'B', 1n, 50)).rejects.toThrow(/rejected the API key/);
  });

  it('labels routes', () => {
    const q = { routePlan: [{ swapInfo: { label: 'Orca' }, percent: 100 }, { swapInfo: { label: 'Raydium' }, percent: 100 }] } as Quote;
    expect(routeLabel(q)).toBe('Orca → Raydium');
  });

  it('decodes the swap transaction Jupiter returns', async () => {
    useSettings.getState().update({ jupiterApiKey: 'k' });
    // One required signature, zeroed, followed by a minimal legacy message.
    const message = new Uint8Array([1, 0, 1, 2, ...new Uint8Array(32).fill(9), ...new Uint8Array(32).fill(8), ...new Uint8Array(32).fill(3), 1, 1, 1, 0, 0]);
    const wire = new Uint8Array([1, ...new Uint8Array(64), ...message]);
    let s = '';
    for (const b of wire) s += String.fromCharCode(b);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ swapTransaction: btoa(s) }))));
    const tx = await getSwapTransaction({} as Quote, 'user');
    expect(Object.keys(tx.signatures)).toHaveLength(1);
    expect(tx.messageBytes.length).toBe(message.length);
  });
});

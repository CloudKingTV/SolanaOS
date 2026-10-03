import { describe, expect, it } from 'vitest';
import { formatAmount, isLikelySignature, parseAmount } from './rpc';
import { parseMetaplexMetadata } from './metadata';
import { parseRoute } from '../../apps/solexplorer/route';

describe('amount formatting', () => {
  it('formats base units', () => {
    expect(formatAmount('1234567', 6)).toBe('1.234567');
    expect(formatAmount('1000000000000', 6)).toBe('1,000,000');
    expect(formatAmount('-50', 2)).toBe('-0.5');
    expect(formatAmount('7', 0)).toBe('7');
    expect(formatAmount('123456789', 9, 4)).toBe('0.1234');
  });

  it('parses user input exactly', () => {
    expect(parseAmount('1.5', 9)).toBe(1_500_000_000n);
    expect(parseAmount('0.000000001', 9)).toBe(1n);
    expect(parseAmount('1,000', 0)).toBe(1000n);
    expect(parseAmount('0.0000000001', 9)).toBeNull();
    expect(parseAmount('abc', 9)).toBeNull();
    expect(parseAmount('', 9)).toBeNull();
  });
});

describe('metaplex metadata', () => {
  it('decodes padded name, symbol and uri', () => {
    const str = (s: string, width: number) => {
      const b = new Uint8Array(4 + width);
      new DataView(b.buffer).setUint32(0, width, true);
      b.set(new TextEncoder().encode(s), 4);
      return b;
    };
    const parts = [new Uint8Array([4]), new Uint8Array(64), str('Bonk', 32), str('BONK', 10), str('https://example.com/b.json', 200)];
    const bytes = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
    let o = 0;
    for (const p of parts) bytes.set(p, (o += p.length) - p.length);
    expect(parseMetaplexMetadata(bytes)).toEqual({ name: 'Bonk', symbol: 'BONK', uri: 'https://example.com/b.json' });
  });
});

describe('explorer routes', () => {
  const sig = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW';
  it('accepts addresses, signatures and explorer links', () => {
    expect(parseRoute('9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin')).toEqual({ kind: 'address', id: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin' });
    expect(isLikelySignature(sig)).toBe(true);
    expect(parseRoute(sig)).toEqual({ kind: 'tx', id: sig });
    expect(parseRoute(`https://explorer.solana.com/tx/${sig}?cluster=devnet`)).toEqual({ kind: 'tx', id: sig });
    expect(parseRoute('https://solscan.io/token/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toEqual({ kind: 'address', id: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' });
    expect(parseRoute('sol://home')).toEqual({ kind: 'home' });
    expect(parseRoute('hello world').kind).toBe('invalid');
  });
});

import { describe, expect, it } from 'vitest';
import { getBase58Decoder } from '@solana/kit';
import { formatSigned, parseSigned, verifySigned } from './signedMessage';

async function keypair() {
  const kp = (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  return { kp, address: getBase58Decoder().decode(raw) };
}

describe('signed messages', () => {
  it('round-trips and verifies', async () => {
    const { kp, address } = await keypair();
    const message = 'gm from SolanaOS\nline two';
    const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(message)));
    const block = formatSigned(message, address, getBase58Decoder().decode(sig));
    const parsed = parseSigned(`Some intro text\n${block}`)!;
    expect(parsed.message).toBe(message);
    expect(parsed.address).toBe(address);
    expect(await verifySigned(parsed)).toBe(true);
    expect(await verifySigned({ ...parsed, message: `${message}!` })).toBe(false);
  });

  it('returns null for text without a block', () => {
    expect(parseSigned('hello')).toBeNull();
  });
});

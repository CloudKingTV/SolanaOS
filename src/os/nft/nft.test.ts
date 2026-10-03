import { describe, expect, it } from 'vitest';
import { address, createNoopSigner } from '@solana/kit';
import { assemble, itemId, serializeTags, signatureData } from './ans104';
import { CORE_PROGRAM, createAssetInstruction, createV1Data, parseCoreAsset } from './core';
import { metadataJson } from './mint';

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (h: string) => new Uint8Array(h.match(/../g)!.map((x) => parseInt(x, 16)));

// Golden vectors generated with @irys/bundles (createData + getSignatureData) and
// @metaplex-foundation/mpl-core (getCreateV1InstructionDataSerializer, deserializeAssetV1).
const IRYS_SIG_DATA = '7d4c97d4b68c7e30c4ca9c20da4d48d3c55b2c682c2346228d3d869cb6d91e599ed807c600b715de2d960fcdb8da0312';
const IRYS_ITEM =
  '0200070707070707070707070707070707070707070707070707070707070707070707070707070707070707070707070707070707070707070707070707070707070102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20000002000000000000002b000000000000000418436f6e74656e742d5479706512696d6167652f706e67104170702d4e616d6510536f6c616e614f5300676d2066726f6d20536f6c616e614f53';
const IRYS_ID = '8LUV1THKRqntJDKimcQcCGQWqMU6vqxxaSVxciWWbo6n';
const CORE_CREATE = '000006000000676d206172741c00000068747470733a2f2f676174657761792e697279732e78797a2f6162630100000000';
const CORE_ASSET =
  '01850f2d6e02a47af824d09ab69dc42d70cb28cbfa249fb7ee57b9d256c12762ef01321cfa5add185e8893a5fd88013ec4d7e122ded46354cadff50d956395e75b6006000000676d206172741c00000068747470733a2f2f676174657761792e697279732e78797a2f61626300';

describe('ANS-104 data items (Irys)', () => {
  const owner = new Uint8Array(Array.from({ length: 32 }, (_, i) => i + 1));
  const item = {
    owner,
    tags: [
      { name: 'Content-Type', value: 'image/png' },
      { name: 'App-Name', value: 'SolanaOS' },
    ],
    data: new TextEncoder().encode('gm from SolanaOS'),
  };
  const sig = new Uint8Array(64).fill(7);

  it('computes the same signature payload as @irys/bundles', async () => {
    expect(hex(await signatureData(item))).toBe(IRYS_SIG_DATA);
  });

  it('assembles byte-identical data items', () => {
    expect(hex(assemble(item, sig))).toBe(IRYS_ITEM);
  });

  it('derives the same item id', async () => {
    expect(await itemId(sig)).toBe(IRYS_ID);
  });

  it('round-trips a real Ed25519 signature', async () => {
    const kp = (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair;
    const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
    const it2 = { ...item, owner: pub };
    const msg = await signatureData(it2);
    const s = new Uint8Array(await crypto.subtle.sign('Ed25519', kp.privateKey, msg as BufferSource));
    expect(await crypto.subtle.verify('Ed25519', kp.publicKey, s as BufferSource, msg as BufferSource)).toBe(true);
  });

  it('encodes no tags as an empty buffer', () => {
    expect(serializeTags([])).toHaveLength(0);
  });
});

describe('Metaplex Core', () => {
  it('encodes CreateV1 like mpl-core', () => {
    expect(hex(createV1Data('gm art', 'https://gateway.irys.xyz/abc'))).toBe(CORE_CREATE);
  });

  it('orders accounts like mpl-core createV1', () => {
    const asset = createNoopSigner(address('7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV'));
    const payer = createNoopSigner(address('9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'));
    const ix = createAssetInstruction({ asset, payer, owner: payer.address, name: 'a', uri: 'b' });
    expect(ix.programAddress).toBe(CORE_PROGRAM);
    expect(ix.accounts!.map((a) => a.address)).toEqual([
      asset.address,
      CORE_PROGRAM,
      CORE_PROGRAM,
      payer.address,
      payer.address,
      CORE_PROGRAM,
      '11111111111111111111111111111111',
      CORE_PROGRAM,
    ]);
  });

  it('parses asset accounts like mpl-core', () => {
    expect(parseCoreAsset('X', unhex(CORE_ASSET))).toEqual({
      address: 'X',
      owner: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin',
      name: 'gm art',
      uri: 'https://gateway.irys.xyz/abc',
    });
    expect(parseCoreAsset('X', new Uint8Array([2, 0, 0]))).toBeNull();
  });

  it('builds wallet-friendly metadata', () => {
    const m = metadataJson('gm', 'hi', 'https://gateway.irys.xyz/img');
    expect(m.image).toBe('https://gateway.irys.xyz/img');
    expect(m.properties.files[0]).toEqual({ uri: 'https://gateway.irys.xyz/img', type: 'image/png' });
  });
});

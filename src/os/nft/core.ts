// Metaplex Core assets: a single account per NFT, cheaper than Token Metadata NFTs.
// CreateV1 is encoded by hand (checked against @metaplex-foundation/mpl-core in tests)
// to avoid pulling in the Umi framework.
import { AccountRole, address, type Instruction, type TransactionSigner } from '@solana/kit';
import { getBase58Encoder } from '@solana/kit';
import { rpc } from '../solana/rpc';

export const CORE_PROGRAM = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d';
const SYSTEM_PROGRAM = '11111111111111111111111111111111';

const enc = new TextEncoder();

function borshString(s: string): Uint8Array {
  const b = enc.encode(s);
  const out = new Uint8Array(4 + b.length);
  new DataView(out.buffer).setUint32(0, b.length, true);
  out.set(b, 4);
  return out;
}

export function createV1Data(name: string, uri: string): Uint8Array {
  const parts = [
    new Uint8Array([0]), // discriminator: CreateV1
    new Uint8Array([0]), // dataState: AccountState
    borshString(name),
    borshString(uri),
    new Uint8Array([1, 0, 0, 0, 0]), // plugins: Some([])
  ];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Create a Core asset owned by `owner`. The new asset's keypair must sign too. */
export function createAssetInstruction(opts: { asset: TransactionSigner; payer: TransactionSigner; owner: string; name: string; uri: string }): Instruction {
  const program = address(CORE_PROGRAM);
  const placeholder = { address: program, role: AccountRole.READONLY };
  return {
    programAddress: program,
    accounts: [
      { address: opts.asset.address, role: AccountRole.WRITABLE_SIGNER, signer: opts.asset } as never,
      placeholder, // collection
      placeholder, // authority (defaults to payer)
      { address: opts.payer.address, role: AccountRole.WRITABLE_SIGNER, signer: opts.payer } as never,
      { address: address(opts.owner), role: AccountRole.READONLY },
      placeholder, // update authority (defaults to authority)
      { address: address(SYSTEM_PROGRAM), role: AccountRole.READONLY },
      placeholder, // log wrapper
    ],
    data: createV1Data(opts.name, opts.uri),
  };
}

export interface CoreAsset {
  address: string;
  owner: string;
  name: string;
  uri: string;
}

/** Decode the fixed prefix of an AssetV1 account. */
export function parseCoreAsset(addr: string, bytes: Uint8Array): CoreAsset | null {
  try {
    if (bytes[0] !== 1) return null; // Key::AssetV1
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const b58 = (b: Uint8Array) => {
      const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
      let n = 0n;
      for (const x of b) n = n * 256n + BigInt(x);
      let s = '';
      while (n > 0n) {
        s = A[Number(n % 58n)] + s;
        n /= 58n;
      }
      for (const x of b) {
        if (x) break;
        s = `1${s}`;
      }
      return s;
    };
    const owner = b58(bytes.subarray(1, 33));
    let o = 33;
    const ua = bytes[o++];
    if (ua === 1 || ua === 2) o += 32;
    const readStr = () => {
      const len = view.getUint32(o, true);
      const s = new TextDecoder().decode(bytes.subarray(o + 4, o + 4 + len));
      o += 4 + len;
      return s;
    };
    const name = readStr();
    const uri = readStr();
    return { address: addr, owner, name, uri };
  } catch {
    return null;
  }
}

/** Core assets owned by an address (needs an RPC that allows getProgramAccounts on Core). */
export async function getCoreAssets(owner: string): Promise<CoreAsset[]> {
  getBase58Encoder().encode(owner); // throws on a bad address
  const res = await rpc<{ pubkey: string; account: { data: [string, string] } }[]>('getProgramAccounts', [
    CORE_PROGRAM,
    {
      encoding: 'base64',
      filters: [{ memcmp: { offset: 0, bytes: '2' } }, { memcmp: { offset: 1, bytes: owner } }],
    },
  ]);
  return res
    .map((r) => {
      const bin = atob(r.account.data[0]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return parseCoreAsset(r.pubkey, bytes);
    })
    .filter((a): a is CoreAsset => !!a);
}

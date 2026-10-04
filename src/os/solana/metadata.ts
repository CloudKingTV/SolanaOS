// Token names and symbols: Metaplex metadata accounts for classic SPL tokens,
// and the on-mint metadata extension for Token-2022.
import { address, getAddressEncoder, getProgramDerivedAddress } from '@solana/kit';
import { getMultipleAccounts, NATIVE_MINT, TOKEN_2022_PROGRAM } from './rpc';

export const METAPLEX_PROGRAM = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';

export interface TokenMeta {
  name: string;
  symbol: string;
  uri: string;
  image?: string;
}

const cache = new Map<string, TokenMeta | null>();

export async function metadataPda(mint: string): Promise<string> {
  const enc = getAddressEncoder();
  const [pda] = await getProgramDerivedAddress({
    programAddress: address(METAPLEX_PROGRAM),
    seeds: ['metadata', enc.encode(address(METAPLEX_PROGRAM)), enc.encode(address(mint))],
  });
  return pda;
}

function readString(view: DataView, bytes: Uint8Array, offset: number): [string, number] {
  const len = view.getUint32(offset, true);
  const start = offset + 4;
  if (len > 1000 || start + len > bytes.length) throw new Error('bad string');
  // Metaplex pads fixed-width strings with NUL bytes.
  const s = new TextDecoder().decode(bytes.subarray(start, start + len)).replace(/\0+$/, '').trim();
  return [s, start + len];
}

/** Decode name / symbol / uri from a Metaplex metadata account (key, update authority, mint, then strings). */
export function parseMetaplexMetadata(bytes: Uint8Array): TokenMeta | null {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let o = 1 + 32 + 32;
    const [name, o1] = readString(view, bytes, o);
    o = o1;
    const [symbol, o2] = readString(view, bytes, o);
    const [uri] = readString(view, bytes, o2);
    return { name, symbol, uri };
  } catch {
    return null;
  }
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface ParsedMint {
  parsed?: { info?: { extensions?: { extension: string; state: { name?: string; symbol?: string; uri?: string } }[] } };
}

/** Look up metadata for many mints at once. Unknown mints map to null. */
export async function getTokenMetadata(mints: { mint: string; programId: string }[]): Promise<Map<string, TokenMeta | null>> {
  const out = new Map<string, TokenMeta | null>();
  const todo = mints.filter((m) => !cache.has(m.mint));
  if (todo.some((m) => m.mint === NATIVE_MINT)) cache.set(NATIVE_MINT, { name: 'Wrapped SOL', symbol: 'wSOL', uri: '' });

  const t22 = todo.filter((m) => m.programId === TOKEN_2022_PROGRAM && m.mint !== NATIVE_MINT);
  for (let i = 0; i < t22.length; i += 100) {
    const chunk = t22.slice(i, i + 100);
    const accts = await getMultipleAccounts<ParsedMint>(chunk.map((m) => m.mint), 'jsonParsed').catch(() => []);
    chunk.forEach((m, j) => {
      const ext = accts[j]?.data?.parsed?.info?.extensions?.find((e) => e.extension === 'tokenMetadata');
      if (ext?.state?.name || ext?.state?.symbol)
        cache.set(m.mint, { name: ext.state.name ?? '', symbol: ext.state.symbol ?? '', uri: ext.state.uri ?? '' });
    });
  }

  const classic = todo.filter((m) => !cache.has(m.mint));
  const pdas = await Promise.all(classic.map((m) => metadataPda(m.mint)));
  for (let i = 0; i < classic.length; i += 100) {
    const accts = await getMultipleAccounts<[string, string]>(pdas.slice(i, i + 100), 'base64').catch(() => []);
    classic.slice(i, i + 100).forEach((m, j) => {
      const data = accts[j]?.data?.[0];
      cache.set(m.mint, data ? parseMetaplexMetadata(b64ToBytes(data)) : null);
    });
  }

  for (const m of mints) out.set(m.mint, cache.get(m.mint) ?? null);
  return out;
}

/** Turn ipfs:// and ar:// links into https gateway URLs; reject anything that isn't https. */
export function toHttps(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  const u = url.trim();
  if (/^ipfs:\/\//i.test(u)) return `https://ipfs.io/ipfs/${u.replace(/^ipfs:\/\/(ipfs\/)?/i, '')}`;
  if (/^ar:\/\//i.test(u)) return `https://arweave.net/${u.slice(5)}`;
  return /^https:\/\//i.test(u) ? u : undefined;
}

export interface TokenJson {
  name?: string;
  image?: string;
  animation_url?: string;
  properties?: { category?: string; files?: { uri?: string; type?: string }[] };
}

const jsonCache = new Map<string, Promise<TokenJson | null>>();

/** Fetch a token's off-chain JSON (best effort, 5s timeout, cached). */
export function getTokenJson(uri: string): Promise<TokenJson | null> {
  const url = toHttps(uri);
  if (!url) return Promise.resolve(null);
  let p = jsonCache.get(url);
  if (!p) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    p = fetch(url, { signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<TokenJson>) : null))
      .catch(() => null)
      .finally(() => clearTimeout(t));
    jsonCache.set(url, p);
  }
  return p;
}

export function getTokenImage(uri: string): Promise<string | undefined> {
  return getTokenJson(uri).then((j) => toHttps(j?.image));
}

const AUDIO_EXT = /\.(mp3|wav|ogg|oga|flac|m4a|aac|opus)(\?|#|$)/i;

/** The playable audio file in a token's metadata, if it's a music NFT. */
export function audioFromJson(j: TokenJson | null): string | undefined {
  if (!j) return undefined;
  const file = j.properties?.files?.find((f) => /^audio\//i.test(f.type ?? '') || AUDIO_EXT.test(f.uri ?? ''));
  const fromFile = toHttps(file?.uri);
  if (fromFile) return fromFile;
  const anim = toHttps(j.animation_url);
  if (anim && (AUDIO_EXT.test(anim) || j.properties?.category === 'audio')) return anim;
  return undefined;
}

export function clearMetadataCache() {
  cache.clear();
}

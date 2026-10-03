// Minimal ANS-104 data items, signed with an Ed25519 (Solana) key, for uploading to Irys.
// Spec: https://github.com/ArweaveTeam/arweave-standards/blob/master/ans/ANS-104.md
// Kept dependency-free; verified against @irys/bundles in tests.

export const SIG_TYPE_ED25519 = 2;
const SIG_LEN = 64;
const OWNER_LEN = 32;

export interface Tag {
  name: string;
  value: string;
}

const enc = new TextEncoder();

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function sha384(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-384', data as BufferSource));
}

type Chunk = Uint8Array | Chunk[];

/** Arweave "deep hash" (SHA-384 over tagged blobs and lists). */
export async function deepHash(data: Chunk): Promise<Uint8Array> {
  if (Array.isArray(data)) {
    let acc = await sha384(concat([enc.encode('list'), enc.encode(String(data.length))]));
    for (const chunk of data) acc = await sha384(concat([acc, await deepHash(chunk)]));
    return acc;
  }
  const tag = await sha384(concat([enc.encode('blob'), enc.encode(String(data.byteLength))]));
  return sha384(concat([tag, await sha384(data)]));
}

/** Avro zig-zag varint, as used by ANS-104 tag encoding. */
function writeLong(out: number[], n: number) {
  let m = n >= 0 ? n * 2 : -n * 2 - 1;
  do {
    let b = m % 128;
    m = Math.floor(m / 128);
    if (m > 0) b |= 0x80;
    out.push(b);
  } while (m > 0);
}

export function serializeTags(tags: Tag[]): Uint8Array {
  if (!tags.length) return new Uint8Array(0);
  const out: number[] = [];
  writeLong(out, tags.length);
  for (const t of tags) {
    for (const s of [t.name, t.value]) {
      const b = enc.encode(s);
      writeLong(out, b.length);
      out.push(...b);
    }
  }
  writeLong(out, 0);
  return new Uint8Array(out);
}

function le(n: number, bytes: number): Uint8Array {
  const out = new Uint8Array(bytes);
  let v = n;
  for (let i = 0; i < bytes; i++) {
    out[i] = v & 0xff;
    v = Math.floor(v / 256);
  }
  return out;
}

export interface UnsignedItem {
  owner: Uint8Array;
  tags: Tag[];
  data: Uint8Array;
}

/** The bytes the owner must sign. */
export function signatureData(item: UnsignedItem): Promise<Uint8Array> {
  return deepHash([
    enc.encode('dataitem'),
    enc.encode('1'),
    enc.encode(String(SIG_TYPE_ED25519)),
    item.owner,
    new Uint8Array(0), // target
    new Uint8Array(0), // anchor
    serializeTags(item.tags),
    item.data,
  ]);
}

/** Assemble the binary data item once the signature is known. */
export function assemble(item: UnsignedItem, signature: Uint8Array): Uint8Array {
  if (item.owner.length !== OWNER_LEN) throw new Error('Owner must be a 32-byte Ed25519 public key');
  if (signature.length !== SIG_LEN) throw new Error('Signature must be 64 bytes');
  const tags = serializeTags(item.tags);
  return concat([
    le(SIG_TYPE_ED25519, 2),
    signature,
    item.owner,
    new Uint8Array([0]), // no target
    new Uint8Array([0]), // no anchor
    le(item.tags.length, 8),
    le(tags.length, 8),
    tags,
    item.data,
  ]);
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let s = '';
  while (n > 0n) {
    s = B58[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    s = `1${s}`;
  }
  return s;
}

/** Data item id as Irys reports it: base58(sha256(signature)). */
export async function itemId(signature: Uint8Array): Promise<string> {
  return base58(new Uint8Array(await crypto.subtle.digest('SHA-256', signature as BufferSource)));
}

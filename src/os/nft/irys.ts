// Upload small files to Irys (permanent Arweave storage). Uploads under 100 KiB are free;
// the wallet signs each upload with signMessage, so no SOL is spent.
import { getBase58Encoder } from '@solana/kit';
import { assemble, itemId, signatureData, type Tag } from './ans104';

export const IRYS_UPLOADER = 'https://uploader.irys.xyz';
export const IRYS_GATEWAY = 'https://gateway.irys.xyz';
export const FREE_LIMIT_BYTES = 100 * 1024;

export type MessageSigner = (message: Uint8Array) => Promise<Uint8Array>;

export async function uploadToIrys(
  data: Uint8Array,
  contentType: string,
  ownerAddress: string,
  sign: MessageSigner,
  extraTags: Tag[] = [],
): Promise<{ id: string; url: string }> {
  // Leave room for the data item header and tags inside the free limit.
  if (data.length > FREE_LIMIT_BYTES - 2048) {
    throw new Error(`This file is ${Math.ceil(data.length / 1024)} KB. Free uploads must be under about 98 KB.`);
  }
  const owner = new Uint8Array(getBase58Encoder().encode(ownerAddress));
  const item = { owner, tags: [{ name: 'Content-Type', value: contentType }, { name: 'App-Name', value: 'SolanaOS' }, ...extraTags], data };
  const signature = await sign(await signatureData(item));
  const body = assemble(item, signature);
  const res = await fetch(`${IRYS_UPLOADER}/tx/solana`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: body as BodyInit,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Irys refused the upload (HTTP ${res.status}${text ? `: ${text.slice(0, 160)}` : ''}).`);
  }
  // Prefer the id the node reports; it matches what we compute from the signature.
  const reported = await res.json().then((j: { id?: unknown }) => (typeof j?.id === 'string' ? j.id : null)).catch(() => null);
  const id = reported ?? (await itemId(signature));
  return { id, url: `${IRYS_GATEWAY}/${id}` };
}

// Mint a picture as a Metaplex Core NFT: upload image + metadata to Irys, then create the asset.
import { generateKeyPairSigner, partiallySignTransaction } from '@solana/kit';
import { useWallet } from '../wallet/standard';
import { assertCanWrite, buildTransaction, signAndSendAll, signBytes, walletSigner, WalletError } from '../wallet/tx';
import { createAssetInstruction } from './core';
import { uploadToIrys } from './irys';

export type MintStep = 'upload-image' | 'upload-metadata' | 'mint' | 'done';

export interface MintResult {
  asset: string;
  signature: string;
  imageUrl: string;
  metadataUrl: string;
}

export function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; type: string } {
  const m = dataUrl.match(/^data:([^;,]+);base64,(.*)$/);
  if (!m) throw new Error('Not a base64 data URL');
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, type: m[1] };
}

export function metadataJson(name: string, description: string, imageUrl: string) {
  return {
    name,
    symbol: 'SOSART',
    description,
    image: imageUrl,
    attributes: [{ trait_type: 'Made with', value: 'SolanaOS Paint' }],
    properties: { files: [{ uri: imageUrl, type: 'image/png' }], category: 'image' },
  };
}

export async function mintPicture(
  image: { bytes: Uint8Array; type: string },
  name: string,
  description: string,
  onStep: (s: MintStep) => void,
): Promise<MintResult> {
  assertCanWrite();
  const conn = useWallet.getState().connection;
  if (!conn) throw new WalletError('Connect a wallet first.');
  onStep('upload-image');
  const img = await uploadToIrys(image.bytes, image.type, conn.address, signBytes);
  onStep('upload-metadata');
  const json = new TextEncoder().encode(JSON.stringify(metadataJson(name, description, img.url)));
  const meta = await uploadToIrys(json, 'application/json', conn.address, signBytes);
  onStep('mint');
  const asset = await generateKeyPairSigner();
  const ix = createAssetInstruction({ asset, payer: walletSigner(), owner: conn.address, name, uri: meta.url });
  const tx = await partiallySignTransaction([asset.keyPair], await buildTransaction([ix]));
  const [signature] = await signAndSendAll([tx]);
  onStep('done');
  return { asset: asset.address, signature, imageUrl: img.url, metadataUrl: meta.url };
}

// A plain-text "signed message" block, like PGP clearsigning, verified with Ed25519.
import { address, getBase58Encoder, getPublicKeyFromAddress, signatureBytes, verifySignature } from '@solana/kit';

const BEGIN = '-----BEGIN SOLANA SIGNED MESSAGE-----';
const SIG = '-----BEGIN SIGNATURE-----';
const END = '-----END SOLANA SIGNED MESSAGE-----';

export function formatSigned(message: string, signer: string, signature: string): string {
  return `${BEGIN}\n${message}\n${SIG}\nAddress: ${signer}\nSignature: ${signature}\n${END}\n`;
}

export interface SignedBlock {
  message: string;
  address: string;
  signature: string;
}

/** Find and parse the first signed block in some text. */
export function parseSigned(text: string): SignedBlock | null {
  const t = text.replace(/\r\n/g, '\n');
  const b = t.indexOf(`${BEGIN}\n`);
  const s = t.indexOf(`\n${SIG}\n`, b);
  const e = t.indexOf(END, s);
  if (b < 0 || s < 0 || e < 0) return null;
  const message = t.slice(b + BEGIN.length + 1, s);
  const tail = t.slice(s + SIG.length + 2, e);
  const addr = tail.match(/^Address:\s*(\S+)/m)?.[1];
  const sig = tail.match(/^Signature:\s*(\S+)/m)?.[1];
  if (!addr || !sig) return null;
  return { message, address: addr, signature: sig };
}

export async function verifySigned(block: SignedBlock): Promise<boolean> {
  try {
    const key = await getPublicKeyFromAddress(address(block.address));
    const sig = signatureBytes(new Uint8Array(getBase58Encoder().encode(block.signature)));
    return await verifySignature(key, sig, new TextEncoder().encode(block.message));
  } catch {
    return false;
  }
}

import { LAMPORTS_PER_SOL, confirmSignature, requestAirdrop } from '../solana/rpc';
import { chainFor, useSettings } from '../settings';

export const FAUCET_URL = 'https://faucet.solana.com';

/** Request devnet SOL. The public faucet is heavily rate-limited, so errors explain the alternative. */
export async function airdrop(address: string, sol = 1): Promise<string> {
  if (chainFor(useSettings.getState()) !== 'solana:devnet') throw new Error('Airdrops only work on Devnet.');
  try {
    const sig = await requestAirdrop(address, Math.round(sol * LAMPORTS_PER_SOL));
    await confirmSignature(sig);
    return sig;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `The Devnet faucet didn't send SOL (${msg}). It limits how often each address and IP can ask. Try again later, or use ${FAUCET_URL}.`,
    );
  }
}

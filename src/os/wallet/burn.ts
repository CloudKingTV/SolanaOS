// Burn unwanted tokens and close their accounts to reclaim the rent deposit.
import { address, createNoopSigner, type Instruction } from '@solana/kit';
import { getBurnInstruction, getCloseAccountInstruction } from '@solana-program/token';
import { TOKEN_2022_PROGRAM, TOKEN_PROGRAM, type ParsedTokenAccount } from '../solana/rpc';

export interface BurnPlan {
  /** Accounts that will be closed (after burning any balance). */
  accounts: ParsedTokenAccount[];
  /** Accounts with a balance that will be burned first. */
  burns: ParsedTokenAccount[];
  /** Lamports returned to the owner when the accounts close (includes unwrapped SOL for wSOL). */
  reclaimLamports: number;
  skipped: { account: ParsedTokenAccount; reason: string }[];
}

/** Accounts per transaction: each needs up to two instructions, and transactions are capped at 1232 bytes. */
export const BATCH_SIZE = 8;

export function planBurn(accounts: ParsedTokenAccount[], owner: string): BurnPlan {
  const plan: BurnPlan = { accounts: [], burns: [], reclaimLamports: 0, skipped: [] };
  for (const a of accounts) {
    if (a.owner !== owner) plan.skipped.push({ account: a, reason: 'Not owned by this wallet' });
    else if (a.programId !== TOKEN_PROGRAM && a.programId !== TOKEN_2022_PROGRAM) plan.skipped.push({ account: a, reason: 'Unknown token program' });
    else if (a.state === 'frozen') plan.skipped.push({ account: a, reason: 'Frozen by the token issuer' });
    else {
      plan.accounts.push(a);
      // Wrapped SOL is never burned: closing the account returns the SOL itself.
      if (a.amount !== '0' && !a.isNative) plan.burns.push(a);
      plan.reclaimLamports += a.lamports;
    }
  }
  return plan;
}

export function burnInstructions(a: ParsedTokenAccount, owner: string): Instruction[] {
  const signer = createNoopSigner(address(owner));
  const config = { programAddress: address(a.programId) };
  const ixs: Instruction[] = [];
  if (a.amount !== '0' && !a.isNative) {
    ixs.push(getBurnInstruction({ account: address(a.pubkey), mint: address(a.mint), authority: signer, amount: BigInt(a.amount) }, config));
  }
  ixs.push(getCloseAccountInstruction({ account: address(a.pubkey), destination: address(owner), owner: signer }, config));
  return ixs;
}

/** Instruction groups, one per transaction. */
export function burnBatches(plan: BurnPlan, owner: string): Instruction[][] {
  const out: Instruction[][] = [];
  for (let i = 0; i < plan.accounts.length; i += BATCH_SIZE) {
    out.push(plan.accounts.slice(i, i + BATCH_SIZE).flatMap((a) => burnInstructions(a, owner)));
  }
  return out;
}

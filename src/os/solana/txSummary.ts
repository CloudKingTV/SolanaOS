import type { ParsedTransaction, TokenBalance } from './rpc';
import { formatAmount, formatSol } from './rpc';
import { programName } from './programs';

export interface TokenDelta {
  mint: string;
  owner?: string;
  /** Raw base-unit change, as a decimal string (may be negative). */
  delta: string;
  decimals: number;
}

export interface SolDelta {
  account: string;
  lamports: number;
}

export function solDeltas(tx: ParsedTransaction): SolDelta[] {
  const keys = tx.transaction.message.accountKeys;
  const pre = tx.meta?.preBalances ?? [];
  const post = tx.meta?.postBalances ?? [];
  return keys.map((k, i) => ({ account: k.pubkey, lamports: (post[i] ?? 0) - (pre[i] ?? 0) }));
}

/** Net token balance changes per (owner, mint). */
export function tokenDeltas(tx: ParsedTransaction): TokenDelta[] {
  const map = new Map<string, { mint: string; owner?: string; delta: bigint; decimals: number }>();
  const add = (list: TokenBalance[] | undefined, sign: 1n | -1n) => {
    for (const b of list ?? []) {
      const key = `${b.owner ?? b.accountIndex}:${b.mint}`;
      const cur = map.get(key) ?? { mint: b.mint, owner: b.owner, delta: 0n, decimals: b.uiTokenAmount.decimals };
      cur.delta += sign * BigInt(b.uiTokenAmount.amount);
      map.set(key, cur);
    }
  };
  add(tx.meta?.preTokenBalances, -1n);
  add(tx.meta?.postTokenBalances, 1n);
  return [...map.values()].filter((d) => d.delta !== 0n).map((d) => ({ ...d, delta: d.delta.toString() }));
}

export function memoOf(tx: ParsedTransaction): string | null {
  for (const ix of tx.transaction.message.instructions) {
    if ((ix.program === 'spl-memo' || programName(ix.programId)?.startsWith('Memo')) && typeof ix.parsed === 'string') return ix.parsed;
  }
  return null;
}

export interface Summary {
  failed: boolean;
  direction: 'in' | 'out' | 'self' | 'other';
  subject: string;
  counterparty: string | null;
  memo: string | null;
  solChange: number;
  tokenChanges: TokenDelta[];
}

/**
 * Describe a transaction from one wallet's point of view, like an email subject line.
 * `label` turns a mint into a display symbol.
 */
export function summarize(tx: ParsedTransaction, wallet: string, label: (mint: string) => string = (m) => `${m.slice(0, 4)}…`): Summary {
  const failed = !!tx.meta?.err;
  const keys = tx.transaction.message.accountKeys;
  const feePayer = keys[0]?.pubkey;
  const sol = solDeltas(tx);
  const mine = sol.find((d) => d.account === wallet)?.lamports ?? 0;
  // Ignore the fee when judging direction for the payer.
  const solChange = feePayer === wallet ? mine + (tx.meta?.fee ?? 0) : mine;
  const tokens = tokenDeltas(tx);
  const myTokens = tokens.filter((t) => t.owner === wallet);
  const memo = memoOf(tx);

  let direction: Summary['direction'] = 'other';
  let subject: string;
  let counterparty: string | null = null;

  const tokenIn = myTokens.find((t) => !t.delta.startsWith('-'));
  const tokenOut = myTokens.find((t) => t.delta.startsWith('-'));

  if (tokenIn && tokenOut) {
    direction = 'self';
    subject = `Swapped ${formatAmount(tokenOut.delta.slice(1), tokenOut.decimals, 4)} ${label(tokenOut.mint)} for ${formatAmount(tokenIn.delta, tokenIn.decimals, 4)} ${label(tokenIn.mint)}`;
  } else if (tokenIn) {
    direction = 'in';
    subject = `You received ${formatAmount(tokenIn.delta, tokenIn.decimals, 4)} ${label(tokenIn.mint)}`;
    counterparty = tokens.find((t) => t.mint === tokenIn.mint && t.delta.startsWith('-'))?.owner ?? feePayer ?? null;
  } else if (tokenOut) {
    direction = 'out';
    subject = `You sent ${formatAmount(tokenOut.delta.slice(1), tokenOut.decimals, 4)} ${label(tokenOut.mint)}`;
    counterparty = tokens.find((t) => t.mint === tokenOut.mint && !t.delta.startsWith('-') && t.owner !== wallet)?.owner ?? null;
  } else if (solChange > 0) {
    direction = 'in';
    subject = `You received ${formatSol(solChange, 6)} SOL`;
    counterparty = [...sol].sort((a, b) => a.lamports - b.lamports)[0]?.account ?? feePayer ?? null;
  } else if (solChange < 0) {
    direction = 'out';
    subject = `You sent ${formatSol(-solChange, 6)} SOL`;
    counterparty = [...sol].filter((d) => d.account !== wallet).sort((a, b) => b.lamports - a.lamports)[0]?.account ?? null;
  } else {
    const ix = tx.transaction.message.instructions.find((i) => !programName(i.programId)?.startsWith('Compute Budget'));
    const name = ix ? (programName(ix.programId) ?? 'a program') : 'a program';
    subject = memo ? `Message: ${memo.slice(0, 60)}` : `Interaction with ${name}`;
    counterparty = feePayer === wallet ? null : (feePayer ?? null);
  }
  if (counterparty === wallet) counterparty = null;
  if (failed) subject = `Failed: ${subject}`;
  return { failed, direction, subject, counterparty, memo, solChange, tokenChanges: myTokens };
}

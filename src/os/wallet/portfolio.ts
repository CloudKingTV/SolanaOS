// The connected (or viewed) wallet's SOL and token holdings, refreshed on a timer.
import { create } from 'zustand';
import { getBalance, getTokenAccounts, formatSol, type ParsedTokenAccount } from '../solana/rpc';
import { getTokenMetadata, type TokenMeta } from '../solana/metadata';
import { useWallet } from './standard';
import { useSettings, rpcUrlFor } from '../settings';
import { showBalloon } from '../session';
import { openApp } from '../windows';

export interface Holding extends ParsedTokenAccount {
  meta: TokenMeta | null;
}

interface PortfolioState {
  owner: string | null;
  endpoint: string | null;
  lamports: number | null;
  tokens: Holding[];
  loading: boolean;
  error: string | null;
  updated: number | null;
}

export const usePortfolio = create<PortfolioState>(() => ({
  owner: null,
  endpoint: null,
  lamports: null,
  tokens: [],
  loading: false,
  error: null,
  updated: null,
}));

export function tokenLabel(h: Pick<Holding, 'meta' | 'mint'>): string {
  return h.meta?.symbol || h.meta?.name || `${h.mint.slice(0, 4)}…${h.mint.slice(-4)}`;
}

export const isCollectible = (h: ParsedTokenAccount) => h.decimals === 0 && h.amount === '1';
export const isEmpty = (h: ParsedTokenAccount) => h.amount === '0';

export async function fetchPortfolio(owner: string): Promise<{ lamports: number; tokens: Holding[] }> {
  const [lamports, accounts] = await Promise.all([getBalance(owner), getTokenAccounts(owner)]);
  const metas = await getTokenMetadata(accounts.map((a) => ({ mint: a.mint, programId: a.programId })));
  const tokens = accounts
    .map((a) => ({ ...a, meta: metas.get(a.mint) ?? null }))
    .sort((a, b) => Number(isEmpty(a)) - Number(isEmpty(b)) || tokenLabel(a).localeCompare(tokenLabel(b)));
  return { lamports, tokens };
}

let inflight: Promise<void> | null = null;

/** Refresh holdings for the connected wallet; announces incoming funds with a balloon. */
export function refreshPortfolio(): Promise<void> {
  const owner = useWallet.getState().connection?.address ?? null;
  const endpoint = rpcUrlFor(useSettings.getState());
  if (!owner) {
    usePortfolio.setState({ owner: null, lamports: null, tokens: [], error: null, updated: null, endpoint });
    return Promise.resolve();
  }
  if (inflight) return inflight;
  const prev = usePortfolio.getState();
  const sameView = prev.owner === owner && prev.endpoint === endpoint && prev.lamports !== null;
  if (!sameView) usePortfolio.setState({ owner, endpoint, lamports: null, tokens: [], error: null });
  usePortfolio.setState({ loading: true });
  inflight = fetchPortfolio(owner)
    .then(({ lamports, tokens }) => {
      // Ignore results if the wallet or cluster changed while loading.
      if (useWallet.getState().connection?.address !== owner || rpcUrlFor(useSettings.getState()) !== endpoint) return;
      if (sameView) announceChanges(prev.lamports!, prev.tokens, lamports, tokens);
      usePortfolio.setState({ owner, endpoint, lamports, tokens, error: null, updated: Date.now() });
    })
    .catch((e: unknown) => usePortfolio.setState({ error: e instanceof Error ? e.message : String(e) }))
    .finally(() => {
      usePortfolio.setState({ loading: false });
      inflight = null;
    });
  return inflight;
}

function announceChanges(prevLamports: number, prevTokens: Holding[], lamports: number, tokens: Holding[]) {
  const gained = lamports - prevLamports;
  if (gained > 0) {
    showBalloon({
      title: 'SOL received',
      icon: 'wallet',
      message: `You received ${formatSol(gained, 9)} SOL. Click to open My Wallet.`,
      onClick: () => openApp('mywallet'),
    });
    return;
  }
  const known = new Set(prevTokens.map((t) => t.pubkey));
  const fresh = tokens.find((t) => !known.has(t.pubkey) && !isEmpty(t));
  if (fresh) {
    showBalloon({
      title: 'Found New Token',
      icon: 'wallet',
      message: `${tokenLabel(fresh)} arrived in your wallet. Click to open My Wallet.`,
      onClick: () => openApp('mywallet'),
    });
  }
}

/** Lamports locked as rent deposits in token accounts (what the Burn Bin can reclaim from empty ones). */
export function rentLocked(tokens: ParsedTokenAccount[]): number {
  return tokens.filter((t) => !t.isNative).reduce((s, t) => s + t.lamports, 0);
}

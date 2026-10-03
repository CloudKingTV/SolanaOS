// Minimal read-only JSON-RPC client. Phase 2 moves signing flows to @solana/kit + Wallet Standard.
import { useSettings, rpcUrlFor } from '../settings';

export const LAMPORTS_PER_SOL = 1_000_000_000;

export class RpcError extends Error {
  constructor(
    message: string,
    public code?: number,
  ) {
    super(message);
  }
}

let nextId = 1;

export async function rpc<T>(method: string, params: unknown[] = [], url?: string): Promise<T> {
  const endpoint = url ?? rpcUrlFor(useSettings.getState());
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  });
  if (!res.ok) throw new RpcError(`HTTP ${res.status} from RPC`, res.status);
  const body = await res.json();
  if (body.error) throw new RpcError(body.error.message ?? 'RPC error', body.error.code);
  return body.result as T;
}

export interface EpochInfo {
  absoluteSlot: number;
  blockHeight: number;
  epoch: number;
  slotIndex: number;
  slotsInEpoch: number;
  transactionCount?: number;
}

export interface PerfSample {
  slot: number;
  numTransactions: number;
  numNonVoteTransactions?: number;
  numSlots: number;
  samplePeriodSecs: number;
}

export interface VoteAccount {
  votePubkey: string;
  nodePubkey: string;
  activatedStake: number;
  commission: number;
  lastVote: number;
  epochVoteAccount: boolean;
}

export const getSlot = () => rpc<number>('getSlot');
export const getEpochInfo = () => rpc<EpochInfo>('getEpochInfo');
export const getVersion = () => rpc<{ 'solana-core': string }>('getVersion');
export const getBlockHeight = () => rpc<number>('getBlockHeight');
export const getRecentPerformanceSamples = (limit = 30) =>
  rpc<PerfSample[]>('getRecentPerformanceSamples', [limit]);
export const getVoteAccounts = () =>
  rpc<{ current: VoteAccount[]; delinquent: VoteAccount[] }>('getVoteAccounts');
export const getBalance = (address: string) =>
  rpc<{ value: number }>('getBalance', [address]).then((r) => r.value);
export const getHealth = () => rpc<string>('getHealth');

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export function isLikelyAddress(s: string): boolean {
  return BASE58.test(s);
}

export function formatSol(lamports: number, digits = 4): string {
  return (lamports / LAMPORTS_PER_SOL).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function tpsFromSamples(samples: PerfSample[]): number[] {
  // RPC returns newest first; graphs read oldest → newest.
  return samples
    .slice()
    .reverse()
    .map((s) => (s.samplePeriodSecs > 0 ? s.numTransactions / s.samplePeriodSecs : 0));
}

export function shortAddress(a: string): string {
  return a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

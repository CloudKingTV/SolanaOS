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

// ---- Phase 2: account, token and transaction queries ----

export interface ParsedTokenAccount {
  pubkey: string;
  mint: string;
  owner: string;
  programId: string;
  /** Raw amount in base units. */
  amount: string;
  decimals: number;
  uiAmount: number;
  isNative: boolean;
  state: 'initialized' | 'frozen' | string;
  /** Lamports held by the account (its rent deposit, plus wrapped SOL for native accounts). */
  lamports: number;
}

export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const NATIVE_MINT = 'So11111111111111111111111111111111111111112';

interface RawParsedTokenAccount {
  pubkey: string;
  account: {
    lamports: number;
    owner: string;
    data: {
      parsed: {
        info: {
          mint: string;
          owner: string;
          isNative: boolean;
          state: string;
          tokenAmount: { amount: string; decimals: number; uiAmount: number | null; uiAmountString: string };
        };
      };
    };
  };
}

export function toParsedTokenAccount(raw: RawParsedTokenAccount): ParsedTokenAccount {
  const info = raw.account.data.parsed.info;
  return {
    pubkey: raw.pubkey,
    mint: info.mint,
    owner: info.owner,
    programId: raw.account.owner,
    amount: info.tokenAmount.amount,
    decimals: info.tokenAmount.decimals,
    uiAmount: Number(info.tokenAmount.uiAmountString ?? info.tokenAmount.uiAmount ?? 0),
    isNative: !!info.isNative,
    state: info.state,
    lamports: raw.account.lamports,
  };
}

export async function getTokenAccounts(owner: string): Promise<ParsedTokenAccount[]> {
  const lists = await Promise.all(
    [TOKEN_PROGRAM, TOKEN_2022_PROGRAM].map((programId) =>
      rpc<{ value: RawParsedTokenAccount[] }>('getTokenAccountsByOwner', [owner, { programId }, { encoding: 'jsonParsed', commitment: 'confirmed' }]).then(
        (r) => r.value.map(toParsedTokenAccount),
      ),
    ),
  );
  return lists.flat();
}

export interface AccountInfo<D = unknown> {
  lamports: number;
  owner: string;
  executable: boolean;
  space?: number;
  data: D;
}

export const getAccountInfo = <D = unknown>(address: string, encoding: 'jsonParsed' | 'base64' = 'jsonParsed') =>
  rpc<{ value: AccountInfo<D> | null }>('getAccountInfo', [address, { encoding, commitment: 'confirmed' }]).then((r) => r.value);

export const getMultipleAccounts = <D = unknown>(addresses: string[], encoding: 'jsonParsed' | 'base64' = 'base64') =>
  rpc<{ value: (AccountInfo<D> | null)[] }>('getMultipleAccounts', [addresses, { encoding, commitment: 'confirmed' }]).then((r) => r.value);

export const getLatestBlockhash = () =>
  rpc<{ value: { blockhash: string; lastValidBlockHeight: number } }>('getLatestBlockhash', [{ commitment: 'confirmed' }]).then((r) => r.value);

export const sendRawTransaction = (base64: string) =>
  rpc<string>('sendTransaction', [base64, { encoding: 'base64', preflightCommitment: 'confirmed' }]);

export interface SignatureStatus {
  slot: number;
  confirmations: number | null;
  err: unknown;
  confirmationStatus?: 'processed' | 'confirmed' | 'finalized';
}

export const getSignatureStatuses = (signatures: string[]) =>
  rpc<{ value: (SignatureStatus | null)[] }>('getSignatureStatuses', [signatures, { searchTransactionHistory: false }]).then((r) => r.value);

export interface SignatureInfo {
  signature: string;
  slot: number;
  err: unknown;
  memo: string | null;
  blockTime: number | null;
}

export const getSignaturesForAddress = (address: string, limit = 25, before?: string) =>
  rpc<SignatureInfo[]>('getSignaturesForAddress', [address, { limit, ...(before ? { before } : {}) }]);

export interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  programId?: string;
  uiTokenAmount: { amount: string; decimals: number; uiAmountString: string };
}

export interface ParsedInstruction {
  programId: string;
  program?: string;
  parsed?: unknown;
  data?: string;
  accounts?: string[];
  stackHeight?: number | null;
}

export interface ParsedTransaction {
  slot: number;
  blockTime: number | null;
  meta: {
    err: unknown;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
    logMessages?: string[] | null;
    innerInstructions?: { index: number; instructions: ParsedInstruction[] }[] | null;
  } | null;
  transaction: {
    signatures: string[];
    message: {
      accountKeys: { pubkey: string; signer: boolean; writable: boolean; source?: string }[];
      instructions: ParsedInstruction[];
      recentBlockhash: string;
    };
  };
  version?: number | 'legacy';
}

export const getTransaction = (signature: string) =>
  rpc<ParsedTransaction | null>('getTransaction', [
    signature,
    { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' },
  ]);

export const requestAirdrop = (address: string, lamports: number) => rpc<string>('requestAirdrop', [address, lamports]);

const SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
export function isLikelySignature(s: string): boolean {
  return SIG_RE.test(s);
}

/** Poll until a signature reaches `confirmed`, fails, or times out. */
export async function confirmSignature(signature: string, timeoutMs = 60_000, intervalMs = 1500): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const [status] = await getSignatureStatuses([signature]);
    if (status?.err) throw new RpcError(`Transaction failed: ${JSON.stringify(status.err)}`);
    if (status && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new RpcError('Timed out waiting for confirmation. The transaction may still land; check it in Solana Explorer.');
}

export function formatAmount(raw: string, decimals: number, maxFraction = decimals): string {
  const neg = raw.startsWith('-');
  const digits = (neg ? raw.slice(1) : raw).padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  let frac = decimals ? digits.slice(digits.length - decimals) : '';
  frac = frac.slice(0, maxFraction).replace(/0+$/, '');
  const w = BigInt(whole).toLocaleString('en-US');
  return `${neg ? '-' : ''}${w}${frac ? `.${frac}` : ''}`;
}

/** Parse a user-typed decimal amount into base units. Returns null if invalid or too precise. */
export function parseAmount(input: string, decimals: number): bigint | null {
  const s = input.trim().replace(/,/g, '');
  if (!/^\d*(\.\d*)?$/.test(s) || s === '' || s === '.') return null;
  const [w, f = ''] = s.split('.');
  if (f.length > decimals) return null;
  return BigInt(w || '0') * 10n ** BigInt(decimals) + BigInt(f.padEnd(decimals, '0') || '0');
}

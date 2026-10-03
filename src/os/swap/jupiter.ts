// Swaps through Jupiter's Swap API. Jupiter routes on Mainnet only and needs an API key
// (free from portal.jup.ag), which the user enters in Network Settings.
import { getTransactionDecoder, type Transaction } from '@solana/kit';
import { useSettings } from '../settings';

export const JUPITER_API = 'https://api.jup.ag/swap/v1';
export const JUPITER_PORTAL = 'https://portal.jup.ag';

export interface SwapToken {
  mint: string;
  symbol: string;
  decimals: number;
}

export const POPULAR_TOKENS: SwapToken[] = [
  { mint: 'So11111111111111111111111111111111111111112', symbol: 'SOL', decimals: 9 },
  { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', decimals: 6 },
  { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT', decimals: 6 },
  { mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', symbol: 'JUP', decimals: 6 },
  { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', symbol: 'BONK', decimals: 5 },
  { mint: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', symbol: 'JitoSOL', decimals: 9 },
  { mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', symbol: 'mSOL', decimals: 9 },
  { mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', symbol: 'WIF', decimals: 6 },
  { mint: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3', symbol: 'PYTH', decimals: 6 },
];

export interface Quote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: { swapInfo: { label?: string }; percent: number }[];
}

function headers(): Record<string, string> {
  const key = useSettings.getState().jupiterApiKey.trim();
  if (!key) throw new Error('Add your Jupiter API key in Control Panel → Network Settings to use swaps.');
  return { 'x-api-key': key };
}

async function jfetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) throw new Error('Jupiter rejected the API key. Check it in Network Settings.');
    let detail = text;
    try {
      detail = (JSON.parse(text) as { error?: string; errorCode?: string }).error ?? text;
    } catch {
      // Not JSON.
    }
    throw new Error(`Jupiter: ${detail || `HTTP ${res.status}`}`);
  }
  return res.json() as Promise<T>;
}

export function quoteUrl(inputMint: string, outputMint: string, amount: bigint, slippageBps: number): string {
  const q = new URLSearchParams({ inputMint, outputMint, amount: amount.toString(), slippageBps: String(slippageBps), restrictIntermediateTokens: 'true' });
  return `${JUPITER_API}/quote?${q}`;
}

export async function getQuote(inputMint: string, outputMint: string, amount: bigint, slippageBps: number): Promise<Quote> {
  return jfetch<Quote>(quoteUrl(inputMint, outputMint, amount, slippageBps), { headers: headers() });
}

/** Ask Jupiter to build the swap transaction for this quote, paid for by `user`. */
export async function getSwapTransaction(quote: Quote, user: string): Promise<Transaction> {
  const res = await jfetch<{ swapTransaction: string }>(`${JUPITER_API}/swap`, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ quoteResponse: quote, userPublicKey: user, dynamicComputeUnitLimit: true, wrapAndUnwrapSol: true }),
  });
  const bin = atob(res.swapTransaction);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return getTransactionDecoder().decode(bytes);
}

export function routeLabel(q: Quote): string {
  const labels = [...new Set(q.routePlan.map((r) => r.swapInfo.label).filter(Boolean))];
  return labels.length ? labels.join(' → ') : 'Jupiter';
}

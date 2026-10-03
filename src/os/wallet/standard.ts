// Wallet Standard discovery and connection. Wallets (Phantom, Solflare, Backpack, ...)
// register themselves on the page; we never see or store private keys.
import { create } from 'zustand';
import { getWallets } from '@wallet-standard/app';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import { useSettings } from '../settings';

export const CONNECT = 'standard:connect';
export const DISCONNECT = 'standard:disconnect';
export const EVENTS = 'standard:events';
export const SIGN_TX = 'solana:signTransaction';
export const SIGN_AND_SEND = 'solana:signAndSendTransaction';
export const SIGN_MESSAGE = 'solana:signMessage';

interface ConnectFeature {
  connect(input?: { silent?: boolean }): Promise<{ accounts: readonly WalletAccount[] }>;
}
interface DisconnectFeature {
  disconnect(): Promise<void>;
}
interface EventsFeature {
  on(event: 'change', listener: (props: { accounts?: readonly WalletAccount[] }) => void): () => void;
}
export interface SignTxFeature {
  signTransaction(
    ...inputs: { account: WalletAccount; transaction: Uint8Array; chain?: string }[]
  ): Promise<readonly { signedTransaction: Uint8Array }[]>;
}
export interface SignAndSendFeature {
  signAndSendTransaction(
    ...inputs: { account: WalletAccount; transaction: Uint8Array; chain: string; options?: Record<string, unknown> }[]
  ): Promise<readonly { signature: Uint8Array }[]>;
}
export interface SignMessageFeature {
  signMessage(...inputs: { account: WalletAccount; message: Uint8Array }[]): Promise<readonly { signedMessage: Uint8Array; signature: Uint8Array }[]>;
}

export function feature<T>(wallet: Wallet, name: string): T | undefined {
  return (wallet.features as Record<string, unknown>)[name] as T | undefined;
}

export function isSolanaWallet(w: Wallet): boolean {
  return (
    w.chains.some((c) => c.startsWith('solana:')) &&
    CONNECT in w.features &&
    (SIGN_TX in w.features || SIGN_AND_SEND in w.features)
  );
}

export interface Connection {
  wallet: Wallet;
  account: WalletAccount;
  address: string;
}

interface WalletState {
  wallets: Wallet[];
  connection: Connection | null;
  connecting: string | null;
}

export const useWallet = create<WalletState>(() => ({ wallets: [], connection: null, connecting: null }));

let started = false;
/** Start listening for wallets that register on the page. Safe to call repeatedly. */
export function initWallets() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const api = getWallets();
  const refresh = () => {
    const seen = new Set<string>();
    const wallets = api.get().filter((w) => isSolanaWallet(w) && !seen.has(w.name) && seen.add(w.name));
    useWallet.setState({ wallets });
  };
  refresh();
  api.on('register', refresh);
  api.on('unregister', refresh);
}

let unsubscribeEvents: (() => void) | null = null;

function attach(wallet: Wallet, account: WalletAccount) {
  unsubscribeEvents?.();
  useWallet.setState({ connection: { wallet, account, address: account.address }, connecting: null });
  const events = feature<EventsFeature>(wallet, EVENTS);
  unsubscribeEvents =
    events?.on('change', ({ accounts }) => {
      if (!accounts) return;
      const cur = useWallet.getState().connection;
      if (!cur || cur.wallet !== wallet) return;
      const next = accounts.find((a) => a.chains.some((c) => c.startsWith('solana:'))) ?? accounts[0];
      if (!next) {
        useWallet.setState({ connection: null });
        onExternalDisconnect?.();
      } else if (next.address !== cur.address) {
        useWallet.setState({ connection: { wallet, account: next, address: next.address } });
      }
    }) ?? null;
}

/** Called when the wallet disconnects itself (e.g. locked from the extension). */
let onExternalDisconnect: (() => void) | null = null;
export function setExternalDisconnectHandler(fn: (() => void) | null) {
  onExternalDisconnect = fn;
}

export async function connectWallet(wallet: Wallet, silent = false): Promise<Connection> {
  const connect = feature<ConnectFeature>(wallet, CONNECT);
  if (!connect) throw new Error(`${wallet.name} can't connect to websites.`);
  useWallet.setState({ connecting: wallet.name });
  try {
    const { accounts } = await connect.connect(silent ? { silent: true } : undefined);
    const account = accounts.find((a) => a.chains.some((c) => c.startsWith('solana:'))) ?? accounts[0];
    if (!account) throw new Error(`${wallet.name} didn't share an account.`);
    attach(wallet, account);
    useSettings.getState().update({ lastWallet: wallet.name });
    return useWallet.getState().connection!;
  } finally {
    if (useWallet.getState().connecting === wallet.name) useWallet.setState({ connecting: null });
  }
}

/** Try to reconnect to the last wallet without a popup (wallets that already trust this site). */
export async function reconnectSilently(): Promise<Connection | null> {
  const name = useSettings.getState().lastWallet;
  const wallet = useWallet.getState().wallets.find((w) => w.name === name);
  if (!wallet) return null;
  try {
    return await connectWallet(wallet, true);
  } catch {
    return null;
  }
}

/** Disconnect. `keepLast` remembers the wallet so it's listed first at the next logon. */
export async function disconnectWallet(keepLast = false) {
  const cur = useWallet.getState().connection;
  unsubscribeEvents?.();
  unsubscribeEvents = null;
  useWallet.setState({ connection: null });
  if (!keepLast) useSettings.getState().update({ lastWallet: '' });
  if (cur) await feature<DisconnectFeature>(cur.wallet, DISCONNECT)?.disconnect().catch(() => {});
}

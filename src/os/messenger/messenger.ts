// SolMessenger: wallet-to-wallet chat carried in on-chain memos.
//
// A message is one transaction with two instructions: a Memo (signed by the sender) holding the
// text, and a 0-lamport System transfer from sender to recipient. The transfer puts both wallets
// in the transaction, so the message shows up in both addresses' signature history, and its
// source/destination tell us who sent it to whom. Everything is public and permanent.
import { AccountRole, address, type Instruction } from '@solana/kit';
import { create } from 'zustand';
import { networkKey, useSettings } from '../settings';
import { getTransaction, isLikelyAddress, rpc, type ParsedTransaction, type SignatureInfo } from '../solana/rpc';
import { memoOf } from '../solana/txSummary';
import { solTransfer } from '../wallet/send';
import { signAndSend } from '../wallet/tx';
import { useWallet } from '../wallet/standard';
import { showBalloon } from '../session';
import { sounds } from '../sound';

export const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
export const NUDGE = '/nudge';
/** Keeps the transaction well under the 1232-byte packet limit. */
export const MAX_MESSAGE_BYTES = 500;
export const POLL_MS = 20_000;

export interface ChatMessage {
  signature: string;
  from: string;
  to: string;
  text: string;
  /** Unix seconds; null for messages still being confirmed. */
  time: number | null;
  nudge: boolean;
}

export interface Contact {
  address: string;
  name: string;
}

export function messageBytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function messageInstructions(from: string, to: string, text: string): Instruction[] {
  const memo: Instruction = {
    programAddress: address(MEMO_PROGRAM),
    accounts: [{ address: address(from), role: AccountRole.READONLY_SIGNER }],
    data: new TextEncoder().encode(text),
  };
  return [memo, ...solTransfer(from, to, 0n)];
}

interface TransferInfo {
  source?: string;
  destination?: string;
}

/** Turn a transaction into a chat message involving `me`, or null if it isn't one. */
export function parseChatMessage(tx: ParsedTransaction, signature: string, me: string): ChatMessage | null {
  if (tx.meta?.err) return null;
  const text = memoOf(tx);
  if (text == null) return null;
  let from: string | null = null;
  let to: string | null = null;
  for (const ix of tx.transaction.message.instructions) {
    const p = ix.parsed as { type?: string; info?: TransferInfo } | undefined;
    if (ix.program !== 'system' || p?.type !== 'transfer' || !p.info?.source || !p.info.destination) continue;
    if (p.info.source === me || p.info.destination === me) {
      from = p.info.source;
      to = p.info.destination;
      break;
    }
  }
  if (!from) {
    // A memo with no transfer to us: only usable if someone else paid for it and we're in it.
    const keys = tx.transaction.message.accountKeys;
    const payer = keys[0]?.pubkey;
    if (!payer || payer === me || !keys.some((k) => k.pubkey === me)) return null;
    from = payer;
    to = me;
  }
  if (from === to) return null;
  return { signature, from, to: to!, text, time: tx.blockTime, nudge: text.trim().toLowerCase() === NUDGE };
}

export function peerOf(m: ChatMessage, me: string): string {
  return m.from === me ? m.to : m.from;
}

// ---- Local storage ----

const CONTACTS_KEY = 'solanaos.messenger.contacts.v1';
const CACHE_PREFIX = 'solanaos.messenger.cache.v1:';
const READ_PREFIX = 'solanaos.messenger.read.v1:';
const MAX_CACHED = 400;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked; the chat still works for this session.
  }
}

interface Cache {
  messages: ChatMessage[];
  /** Newest signature we've scanned, used as the `until` cursor. */
  newest: string | null;
}

// ---- Store ----

interface MessengerState {
  /** `${networkKey}|${owner}` the messages belong to. */
  scope: string | null;
  messages: ChatMessage[];
  pending: ChatMessage[];
  contacts: Contact[];
  /** Per peer: time (unix s) of the newest message we've read. */
  read: Record<string, number>;
  loading: boolean;
  error: string | null;
  lastChecked: number | null;
  /** Bumped when a nudge arrives from a peer. */
  nudges: Record<string, number>;
}

export const useMessenger = create<MessengerState>(() => ({
  scope: null,
  messages: [],
  pending: [],
  contacts: load<Contact[]>(CONTACTS_KEY, []),
  read: {},
  loading: false,
  error: null,
  lastChecked: null,
  nudges: {},
}));

function currentScope(): { scope: string; owner: string } | null {
  const owner = useWallet.getState().connection?.address;
  if (!owner) return null;
  return { scope: `${networkKey(useSettings.getState())}|${owner}`, owner };
}

let newest: string | null = null;

function ensureScope(): { scope: string; owner: string } | null {
  const cur = currentScope();
  const s = useMessenger.getState();
  if (!cur) {
    if (s.scope) useMessenger.setState({ scope: null, messages: [], pending: [], read: {}, error: null, lastChecked: null });
    return null;
  }
  if (s.scope !== cur.scope) {
    const cache = load<Cache>(CACHE_PREFIX + cur.scope, { messages: [], newest: null });
    newest = cache.newest;
    useMessenger.setState({
      scope: cur.scope,
      messages: cache.messages,
      pending: [],
      read: load<Record<string, number>>(READ_PREFIX + cur.scope, {}),
      error: null,
      lastChecked: null,
    });
  }
  return cur;
}

function persist(scope: string) {
  const { messages } = useMessenger.getState();
  save(CACHE_PREFIX + scope, { messages: messages.slice(-MAX_CACHED), newest } satisfies Cache);
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

export function contactName(addr: string, contacts = useMessenger.getState().contacts): string {
  return contacts.find((c) => c.address === addr)?.name || `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

let checking: Promise<void> | null = null;

/** Fetch new messages since the last check. Announces new incoming ones unless `quiet`. */
export function checkMessages(quiet = false): Promise<void> {
  checking ??= doCheck(quiet).finally(() => {
    checking = null;
  });
  return checking;
}

async function doCheck(quiet: boolean) {
  const cur = ensureScope();
  if (!cur) return;
  const { scope, owner } = cur;
  const firstLoad = newest == null;
  useMessenger.setState({ loading: true, error: null });
  try {
    const sigs = await rpc<SignatureInfo[]>('getSignaturesForAddress', [owner, { limit: firstLoad ? 100 : 50, ...(newest ? { until: newest } : {}) }]);
    if (useMessenger.getState().scope !== scope) return;
    // getSignaturesForAddress reports memos, so we only fetch transactions that have one.
    const known = new Set(useMessenger.getState().messages.map((m) => m.signature));
    const candidates = sigs.filter((s) => s.memo && !s.err && !known.has(s.signature));
    const txs = await mapLimit(candidates, 4, (s) => getTransaction(s.signature).catch(() => null));
    if (useMessenger.getState().scope !== scope) return;
    const fresh: ChatMessage[] = [];
    candidates.forEach((s, i) => {
      const tx = txs[i];
      const m = tx && parseChatMessage(tx, s.signature, owner);
      if (m) fresh.push({ ...m, time: m.time ?? s.blockTime });
    });
    // Only advance the cursor past transactions we could actually read.
    const unreadable = candidates.some((_, i) => !txs[i]);
    if (sigs.length && !unreadable) newest = sigs[0].signature;
    const st = useMessenger.getState();
    const sentSigs = new Set(fresh.map((m) => m.signature));
    const messages = [...st.messages, ...fresh].sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity));
    useMessenger.setState({
      messages,
      pending: st.pending.filter((p) => !sentSigs.has(p.signature)),
      lastChecked: Date.now(),
    });
    persist(scope);

    const incoming = fresh.filter((m) => m.to === owner);
    if (!quiet && !firstLoad && incoming.length) announce(incoming);
  } catch (e) {
    if (useMessenger.getState().scope === scope) useMessenger.setState({ error: e instanceof Error ? e.message : String(e) });
  } finally {
    if (useMessenger.getState().scope === scope) useMessenger.setState({ loading: false });
  }
}

let onIncoming: ((peer: string) => void) | null = null;
/** The Messenger app registers how to open a conversation from a balloon or nudge. */
export function setIncomingHandler(fn: ((peer: string) => void) | null) {
  onIncoming = fn;
}

function announce(incoming: ChatMessage[]) {
  const nudges = incoming.filter((m) => m.nudge);
  if (nudges.length) {
    sounds.nudge();
    const n = { ...useMessenger.getState().nudges };
    for (const m of nudges) n[m.from] = (n[m.from] ?? 0) + 1;
    useMessenger.setState({ nudges: n });
    for (const m of nudges) onIncoming?.(m.from);
  } else {
    sounds.message();
  }
  const last = incoming[incoming.length - 1];
  showBalloon({
    title: `${contactName(last.from)} ${last.nudge ? 'sent you a nudge!' : 'says:'}`,
    message: last.nudge ? 'Click to open the conversation.' : last.text.slice(0, 120),
    icon: 'messenger',
    onClick: () => onIncoming?.(last.from),
  });
}

// Polling runs while any Messenger window is open.
let watchers = 0;
let timer: number | undefined;

export function watchMessages(): () => void {
  watchers++;
  if (watchers === 1) {
    void checkMessages(true);
    timer = window.setInterval(() => void checkMessages(), POLL_MS);
  }
  return () => {
    watchers--;
    if (watchers === 0) window.clearInterval(timer);
  };
}

// Reset when the wallet or network changes.
useWallet.subscribe((s, prev) => {
  if (s.connection?.address !== prev.connection?.address) {
    ensureScope();
    if (watchers) void checkMessages(true);
  }
});
useSettings.subscribe((s, prev) => {
  if (networkKey(s) !== networkKey(prev)) {
    ensureScope();
    if (watchers) void checkMessages(true);
  }
});

export async function sendMessage(to: string, text: string): Promise<string> {
  const cur = ensureScope();
  if (!cur) throw new Error('Connect a wallet first.');
  if (!isLikelyAddress(to)) throw new Error("That isn't a valid Solana address.");
  if (to === cur.owner) throw new Error("You can't message your own wallet.");
  const body = text.trim();
  if (!body) throw new Error('Type a message first.');
  if (messageBytes(body) > MAX_MESSAGE_BYTES) throw new Error(`Messages can be up to ${MAX_MESSAGE_BYTES} bytes.`);
  const placeholder: ChatMessage = { signature: `pending-${Date.now()}`, from: cur.owner, to, text: body, time: null, nudge: body.toLowerCase() === NUDGE };
  useMessenger.setState((s) => ({ pending: [...s.pending, placeholder] }));
  try {
    const signature = await signAndSend(messageInstructions(cur.owner, to, body));
    const sent: ChatMessage = { ...placeholder, signature, time: Math.floor(Date.now() / 1000) };
    useMessenger.setState((s) => {
      if (s.scope !== cur.scope) return {};
      return {
        pending: s.pending.filter((p) => p !== placeholder),
        messages: s.messages.some((m) => m.signature === signature) ? s.messages : [...s.messages, sent],
      };
    });
    persist(cur.scope);
    return signature;
  } catch (e) {
    useMessenger.setState((s) => ({ pending: s.pending.filter((p) => p !== placeholder) }));
    throw e;
  }
}

export function markRead(peer: string) {
  const cur = ensureScope();
  if (!cur) return;
  const s = useMessenger.getState();
  const latest = s.messages.filter((m) => peerOf(m, cur.owner) === peer).reduce((t, m) => Math.max(t, m.time ?? 0), 0);
  if ((s.read[peer] ?? 0) >= latest) return;
  const read = { ...s.read, [peer]: latest };
  useMessenger.setState({ read });
  save(READ_PREFIX + cur.scope, read);
}

export function unreadCount(messages: ChatMessage[], read: Record<string, number>, me: string, peer: string): number {
  const since = read[peer] ?? 0;
  return messages.filter((m) => m.from === peer && m.to === me && (m.time ?? 0) > since).length;
}

export function addContact(addr: string, name: string) {
  const a = addr.trim();
  if (!isLikelyAddress(a)) throw new Error("That isn't a valid Solana address.");
  const contacts = useMessenger.getState().contacts.filter((c) => c.address !== a);
  contacts.push({ address: a, name: name.trim() });
  contacts.sort((x, y) => (x.name || x.address).localeCompare(y.name || y.address));
  useMessenger.setState({ contacts });
  save(CONTACTS_KEY, contacts);
}

export function removeContact(addr: string) {
  const contacts = useMessenger.getState().contacts.filter((c) => c.address !== addr);
  useMessenger.setState({ contacts });
  save(CONTACTS_KEY, contacts);
}

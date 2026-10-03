// Token accounts the user has sent to the Burn Bin, waiting for "Empty Burn Bin".
import { create } from 'zustand';

const KEY = 'solanaos.burnqueue.v1';

function load(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

interface BurnQueueState {
  /** owner → token account pubkeys */
  queued: Record<string, string[]>;
}

export const useBurnQueue = create<BurnQueueState>(() => ({ queued: load() }));

function save(queued: Record<string, string[]>) {
  useBurnQueue.setState({ queued });
  try {
    localStorage.setItem(KEY, JSON.stringify(queued));
  } catch {
    // Non-critical.
  }
}

export function queueForBurn(owner: string, accounts: string[]) {
  const q = useBurnQueue.getState().queued;
  save({ ...q, [owner]: [...new Set([...(q[owner] ?? []), ...accounts])] });
}

export function unqueue(owner: string, accounts: string[]) {
  const q = useBurnQueue.getState().queued;
  const drop = new Set(accounts);
  save({ ...q, [owner]: (q[owner] ?? []).filter((a) => !drop.has(a)) });
}

export function queuedFor(owner: string | null | undefined, queued = useBurnQueue.getState().queued): Set<string> {
  return new Set(owner ? (queued[owner] ?? []) : []);
}

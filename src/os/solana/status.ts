import { create } from 'zustand';
import { getSlot } from './rpc';
import { useSettings, rpcUrlFor } from '../settings';

export interface NetStatus {
  state: 'connecting' | 'online' | 'offline';
  slot: number | null;
  endpoint: string;
  checkedAt: number | null;
  error?: string;
}

export const useNetStatus = create<NetStatus>(() => ({
  state: 'connecting',
  slot: null,
  endpoint: rpcUrlFor(useSettings.getState()),
  checkedAt: null,
}));

let inflight: Promise<void> | null = null;

export function checkNetwork(): Promise<void> {
  if (inflight) return inflight;
  const endpoint = rpcUrlFor(useSettings.getState());
  if (useNetStatus.getState().endpoint !== endpoint) useNetStatus.setState({ state: 'connecting', endpoint, slot: null });
  inflight = getSlot()
    .then((slot) => useNetStatus.setState({ state: 'online', slot, endpoint, checkedAt: Date.now(), error: undefined }))
    .catch((e: unknown) =>
      useNetStatus.setState({ state: 'offline', endpoint, checkedAt: Date.now(), error: e instanceof Error ? e.message : String(e) }),
    )
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

// Re-check whenever the cluster or RPC endpoint changes.
useSettings.subscribe((s, prev) => {
  if (s.cluster !== prev.cluster || s.customRpcUrl !== prev.customRpcUrl) void checkNetwork();
});

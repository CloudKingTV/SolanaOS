import { create } from 'zustand';
import type { IconName } from '../shell/icons';
import { closeAll } from './windows';
import { sounds } from './sound';
import { disconnectWallet } from './wallet/standard';

export type Phase = 'boot' | 'welcome' | 'loading' | 'desktop' | 'logging-off' | 'shutting-down' | 'off' | 'standby';

export interface User {
  name: string;
  avatar: IconName;
  /** Set when logged on with a wallet. */
  address?: string;
  walletName?: string;
  /** Wallet-provided icon (data: URI). */
  walletIcon?: string;
}

export interface Balloon {
  id: number;
  title: string;
  message: string;
  icon?: IconName;
  onClick?: () => void;
}

interface SessionState {
  phase: Phase;
  user: User | null;
  startOpen: boolean;
  /** Which shutdown dialog is showing over the desktop, if any. */
  exitDialog: 'turn-off' | 'log-off' | null;
  balloon: Balloon | null;
}

export const useSession = create<SessionState>(() => ({
  phase: 'boot',
  user: null,
  startOpen: false,
  exitDialog: null,
  balloon: null,
}));

export const GUEST: User = { name: 'Guest', avatar: 'avatar' };

export function setPhase(phase: Phase) {
  useSession.setState({ phase, startOpen: false, exitDialog: null });
}

export function logOn(user: User) {
  useSession.setState({ user, phase: 'loading' });
  window.setTimeout(() => {
    setPhase('desktop');
    sounds.startup();
  }, 1600);
}

export function logOff() {
  sounds.shutdown();
  void disconnectWallet(true);
  useSession.setState({ phase: 'logging-off', startOpen: false, exitDialog: null, balloon: null });
  window.setTimeout(() => {
    closeAll();
    useSession.setState({ user: null, phase: 'welcome' });
  }, 1800);
}

export function turnOff(restart = false) {
  sounds.shutdown();
  void disconnectWallet(true);
  useSession.setState({ phase: 'shutting-down', startOpen: false, exitDialog: null, balloon: null });
  window.setTimeout(() => {
    closeAll();
    useSession.setState({ user: null, phase: restart ? 'boot' : 'off' });
  }, 2600);
}

export function standBy() {
  useSession.setState({ phase: 'standby', startOpen: false, exitDialog: null });
}

export function setStartOpen(open: boolean) {
  useSession.setState({ startOpen: open });
}

export function showExitDialog(kind: 'turn-off' | 'log-off' | null) {
  useSession.setState({ exitDialog: kind, startOpen: false });
}

let balloonSeq = 0;
export function showBalloon(b: Omit<Balloon, 'id'>) {
  sounds.notify();
  useSession.setState({ balloon: { ...b, id: ++balloonSeq } });
}

export function hideBalloon(id?: number) {
  const cur = useSession.getState().balloon;
  if (cur && (id === undefined || cur.id === id)) useSession.setState({ balloon: null });
}

export function shortAddr(a: string) {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

export function walletUser(c: { address: string; wallet: { name: string; icon: string } }): User {
  return { name: shortAddr(c.address), avatar: 'wallet', address: c.address, walletName: c.wallet.name, walletIcon: c.wallet.icon };
}

/** Swap the current session's user without logging off (wallet connected or removed). */
export function setUser(user: User) {
  useSession.setState({ user });
}

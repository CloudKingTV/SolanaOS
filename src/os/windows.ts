import { create } from 'zustand';
import type { ComponentType } from 'react';
import type { IconName } from '../shell/icons';

export interface AppProps {
  windowId: string;
  args: Record<string, unknown>;
}

export interface AppDef {
  id: string;
  title: string;
  icon: IconName;
  component: ComponentType<AppProps>;
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  resizable?: boolean;
  maximizable?: boolean;
  minimizable?: boolean;
  /** Only one window of this app at a time; opening again focuses it. */
  singleton?: boolean;
  /** Names accepted by the Run dialog and Command Prompt. */
  aliases?: string[];
  /** Hidden from the taskbar (e.g. message boxes). */
  hideInTaskbar?: boolean;
  /** Window chrome: tool windows have no icon and a smaller title. */
  dialog?: boolean;
  /** Size the window to its content (fixed-size apps and message boxes). */
  fitContent?: boolean;
}

export interface WinState {
  id: string;
  appId: string;
  title: string;
  icon: IconName;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
  args: Record<string, unknown>;
  /** When set, this window is modal to the owner window. */
  modalFor?: string;
}

const apps = new Map<string, AppDef>();

export function registerApps(defs: AppDef[]) {
  for (const d of defs) apps.set(d.id, d);
}

export function getApp(id: string): AppDef | undefined {
  return apps.get(id);
}

export function allApps(): AppDef[] {
  return [...apps.values()];
}

export function findAppByAlias(name: string): AppDef | undefined {
  const n = name.trim().toLowerCase().replace(/\.exe$/, '');
  return allApps().find((a) => a.id === n || a.aliases?.includes(n));
}

interface WindowStore {
  windows: WinState[];
  zTop: number;
  /** Incremented to make a window's frame flash (e.g. clicking behind a modal). */
  flash: { id: string; n: number } | null;
}

export const useWindows = create<WindowStore>(() => ({ windows: [], zTop: 10, flash: null }));

const TASKBAR_H = 30;
let seq = 0;
let cascade = 0;

function viewport() {
  if (typeof window === 'undefined') return { w: 1280, h: 800 };
  return { w: window.innerWidth, h: window.innerHeight - TASKBAR_H };
}

function patch(id: string, p: Partial<WinState>) {
  useWindows.setState((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, ...p } : w)) }));
}

export function isSmallScreen() {
  return viewport().w < 700;
}

export function openApp(appId: string, args: Record<string, unknown> = {}, opts: { modalFor?: string } = {}): string | null {
  const app = apps.get(appId);
  if (!app) return null;
  const s = useWindows.getState();
  if (app.singleton) {
    const existing = s.windows.find((w) => w.appId === appId);
    if (existing) {
      if (Object.keys(args).length) patch(existing.id, { args: { ...existing.args, ...args } });
      focusWindow(existing.id);
      return existing.id;
    }
  }
  const vp = viewport();
  const w = Math.min(app.width, vp.w - 8);
  const h = Math.min(app.height, vp.h - 8);
  let x: number;
  let y: number;
  const owner = opts.modalFor ? s.windows.find((win) => win.id === opts.modalFor) : undefined;
  if (owner || app.dialog) {
    const ref = owner && !owner.maximized ? owner : { x: 0, y: 0, w: vp.w, h: vp.h };
    x = ref.x + (ref.w - w) / 2;
    y = ref.y + (ref.h - h) / 2;
  } else {
    x = 40 + (cascade % 8) * 26;
    y = 24 + (cascade % 8) * 26;
    cascade++;
  }
  x = Math.max(0, Math.min(Math.round(x), vp.w - w));
  y = Math.max(0, Math.min(Math.round(y), vp.h - h));
  const id = `w${++seq}`;
  const z = s.zTop + 1;
  const win: WinState = {
    id,
    appId,
    title: app.title,
    icon: app.icon,
    x,
    y,
    w,
    h,
    z,
    minimized: false,
    maximized: isSmallScreen() && app.resizable !== false && !app.dialog,
    args,
    modalFor: opts.modalFor,
  };
  useWindows.setState({ windows: [...s.windows, win], zTop: z });
  return id;
}

export function focusWindow(id: string) {
  const s = useWindows.getState();
  const target = s.windows.find((w) => w.id === id);
  if (!target) return;
  // A window with an open modal child hands focus to that child instead.
  const modal = s.windows.find((w) => w.modalFor === id);
  if (modal) {
    focusWindow(modal.id);
    useWindows.setState((st) => ({ flash: { id: modal.id, n: (st.flash?.n ?? 0) + 1 } }));
    return;
  }
  const z = s.zTop + 1;
  // Keep modal owners just beneath their modal.
  useWindows.setState({
    windows: s.windows.map((w) => (w.id === id ? { ...w, z, minimized: false } : w)),
    zTop: z,
  });
  if (target.modalFor) {
    const owner = s.windows.find((w) => w.id === target.modalFor);
    if (owner?.minimized) patch(owner.id, { minimized: false });
  }
}

export function activeWindowId(windows: WinState[]): string | null {
  let best: WinState | null = null;
  for (const w of windows) if (!w.minimized && (!best || w.z > best.z)) best = w;
  return best?.id ?? null;
}

const closeGuards = new Map<string, () => Promise<boolean> | boolean>();

/** Register a check that runs before a window closes (return false to cancel). */
export function setCloseGuard(id: string, guard: (() => Promise<boolean> | boolean) | null) {
  if (guard) closeGuards.set(id, guard);
  else closeGuards.delete(id);
}

export async function requestClose(id: string) {
  const modal = useWindows.getState().windows.find((w) => w.modalFor === id);
  if (modal) {
    focusWindow(id);
    return;
  }
  const guard = closeGuards.get(id);
  if (guard && !(await guard())) return;
  closeWindow(id);
}

export function closeWindow(id: string) {
  closeGuards.delete(id);
  const s = useWindows.getState();
  // Closing a window also closes any modal dialogs it owns.
  const doomed = new Set([id]);
  for (const w of s.windows) if (w.modalFor && doomed.has(w.modalFor)) doomed.add(w.id);
  useWindows.setState({ windows: s.windows.filter((w) => !doomed.has(w.id)) });
}

export function closeAll() {
  closeGuards.clear();
  useWindows.setState({ windows: [] });
}

export function minimizeWindow(id: string) {
  const s = useWindows.getState();
  const ids = new Set([id]);
  for (const w of s.windows) if (w.modalFor === id) ids.add(w.id);
  useWindows.setState({ windows: s.windows.map((w) => (ids.has(w.id) ? { ...w, minimized: true } : w)) });
}

export function toggleMaximize(id: string) {
  const w = useWindows.getState().windows.find((x) => x.id === id);
  if (!w) return;
  const app = apps.get(w.appId);
  if (app?.resizable === false || app?.maximizable === false) return;
  patch(id, { maximized: !w.maximized });
}

export function moveWindow(id: string, x: number, y: number) {
  patch(id, { x: Math.round(x), y: Math.round(y) });
}

export function resizeWindow(id: string, rect: { x: number; y: number; w: number; h: number }) {
  patch(id, { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) });
}

export function setWindowTitle(id: string, title: string) {
  patch(id, { title });
}

export function setWindowArgs(id: string, args: Record<string, unknown>) {
  patch(id, { args });
}

/** Taskbar click: restore + focus, or minimize if already active. */
export function taskbarClick(id: string) {
  const s = useWindows.getState();
  const w = s.windows.find((x) => x.id === id);
  if (!w) return;
  if (!w.minimized && activeWindowId(s.windows) === id) minimizeWindow(id);
  else focusWindow(id);
}

export function minimizeAll() {
  useWindows.setState((s) => ({ windows: s.windows.map((w) => ({ ...w, minimized: true })) }));
}

import { beforeEach, describe, expect, it } from 'vitest';
import {
  activeWindowId,
  closeAll,
  closeWindow,
  focusWindow,
  minimizeWindow,
  openApp,
  registerApps,
  requestClose,
  setCloseGuard,
  taskbarClick,
  useWindows,
} from './windows';

const Noop = () => null;
registerApps([
  { id: 'a', title: 'A', icon: 'notepad', component: Noop, width: 300, height: 200 },
  { id: 's', title: 'S', icon: 'cmd', component: Noop, width: 300, height: 200, singleton: true },
  { id: 'dlg', title: 'D', icon: 'info', component: Noop, width: 200, height: 100, dialog: true },
]);

const wins = () => useWindows.getState().windows;
const active = () => activeWindowId(wins());

beforeEach(() => closeAll());

describe('window manager', () => {
  it('opens windows on top and focuses them', () => {
    const a = openApp('a')!;
    const b = openApp('a')!;
    expect(active()).toBe(b);
    focusWindow(a);
    expect(active()).toBe(a);
  });

  it('reuses singleton windows', () => {
    const s1 = openApp('s');
    const s2 = openApp('s');
    expect(s1).toBe(s2);
    expect(wins()).toHaveLength(1);
  });

  it('minimizes and restores from the taskbar', () => {
    const a = openApp('a')!;
    taskbarClick(a);
    expect(wins()[0].minimized).toBe(true);
    taskbarClick(a);
    expect(wins()[0].minimized).toBe(false);
    expect(active()).toBe(a);
  });

  it('routes focus to a modal dialog and closes it with its owner', () => {
    const a = openApp('a')!;
    const d = openApp('dlg', {}, { modalFor: a })!;
    focusWindow(a);
    expect(active()).toBe(d);
    closeWindow(a);
    expect(wins()).toHaveLength(0);
  });

  it('minimizing an owner hides its modal too', () => {
    const a = openApp('a')!;
    openApp('dlg', {}, { modalFor: a });
    minimizeWindow(a);
    expect(wins().every((w) => w.minimized)).toBe(true);
  });

  it('honors close guards', async () => {
    const a = openApp('a')!;
    setCloseGuard(a, () => false);
    await requestClose(a);
    expect(wins()).toHaveLength(1);
    setCloseGuard(a, () => true);
    await requestClose(a);
    expect(wins()).toHaveLength(0);
  });
});

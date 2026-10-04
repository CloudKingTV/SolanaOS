import { beforeEach, describe, expect, it } from 'vitest';
import { resetVfs, stat, readFile } from '../vfs';
import {
  CATALOG,
  catalogEntryFor,
  hasDesktopShortcut,
  initials,
  install,
  installedPrograms,
  isInstalled,
  normalizeUrlInput,
  parseShortcut,
  safeUrl,
  seedPrograms,
  setDesktopShortcut,
  shortcutContent,
  uninstall,
} from './programs';

const store = new Map<string, string>();
globalThis.localStorage ??= {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};

describe('Program Files', () => {
  beforeEach(() => {
    resetVfs();
    localStorage.clear();
  });

  it('only accepts https websites', () => {
    expect(safeUrl('https://jup.ag')).toBe('https://jup.ag/');
    expect(safeUrl('http://jup.ag')).toBeNull();
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('https://localhost')).toBeNull();
    expect(normalizeUrlInput('tensor.trade')).toBe('https://tensor.trade/');
    expect(normalizeUrlInput('ftp://x.com')).toBeNull();
  });

  it('round-trips Internet Shortcut files', () => {
    expect(parseShortcut(shortcutContent('https://solscan.io/'))).toBe('https://solscan.io/');
    expect(parseShortcut('[InternetShortcut]\nURL=javascript:alert(1)')).toBeNull();
  });

  it('matches catalog entries by site', () => {
    expect(catalogEntryFor('https://www.jup.ag/')?.name).toBe('Jupiter');
    expect(catalogEntryFor('https://example.com')).toBeNull();
    expect(new Set(CATALOG.map((c) => c.name)).size).toBe(CATALOG.length);
    for (const c of CATALOG) expect(safeUrl(c.url)).not.toBeNull();
  });

  it('installs, adds a desktop shortcut, and uninstalls', () => {
    const path = install('My: DEX', 'https://example.com/app');
    expect(path).toBe('C:\\Program Files\\My DEX.url');
    expect(readFile(path)).toContain('URL=https://example.com/app');
    const [p] = installedPrograms();
    expect(p).toMatchObject({ name: 'My DEX', url: 'https://example.com/app', entry: null });
    setDesktopShortcut(p, true);
    expect(hasDesktopShortcut(p)).toBe(true);
    expect(stat('C:\\Desktop\\My DEX.url')).toBeTruthy();
    uninstall(p);
    expect(installedPrograms()).toHaveLength(0);
    expect(stat('C:\\Desktop\\My DEX.url')).toBeUndefined();
    expect(() => install('Bad', 'http://insecure.com')).toThrow();
  });

  it('seeds the preinstalled programs once', () => {
    seedPrograms();
    const names = installedPrograms().map((p) => p.name);
    expect(names).toContain('Jupiter');
    expect(isInstalled(CATALOG.find((c) => c.name === 'Jupiter')!)).toBe(true);
    uninstall(installedPrograms().find((p) => p.name === 'Jupiter')!);
    seedPrograms();
    expect(installedPrograms().map((p) => p.name)).not.toContain('Jupiter');
  });

  it('makes avatar initials', () => {
    expect(initials('Magic Eden')).toBe('ME');
    expect(initials('Jupiter')).toBe('JU');
  });
});

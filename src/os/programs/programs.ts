// Program Files: other Solana apps, "installed" as Internet Shortcut (.url) files in
// C:\Program Files. Opening one runs the site in a SolanaOS window.
import { useVfs, list, writeFile, stat, removeForever, DESKTOP_DIR } from '../vfs';
import { basename, extname, join } from '../path';

export const PROGRAM_FILES = 'C:\\Program Files';

export type Category = 'Trading' | 'Lending & Yield' | 'Staking' | 'NFTs' | 'Explorers & Data' | 'DAOs & Teams' | 'Developer' | 'My Programs';

export interface CatalogEntry {
  name: string;
  url: string;
  category: Category;
  description: string;
  color: string;
  /** Mainnet apps can move real funds; devnet tools are free to try. */
  network: 'mainnet' | 'devnet' | 'any';
}

// Letter avatars stand in for logos; these are independent links, not endorsements.
export const CATALOG: CatalogEntry[] = [
  { name: 'Jupiter', url: 'https://jup.ag', category: 'Trading', description: 'Swap aggregator that routes across Solana DEXs.', color: '#1f8a5b', network: 'mainnet' },
  { name: 'Raydium', url: 'https://raydium.io/swap/', category: 'Trading', description: 'AMM and liquidity pools.', color: '#5a3fd1', network: 'mainnet' },
  { name: 'Orca', url: 'https://www.orca.so', category: 'Trading', description: 'Concentrated-liquidity DEX.', color: '#e8a21a', network: 'mainnet' },
  { name: 'Meteora', url: 'https://app.meteora.ag', category: 'Trading', description: 'Dynamic liquidity pools and vaults.', color: '#e0522e', network: 'mainnet' },
  { name: 'Drift', url: 'https://app.drift.trade', category: 'Trading', description: 'Perpetual futures and spot trading.', color: '#6c4bd8', network: 'mainnet' },
  { name: 'Kamino', url: 'https://app.kamino.finance', category: 'Lending & Yield', description: 'Lending, borrowing and automated liquidity.', color: '#2a62d6', network: 'mainnet' },
  { name: 'marginfi', url: 'https://app.marginfi.com', category: 'Lending & Yield', description: 'Borrow and lend.', color: '#222222', network: 'mainnet' },
  { name: 'Marinade', url: 'https://marinade.finance', category: 'Staking', description: 'Liquid staking (mSOL) and native staking.', color: '#2aa58f', network: 'mainnet' },
  { name: 'Jito', url: 'https://www.jito.network/staking/', category: 'Staking', description: 'Liquid staking with MEV rewards (JitoSOL).', color: '#3c8a3f', network: 'mainnet' },
  { name: 'Sanctum', url: 'https://app.sanctum.so', category: 'Staking', description: 'Liquid staking tokens and instant unstake.', color: '#b4337d', network: 'mainnet' },
  { name: 'Magic Eden', url: 'https://magiceden.io', category: 'NFTs', description: 'NFT marketplace.', color: '#d6266f', network: 'mainnet' },
  { name: 'Tensor', url: 'https://www.tensor.trade', category: 'NFTs', description: 'NFT trading for pros.', color: '#4a4a4a', network: 'mainnet' },
  { name: 'Solscan', url: 'https://solscan.io', category: 'Explorers & Data', description: 'Block explorer.', color: '#3b6fd9', network: 'any' },
  { name: 'Solana Explorer', url: 'https://explorer.solana.com', category: 'Explorers & Data', description: 'The official block explorer.', color: '#7b3fe4', network: 'any' },
  { name: 'Birdeye', url: 'https://birdeye.so', category: 'Explorers & Data', description: 'Token prices and charts.', color: '#e46b1f', network: 'any' },
  { name: 'DEX Screener', url: 'https://dexscreener.com/solana', category: 'Explorers & Data', description: 'Live DEX pair charts.', color: '#1a1a1a', network: 'any' },
  { name: 'Realms', url: 'https://app.realms.today', category: 'DAOs & Teams', description: 'DAO governance.', color: '#5c5c8a', network: 'mainnet' },
  { name: 'Squads', url: 'https://app.squads.so', category: 'DAOs & Teams', description: 'Multisig wallets for teams.', color: '#111111', network: 'mainnet' },
  { name: 'Solana Faucet', url: 'https://faucet.solana.com', category: 'Developer', description: 'Free Devnet and Testnet SOL.', color: '#14a874', network: 'devnet' },
  { name: 'Solana Playground', url: 'https://beta.solpg.io', category: 'Developer', description: 'Write and deploy programs in the browser.', color: '#3d3d7a', network: 'devnet' },
];

/** Installed on a fresh SolanaOS, like the programs that came with XP. */
export const PREINSTALLED = ['Jupiter', 'Magic Eden', 'Solscan', 'Solana Faucet', 'Marinade', 'Birdeye'];

export interface Program {
  /** The .url file in C:\Program Files. */
  path: string;
  name: string;
  url: string;
  entry: CatalogEntry | null;
}

/** Windows-style Internet Shortcut file contents. */
export function shortcutContent(url: string): string {
  return `[InternetShortcut]\r\nURL=${url}\r\n`;
}

export function parseShortcut(content: string): string | null {
  const m = /^URL=(.+)$/im.exec(content);
  const url = m?.[1].trim();
  return url && safeUrl(url) ? url : null;
}

/** Only plain https sites can be programs. */
export function safeUrl(input: string): string | null {
  try {
    const u = new URL(input.trim());
    if (u.protocol !== 'https:' || !u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function normalizeUrlInput(input: string): string | null {
  const t = input.trim();
  return safeUrl(/^[a-z]+:\/\//i.test(t) ? t : `https://${t}`);
}

const sameSite = (a: string, b: string) => {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.hostname.replace(/^www\./, '') === y.hostname.replace(/^www\./, '') && x.pathname.replace(/\/$/, '') === y.pathname.replace(/\/$/, '');
  } catch {
    return false;
  }
};

export function catalogEntryFor(url: string): CatalogEntry | null {
  return CATALOG.find((c) => sameSite(c.url, url)) ?? null;
}

export function fileName(name: string): string {
  return `${name.replace(/[\\/:*?"<>|]/g, '').trim() || 'Program'}.url`;
}

export function installedPrograms(nodes = useVfs.getState().nodes): Program[] {
  return list(PROGRAM_FILES, nodes)
    .filter((n) => n.type === 'file' && extname(n.path) === 'url')
    .flatMap((n) => {
      const url = parseShortcut(n.content ?? '');
      if (!url) return [];
      const name = basename(n.path).replace(/\.url$/i, '');
      return [{ path: n.path, name, url, entry: catalogEntryFor(url) }];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function isInstalled(entry: CatalogEntry, nodes = useVfs.getState().nodes): boolean {
  return installedPrograms(nodes).some((p) => sameSite(p.url, entry.url));
}

export function install(name: string, url: string): string {
  const safe = safeUrl(url);
  if (!safe) throw new Error('Programs must be https:// websites.');
  const path = join(PROGRAM_FILES, fileName(name));
  writeFile(path, shortcutContent(safe));
  return path;
}

export function desktopShortcut(p: Program): string {
  return join(DESKTOP_DIR, fileName(p.name));
}

export function hasDesktopShortcut(p: Program): boolean {
  return !!stat(desktopShortcut(p));
}

export function setDesktopShortcut(p: Program, on: boolean) {
  const path = desktopShortcut(p);
  if (on) writeFile(path, shortcutContent(p.url));
  else if (stat(path)) removeForever(path);
}

export function uninstall(p: Program) {
  setDesktopShortcut(p, false);
  if (stat(p.path)) removeForever(p.path);
}

const SEEDED_KEY = 'solanaos.programs.seeded.v1';

/** Put the preinstalled programs in C:\Program Files once per browser. */
export function seedPrograms() {
  try {
    if (localStorage.getItem(SEEDED_KEY)) return;
    localStorage.setItem(SEEDED_KEY, '1');
  } catch {
    return;
  }
  for (const name of PREINSTALLED) {
    const e = CATALOG.find((c) => c.name === name);
    if (e && !isInstalled(e)) install(e.name, e.url);
  }
}

/** First letters for the program's avatar icon. */
export function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}

export function colorFor(p: { name: string; entry?: CatalogEntry | null }): string {
  if (p.entry) return p.entry.color;
  let h = 0;
  for (const ch of p.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 55% 40%)`;
}

import { create } from 'zustand';

export type ThemeId = 'luna-mainnet' | 'mint' | 'silver';
export type WallpaperId = 'mainnet-hills' | 'validator-night' | 'gradient' | 'none';
export type ScreensaverId = 'none' | 'starfield' | 'blocks';
export type Cluster = 'devnet' | 'mainnet-beta' | 'custom';

export interface Settings {
  theme: ThemeId;
  wallpaper: WallpaperId;
  backgroundColor: string;
  screensaver: ScreensaverId;
  screensaverMinutes: number;
  cluster: Cluster;
  customRpcUrl: string;
  muted: boolean;
  fastBoot: boolean;
  /** Writes (sends, burns) on mainnet need an explicit opt-in. */
  allowMainnetTransactions: boolean;
  /** Wallet to reconnect silently on the next visit. */
  lastWallet: string;
  /** The user's own Jupiter API key, for swaps (stored only in this browser). */
  jupiterApiKey: string;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'luna-mainnet',
  wallpaper: 'mainnet-hills',
  backgroundColor: '#2b1a6b',
  screensaver: 'starfield',
  screensaverMinutes: 5,
  cluster: 'devnet',
  customRpcUrl: '',
  muted: false,
  fastBoot: false,
  allowMainnetTransactions: false,
  lastWallet: '',
  jupiterApiKey: '',
};

const STORAGE_KEY = 'solanaos.settings.v1';

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    // Storage can be unavailable (private mode, blocked site data); fall back to defaults.
  }
  return { ...DEFAULT_SETTINGS };
}

interface SettingsStore extends Settings {
  update: (patch: Partial<Settings>) => void;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...load(),
  update: (patch) => {
    set(patch);
    const { update: _ignored, ...rest } = { ...get() };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
    } catch {
      // Ignore persistence failures; settings still apply for this session.
    }
  },
}));

/**
 * Free Mainnet endpoints, tried in order. Solana's own public server often refuses requests
 * from websites (HTTP 403), so it's the last resort. A custom RPC always takes priority.
 */
export const MAINNET_ENDPOINTS = [
  'https://solana-rpc.publicnode.com',
  'https://solana.publicnode.com',
  'https://solana.drpc.org',
  'https://solana.api.onfinality.io/public',
  'https://endpoints.omniatech.io/v1/sol/mainnet/public',
  'https://api.mainnet-beta.solana.com',
];
export const DEVNET_ENDPOINT = 'https://api.devnet.solana.com';

/** Index of the Mainnet endpoint that last worked, remembered for this browser session. */
let mainnetIndex = (() => {
  try {
    const i = Number(sessionStorage.getItem('solanaos.mainnetEndpoint'));
    return Number.isInteger(i) && i >= 0 && i < MAINNET_ENDPOINTS.length ? i : 0;
  } catch {
    return 0;
  }
})();

export const useRpcEndpoint = create<{ mainnetIndex: number }>(() => ({ mainnetIndex }));

/** Move past a Mainnet endpoint that refused or failed, so later calls start with the next one. */
export function markEndpointFailed(url: string) {
  const i = MAINNET_ENDPOINTS.indexOf(url);
  if (i < 0 || i !== mainnetIndex) return;
  mainnetIndex = (i + 1) % MAINNET_ENDPOINTS.length;
  try {
    sessionStorage.setItem('solanaos.mainnetEndpoint', String(mainnetIndex));
  } catch {
    // Non-critical.
  }
  useRpcEndpoint.setState({ mainnetIndex });
}

/** Endpoints to try for these settings, best first. */
export function endpointsFor(s: Pick<Settings, 'cluster' | 'customRpcUrl'>): string[] {
  if (s.cluster === 'custom' && s.customRpcUrl.trim()) return [s.customRpcUrl.trim()];
  if (s.cluster === 'mainnet-beta') return [...MAINNET_ENDPOINTS.slice(mainnetIndex), ...MAINNET_ENDPOINTS.slice(0, mainnetIndex)];
  return [DEVNET_ENDPOINT];
}

/** The endpoint currently in use (for display and single-endpoint tools). */
export function rpcUrlFor(s: Pick<Settings, 'cluster' | 'customRpcUrl'>): string {
  return endpointsFor(s)[0];
}

/** Identifies the selected network, independent of which fallback endpoint is active. */
export function networkKey(s: Pick<Settings, 'cluster' | 'customRpcUrl'>): string {
  return `${s.cluster}|${s.cluster === 'custom' ? s.customRpcUrl.trim() : ''}`;
}

export function clusterLabel(c: Cluster): string {
  return c === 'mainnet-beta' ? 'Mainnet Beta' : c === 'custom' ? 'Custom RPC' : 'Devnet';
}

export function endpointHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Wallet Standard chain id for the current cluster. */
export function chainFor(s: Pick<Settings, 'cluster' | 'customRpcUrl'>): 'solana:devnet' | 'solana:mainnet' {
  if (s.cluster === 'devnet') return 'solana:devnet';
  if (s.cluster === 'custom' && /devnet/i.test(s.customRpcUrl)) return 'solana:devnet';
  return 'solana:mainnet';
}

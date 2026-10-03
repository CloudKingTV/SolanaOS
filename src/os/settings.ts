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

export const RPC_URLS: Record<Exclude<Cluster, 'custom'>, string> = {
  devnet: 'https://api.devnet.solana.com',
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
};

export function rpcUrlFor(s: Pick<Settings, 'cluster' | 'customRpcUrl'>): string {
  if (s.cluster === 'custom' && s.customRpcUrl.trim()) return s.customRpcUrl.trim();
  return s.cluster === 'mainnet-beta' ? RPC_URLS['mainnet-beta'] : RPC_URLS.devnet;
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

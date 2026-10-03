import { useState } from 'react';
import type { Wallet } from '@wallet-standard/base';
import { connectWallet, useWallet, type Connection } from '../os/wallet/standard';
import { useSettings } from '../os/settings';

export function WalletIcon({ src, size = 32, alt = '' }: { src?: string; size?: number; alt?: string }) {
  if (!src || !/^data:image\//.test(src)) return null;
  return <img src={src} width={size} height={size} alt={alt} className="wallet-icon" draggable={false} />;
}

/** Connect with a popup, but try silently first for wallets that already trust this site. */
export async function connect(wallet: Wallet): Promise<Connection> {
  try {
    return await connectWallet(wallet, true);
  } catch {
    return connectWallet(wallet, false);
  }
}

export const INSTALL_LINKS = [
  { name: 'Phantom', url: 'https://phantom.com/download' },
  { name: 'Solflare', url: 'https://solflare.com/download' },
  { name: 'Backpack', url: 'https://backpack.app/download' },
];

/** List of detected wallets; used on the logon screen and in the Connect Wallet dialog. */
export function WalletPicker({
  onConnected,
  variant,
}: {
  onConnected: (c: Connection) => void;
  variant: 'logon' | 'dialog';
}) {
  const wallets = useWallet((s) => s.wallets);
  const connecting = useWallet((s) => s.connecting);
  const lastWallet = useSettings((s) => s.lastWallet);
  const [error, setError] = useState<string | null>(null);
  const sorted = [...wallets].sort((a, b) => Number(b.name === lastWallet) - Number(a.name === lastWallet));

  const pick = async (w: Wallet) => {
    setError(null);
    try {
      onConnected(await connect(w));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(/reject|denied|cancel/i.test(msg) ? 'Connection cancelled in your wallet.' : msg);
    }
  };

  if (!wallets.length) {
    return (
      <div className={`wallet-picker ${variant} empty`}>
        <p>No Solana wallet was found in this browser.</p>
        <p>
          Install one, then reload SolanaOS:{' '}
          {INSTALL_LINKS.map((l, i) => (
            <span key={l.name}>
              {i > 0 && ', '}
              <a href={l.url} target="_blank" rel="noreferrer noopener">
                {l.name}
              </a>
            </span>
          ))}
          .
        </p>
      </div>
    );
  }

  return (
    <div className={`wallet-picker ${variant}`}>
      {sorted.map((w) => (
        <button
          key={w.name}
          type="button"
          className={variant === 'logon' ? 'user-tile' : 'wp-item'}
          disabled={!!connecting}
          onClick={() => void pick(w)}
        >
          <span className={variant === 'logon' ? 'user-tile-pic' : 'wp-pic'}>
            <WalletIcon src={w.icon} size={variant === 'logon' ? 48 : 32} />
          </span>
          <span className={variant === 'logon' ? 'user-tile-text' : 'wp-text'}>
            <span className={variant === 'logon' ? 'user-tile-name' : 'wp-name'}>{w.name}</span>
            <span className={variant === 'logon' ? 'user-tile-sub' : 'wp-sub'}>
              {connecting === w.name ? 'Waiting for your wallet…' : w.name === lastWallet ? 'Last used' : 'Click to connect'}
            </span>
          </span>
        </button>
      ))}
      {error && <div className="wp-error">{error}</div>}
    </div>
  );
}

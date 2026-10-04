import { useEffect, useState } from 'react';
import { setWindowTitle, type AppProps } from '../../os/windows';
import { catalogEntryFor, colorFor, initials, safeUrl } from '../../os/programs/programs';
import { useSettings } from '../../os/settings';
import { Icon } from '../../shell/icons';

const HINT_KEY = 'solanaos.programs.hintHidden.v1';

export function ProgramAvatar({ name, color, size = 32 }: { name: string; color: string; size?: number }) {
  return (
    <span className="pf-avatar" style={{ width: size, height: size, background: color, fontSize: size * 0.42 }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/** Opens a website in a new browser tab (outside SolanaOS). */
export function openExternal(url: string) {
  const safe = safeUrl(url);
  if (safe) window.open(safe, '_blank', 'noopener,noreferrer');
}

/** Runs another Solana app's website inside a SolanaOS window. */
export function ProgramHost({ windowId, args }: AppProps) {
  const url = safeUrl(typeof args.url === 'string' ? args.url : '') ?? '';
  const entry = catalogEntryFor(url);
  const name = typeof args.name === 'string' && args.name ? args.name : (entry?.name ?? (url ? new URL(url).hostname : 'Program'));
  const cluster = useSettings((s) => s.cluster);
  const [reload, setReload] = useState(0);
  const [hintHidden, setHintHidden] = useState(() => {
    try {
      return localStorage.getItem(HINT_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => setWindowTitle(windowId, name), [windowId, name]);

  if (!url) return <div className="pf-host pf-host-empty">This shortcut doesn&apos;t point to a valid https:// website.</div>;
  if (new URL(url).origin === window.location.origin) return <div className="pf-host pf-host-empty">SolanaOS can&apos;t run inside itself.</div>;

  const hideHint = () => {
    setHintHidden(true);
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      // Not remembered; fine.
    }
  };

  return (
    <div className="pf-host">
      <div className="pf-toolbar">
        <ProgramAvatar name={name} color={colorFor({ name, entry })} size={20} />
        <span className="pf-address" title={url}>
          {url}
        </span>
        <button type="button" className="tool-btn" title="Reload" onClick={() => setReload((r) => r + 1)}>
          ⟳ Reload
        </button>
        <button type="button" className="tool-btn" title="Open in a new browser tab" onClick={() => openExternal(url)}>
          <Icon name="explorer-web" size={16} /> Open in New Tab
        </button>
      </div>
      {entry?.network === 'mainnet' && cluster !== 'mainnet-beta' && (
        <div className="pf-note warn">
          {name} runs on Solana Mainnet with real funds, whatever network SolanaOS is set to.
        </div>
      )}
      {!hintHidden && (
        <div className="pf-note">
          <span>
            Many sites refuse to be shown inside other sites — if this stays blank, use <b>Open in New Tab</b>. Your SolanaOS wallet session
            isn&apos;t shared with {name}; it asks your wallet to connect on its own.
          </span>
          <button type="button" className="pf-note-close" onClick={hideHint} aria-label="Hide this tip">
            ×
          </button>
        </div>
      )}
      <iframe
        key={reload}
        className="pf-frame"
        src={url}
        title={name}
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals"
        allow="clipboard-write"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

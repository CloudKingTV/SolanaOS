import { useEffect, useRef, useState } from 'react';
import { GUEST, logOn, setPhase, turnOff, useSession } from '../os/session';
import { Icon, SolanaLogo } from './icons';

function Brand() {
  return (
    <div className="welcome-brand">
      <SolanaLogo size={64} />
      <div className="welcome-wordmark">
        Solana<span>OS</span>
      </div>
    </div>
  );
}

/** The "To begin, click your user name" logon screen. */
export function Welcome() {
  const phase = useSession((s) => s.phase);
  const [walletNote, setWalletNote] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const guestRef = useRef<HTMLButtonElement>(null);

  // Focus the first account after a beat, so the key that skipped the boot screen doesn't also log on.
  useEffect(() => {
    const t = setTimeout(() => guestRef.current?.focus(), 400);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === 'loading' || phase === 'logging-off' || phase === 'shutting-down') {
    const text =
      phase === 'loading' ? 'welcome' : phase === 'logging-off' ? 'logging off...' : 'SolanaOS is shutting down...';
    return (
      <div className="welcome">
        <div className="welcome-band top" />
        <div className="welcome-mid centered">
          <div className="welcome-status">
            {phase === 'shutting-down' ? <Brand /> : <span className="welcome-big">{text}</span>}
            {phase === 'loading' && <div className="welcome-sub">Loading your personal settings...</div>}
            {phase === 'shutting-down' && <div className="welcome-sub">Saving your settings...</div>}
          </div>
        </div>
        <div className="welcome-band bottom" />
      </div>
    );
  }

  return (
    <div className="welcome">
      <div className="welcome-band top" />
      <div className="welcome-mid">
        <div className="welcome-left">
          <Brand />
          <div className="welcome-instructions">To begin, click your user name</div>
        </div>
        <div className="welcome-divider" />
        <div className="welcome-right">
          <button type="button" className="user-tile" ref={guestRef} onClick={() => logOn(GUEST)}>
            <span className="user-tile-pic">
              <Icon name="avatar" size={48} />
            </span>
            <span className="user-tile-text">
              <span className="user-tile-name">Guest</span>
              <span className="user-tile-sub">Read-only · Devnet</span>
            </span>
          </button>
          <button type="button" className="user-tile" onClick={() => setWalletNote(true)}>
            <span className="user-tile-pic">
              <Icon name="wallet" size={48} />
            </span>
            <span className="user-tile-text">
              <span className="user-tile-name">Connect Wallet</span>
              <span className="user-tile-sub">
                {walletNote ? 'Wallet sign-in arrives in the next update. Log on as Guest for now.' : 'Phantom, Solflare, Backpack'}
              </span>
            </span>
          </button>
        </div>
      </div>
      <div className="welcome-band bottom">
        <button type="button" className="welcome-off" onClick={() => setConfirmOff(true)}>
          <Icon name="power" size={22} />
          <span>Turn off SolanaOS</span>
        </button>
        <div className="welcome-hint">
          After you log on, you can open Control Panel to change your theme, wallpaper and cluster.
        </div>
      </div>
      {confirmOff && (
        <div className="exit-overlay">
          <ExitBox
            title="Turn off computer"
            onCancel={() => setConfirmOff(false)}
            buttons={[
              { icon: 'standby', label: 'Stand By', onClick: () => setPhase('standby') },
              { icon: 'power', label: 'Turn Off', onClick: () => turnOff(false) },
              { icon: 'restart', label: 'Restart', onClick: () => turnOff(true) },
            ]}
          />
        </div>
      )}
    </div>
  );
}

export interface ExitButton {
  icon: 'standby' | 'power' | 'restart' | 'switch-user' | 'log-off';
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

/** The XP-style "Turn off computer" / "Log Off" box. */
export function ExitBox({ title, buttons, onCancel }: { title: string; buttons: ExitButton[]; onCancel: () => void }) {
  return (
    <div className="exit-box" role="dialog" aria-label={title} onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <div className="exit-box-head">
        <span>{title}</span>
        <SolanaLogo size={30} />
      </div>
      <div className="exit-box-body">
        {buttons.map((b) => (
          <button key={b.label} type="button" className="exit-choice" onClick={b.onClick} disabled={b.disabled}>
            <Icon name={b.icon} size={34} />
            <span>{b.label}</span>
          </button>
        ))}
      </div>
      <div className="exit-box-foot">
        <button type="button" className="btn" onClick={onCancel} autoFocus>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function PoweredOff() {
  return (
    <div className="powered-off">
      <div className="powered-off-text">It is now safe to turn off your computer.</div>
      <button type="button" className="power-on" onClick={() => setPhase('boot')} aria-label="Power on">
        <Icon name="power" size={40} />
        <span>Power on</span>
      </button>
    </div>
  );
}

export function StandBy() {
  const user = useSession((s) => s.user);
  return (
    <div
      className="standby"
      onClick={() => setPhase(user ? 'desktop' : 'welcome')}
      onKeyDown={() => setPhase(user ? 'desktop' : 'welcome')}
      tabIndex={0}
      autoFocus
    >
      <span>Click anywhere to wake</span>
    </div>
  );
}

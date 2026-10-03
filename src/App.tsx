import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession, showBalloon, setStartOpen } from './os/session';
import { clusterLabel, useSettings } from './os/settings';
import { checkNetwork, useNetStatus } from './os/solana/status';
import { openApp, useWindows } from './os/windows';
import { Boot } from './shell/Boot';
import { Welcome, PoweredOff, StandBy } from './shell/Welcome';
import { Wallpaper } from './shell/Wallpaper';
import { Desktop } from './shell/Desktop';
import { WindowLayer } from './shell/Window';
import { Taskbar } from './shell/Taskbar';
import { ExitDialogs } from './shell/ExitDialogs';
import { ContextMenuHost } from './shell/Menu';
import { Screensaver } from './shell/Screensaver';
import { setExternalDisconnectHandler, useWallet } from './os/wallet/standard';
import { refreshPortfolio } from './os/wallet/portfolio';
import { handleExternalDisconnect } from './os/wallet/actions';

function DesktopShell({ visible }: { visible: boolean }) {
  const exitDialog = useSession((s) => s.exitDialog);
  const screensaver = useSettings((s) => s.screensaver);
  const minutes = useSettings((s) => s.screensaverMinutes);
  const [saving, setSaving] = useState(false);
  const lastActive = useRef(Date.now());
  const greeted = useRef(false);

  // Poll cluster health while the desktop is up.
  useEffect(() => {
    if (!visible) return;
    void checkNetwork();
    const t = setInterval(() => void checkNetwork(), 30_000);
    return () => clearInterval(t);
  }, [visible]);

  // Keep wallet holdings fresh while the desktop is up.
  const walletAddress = useWallet((s) => s.connection?.address);
  const cluster = useSettings((s) => s.cluster);
  const customRpc = useSettings((s) => s.customRpcUrl);
  useEffect(() => {
    if (!visible) return;
    setExternalDisconnectHandler(handleExternalDisconnect);
    void refreshPortfolio();
    if (!walletAddress) return;
    const t = setInterval(() => void refreshPortfolio(), 30_000);
    return () => clearInterval(t);
  }, [visible, walletAddress, cluster, customRpc]);

  // Greet once per logon when the network first answers.
  useEffect(() => {
    if (!visible || greeted.current) return;
    const greet = (s: ReturnType<typeof useNetStatus.getState>) => {
      if (greeted.current || s.state === 'connecting') return;
      greeted.current = true;
      const cluster = clusterLabel(useSettings.getState().cluster);
      setTimeout(
        () =>
          showBalloon(
            s.state === 'online'
              ? {
                  title: 'Welcome to SolanaOS',
                  icon: 'network',
                  message: `You're connected to Solana ${cluster} at slot ${s.slot?.toLocaleString('en-US')}. Click here to open Network Monitor.`,
                  onClick: () => openApp('netmon'),
                }
              : {
                  title: 'Solana network unavailable',
                  icon: 'network-off',
                  message: `SolanaOS couldn't reach ${cluster}. Click here to check Network Settings.`,
                  onClick: () => openApp('netsettings'),
                },
          ),
        2500,
      );
    };
    greet(useNetStatus.getState());
    return useNetStatus.subscribe(greet);
  }, [visible]);

  // Screensaver after inactivity.
  useEffect(() => {
    if (!visible || screensaver === 'none') return;
    const bump = () => (lastActive.current = Date.now());
    window.addEventListener('pointermove', bump);
    window.addEventListener('keydown', bump);
    window.addEventListener('pointerdown', bump);
    const t = setInterval(() => {
      if (Date.now() - lastActive.current > minutes * 60_000) setSaving(true);
    }, 5000);
    return () => {
      window.removeEventListener('pointermove', bump);
      window.removeEventListener('keydown', bump);
      window.removeEventListener('pointerdown', bump);
      clearInterval(t);
    };
  }, [visible, screensaver, minutes]);

  const wake = useCallback(() => {
    lastActive.current = Date.now();
    setSaving(false);
  }, []);

  // Global shortcuts.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey && e.shiftKey && k === 'escape') || (e.ctrlKey && e.altKey && (k === 'delete' || k === 'end'))) {
        e.preventDefault();
        openApp('netmon');
      } else if (e.ctrlKey && !e.shiftKey && k === 'escape') {
        e.preventDefault();
        setStartOpen(!useSession.getState().startOpen);
      } else if (e.altKey && k === 'r' && !e.ctrlKey) {
        e.preventDefault();
        openApp('run');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible]);

  return (
    <div className={`desktop-shell${exitDialog ? ' dimmed' : ''}`} hidden={!visible}>
      <div className="desktop-content">
        <Wallpaper />
        <Desktop />
        <WindowLayer />
        <Taskbar />
      </div>
      <ExitDialogs />
      {saving && <Screensaver kind={screensaver} onWake={wake} />}
    </div>
  );
}

export function App() {
  const phase = useSession((s) => s.phase);
  const user = useSession((s) => s.user);
  const theme = useSettings((s) => s.theme);
  const hasWindows = useWindows((s) => s.windows.length > 0);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Keep the desktop mounted while switching users or in stand by, so open windows survive.
  const desktopMounted = !!user && ['welcome', 'loading', 'desktop', 'standby'].includes(phase);
  const showWelcome = ['welcome', 'loading', 'logging-off', 'shutting-down'].includes(phase);

  return (
    <div className="os-root" data-has-windows={hasWindows || undefined}>
      {phase === 'boot' && <Boot />}
      {desktopMounted && <DesktopShell visible={phase === 'desktop'} />}
      {showWelcome && <Welcome />}
      {phase === 'off' && <PoweredOff />}
      {phase === 'standby' && <StandBy />}
      <ContextMenuHost />
    </div>
  );
}

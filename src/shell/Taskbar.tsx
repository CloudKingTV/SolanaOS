import { useEffect, useState } from 'react';
import { activeWindowId, minimizeAll, openApp, taskbarClick, useWindows, requestClose, minimizeWindow, toggleMaximize, focusWindow, getApp } from '../os/windows';
import { hideBalloon, setStartOpen, useSession } from '../os/session';
import { useSettings, clusterLabel } from '../os/settings';
import { useNetStatus, checkNetwork } from '../os/solana/status';
import { Icon, SolanaLogo } from './icons';
import { openContextMenu, sep } from './Menu';
import { StartMenu } from './StartMenu';

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="tray-clock" title={now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}>
      {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
    </span>
  );
}

function Balloon() {
  const balloon = useSession((s) => s.balloon);
  useEffect(() => {
    if (!balloon) return;
    const t = setTimeout(() => hideBalloon(balloon.id), 9000);
    return () => clearTimeout(t);
  }, [balloon]);
  if (!balloon) return null;
  return (
    <div
      className="balloon"
      role="status"
      onClick={() => {
        balloon.onClick?.();
        hideBalloon(balloon.id);
      }}
    >
      <div className="balloon-head">
        {balloon.icon && <Icon name={balloon.icon} size={16} />}
        <b>{balloon.title}</b>
        <button
          type="button"
          className="balloon-close"
          aria-label="Close"
          onClick={(e) => {
            e.stopPropagation();
            hideBalloon(balloon.id);
          }}
        >
          ×
        </button>
      </div>
      <div className="balloon-body">{balloon.message}</div>
    </div>
  );
}

function Tray() {
  const muted = useSettings((s) => s.muted);
  const cluster = useSettings((s) => s.cluster);
  const update = useSettings((s) => s.update);
  const net = useNetStatus();
  const netTitle =
    net.state === 'online'
      ? `Connected to Solana ${clusterLabel(cluster)}\nSlot ${net.slot?.toLocaleString('en-US')}`
      : net.state === 'connecting'
        ? `Connecting to Solana ${clusterLabel(cluster)}...`
        : `Can't reach Solana ${clusterLabel(cluster)}\n${net.error ?? ''}`;
  return (
    <div className="tray">
      <Balloon />
      <span className={`tray-cluster ${cluster}`} title={`Cluster: ${clusterLabel(cluster)}`} onDoubleClick={() => openApp('netsettings')}>
        {cluster === 'mainnet-beta' ? 'MAINNET' : cluster === 'custom' ? 'CUSTOM' : 'DEVNET'}
      </span>
      <button
        type="button"
        className="tray-icon"
        title={netTitle}
        aria-label={netTitle}
        onClick={() => void checkNetwork()}
        onDoubleClick={() => openApp('netmon')}
        onContextMenu={(e) =>
          openContextMenu(e, [
            { label: 'Open Network Monitor', bold: true, onClick: () => openApp('netmon') },
            { label: 'Network Settings', onClick: () => openApp('netsettings') },
            { label: 'Reconnect', onClick: () => void checkNetwork() },
          ])
        }
      >
        <Icon name={net.state === 'offline' ? 'network-off' : 'network'} size={16} />
      </button>
      <button
        type="button"
        className="tray-icon"
        title={muted ? 'Volume (muted)' : 'Volume'}
        aria-label={muted ? 'Unmute' : 'Mute'}
        onClick={() => update({ muted: !muted })}
      >
        <Icon name={muted ? 'volume-muted' : 'volume'} size={16} />
      </button>
      <Clock />
    </div>
  );
}

export function Taskbar() {
  const windows = useWindows((s) => s.windows);
  const startOpen = useSession((s) => s.startOpen);
  const active = activeWindowId(windows);
  const tasks = windows.filter((w) => !getApp(w.appId)?.hideInTaskbar && !w.modalFor);

  const taskbarMenu = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.task-btn, .tray, .start-button')) return;
    openContextMenu(e, [
      { label: 'Show the Desktop', onClick: minimizeAll },
      sep,
      { label: 'Network Monitor', onClick: () => openApp('netmon') },
      sep,
      { label: 'Properties', onClick: () => openApp('display') },
    ]);
  };

  return (
    <>
      {startOpen && <StartMenu />}
      <div className="taskbar" onContextMenu={taskbarMenu}>
        <button
          type="button"
          className={`start-button${startOpen ? ' pressed' : ''}`}
          onClick={() => setStartOpen(!startOpen)}
          aria-label="Start"
          aria-expanded={startOpen}
        >
          <SolanaLogo size={20} />
          <span>start</span>
        </button>
        <div className="quick-launch">
          <button type="button" title="Show Desktop" onClick={minimizeAll}>
            <Icon name="display" size={16} />
          </button>
          <button type="button" title="Network Monitor" onClick={() => openApp('netmon')}>
            <Icon name="network-monitor" size={16} />
          </button>
          <button type="button" title="Command Prompt" onClick={() => openApp('cmd')}>
            <Icon name="cmd" size={16} />
          </button>
        </div>
        <div className="tasks">
          {tasks.map((w) => (
            <button
              key={w.id}
              type="button"
              className={`task-btn${w.id === active ? ' active' : ''}`}
              onClick={() => taskbarClick(w.id)}
              onContextMenu={(e) =>
                openContextMenu(e, [
                  { label: 'Restore', disabled: !w.minimized && !w.maximized, onClick: () => (w.maximized && !w.minimized ? toggleMaximize(w.id) : focusWindow(w.id)) },
                  { label: 'Minimize', disabled: w.minimized, onClick: () => minimizeWindow(w.id) },
                  { label: 'Maximize', disabled: w.maximized || getApp(w.appId)?.resizable === false, onClick: () => { focusWindow(w.id); if (!w.maximized) toggleMaximize(w.id); } },
                  sep,
                  { label: 'Close', bold: true, onClick: () => void requestClose(w.id) },
                ])
              }
              title={w.title}
            >
              <Icon name={w.icon} size={16} />
              <span>{w.title}</span>
            </button>
          ))}
        </div>
        <Tray />
      </div>
    </>
  );
}

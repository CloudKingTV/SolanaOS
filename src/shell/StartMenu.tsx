import { useEffect, useRef, useState } from 'react';
import { setStartOpen, showExitDialog, useSession } from '../os/session';
import { openApp } from '../os/windows';
import { openMyDocuments, openFolder } from '../os/shellActions';
import { MY_DOCUMENTS } from '../os/vfs';
import { Icon, type IconName } from './icons';
import { WalletIcon } from './WalletPicker';
import { MenuList, type MenuItem } from './Menu';

interface Entry {
  icon: IconName;
  label: string;
  sub?: string;
  onClick: () => void;
  bold?: boolean;
}

const left: Entry[] = [
  { icon: 'explorer-web', label: 'Solana Explorer', sub: 'Browse the chain', onClick: () => openApp('solexplorer'), bold: true },
  { icon: 'inbox', label: 'Inbox', sub: 'Solana Mail', onClick: () => openApp('inbox'), bold: true },
];
const recent: Entry[] = [
  { icon: 'paint', label: 'Mint Paint', onClick: () => openApp('paint') },
  { icon: 'swap', label: 'Swap', onClick: () => openApp('swap') },
  { icon: 'stake', label: 'Staking', onClick: () => openApp('staking') },
  { icon: 'send', label: 'Send Wizard', onClick: () => openApp('send') },
  { icon: 'network-monitor', label: 'Network Monitor', onClick: () => openApp('netmon') },
  { icon: 'cmd', label: 'Command Prompt', onClick: () => openApp('cmd') },
];
const right: (Entry | 'sep')[] = [
  { icon: 'wallet', label: 'My Wallet', onClick: () => openApp('mywallet'), bold: true },
  { icon: 'my-documents', label: 'My Documents', onClick: openMyDocuments, bold: true },
  { icon: 'collectibles', label: 'My Collectibles', onClick: () => openApp('collectibles'), bold: true },
  { icon: 'my-pictures', label: 'My Pictures', onClick: () => openFolder(`${MY_DOCUMENTS}\\My Pictures`), bold: true },
  { icon: 'burn-empty', label: 'Burn Bin', onClick: () => openApp('burnbin'), bold: true },
  'sep',
  { icon: 'control-panel', label: 'Control Panel', onClick: () => openApp('control') },
  { icon: 'globe', label: 'Network Settings', onClick: () => openApp('netsettings') },
  'sep',
  { icon: 'help', label: 'About SolanaOS', onClick: () => openApp('about') },
  { icon: 'run', label: 'Run...', onClick: () => openApp('run') },
];

const allPrograms: MenuItem[] = [
  {
    label: 'Accessories',
    icon: 'folder',
    submenu: [
      { label: 'Calculator', icon: 'calculator', onClick: () => openApp('calc') },
      { label: 'Command Prompt', icon: 'cmd', onClick: () => openApp('cmd') },
      { label: 'Notepad', icon: 'notepad', onClick: () => openApp('notepad') },
      { label: 'Paint', icon: 'paint', onClick: () => openApp('paint') },
      { label: 'Picture Viewer', icon: 'image', onClick: () => openApp('pictures') },
      { label: 'Windows Explorer', icon: 'folder-open', onClick: () => openFolder('C:\\') },
    ],
  },
  {
    label: 'Solana',
    icon: 'folder',
    submenu: [
      { label: 'My Wallet', icon: 'wallet', onClick: () => openApp('mywallet') },
      { label: 'Solana Explorer', icon: 'explorer-web', onClick: () => openApp('solexplorer') },
      { label: 'Inbox', icon: 'inbox', onClick: () => openApp('inbox') },
      { label: 'My Collectibles', icon: 'collectibles', onClick: () => openApp('collectibles') },
      { label: 'Mint Paint', icon: 'paint', onClick: () => openApp('paint') },
      { label: 'Send Wizard', icon: 'send', onClick: () => openApp('send') },
      { label: 'Stake Wizard', icon: 'stake', onClick: () => openApp('stake') },
      { label: 'Staking', icon: 'stake', onClick: () => openApp('staking') },
      { label: 'Swap', icon: 'swap', onClick: () => openApp('swap') },
      { label: 'Connect Wallet', icon: 'wallet', onClick: () => openApp('connect') },
    ],
  },
  {
    label: 'Games',
    icon: 'folder',
    submenu: [
      { label: 'Rugsweeper', icon: 'rugsweeper', onClick: () => openApp('rugsweeper') },
      { label: 'Solitaire', icon: 'cards', onClick: () => openApp('solitaire') },
    ],
  },
  {
    label: 'System Tools',
    icon: 'folder',
    submenu: [
      { label: 'Network Monitor', icon: 'network-monitor', onClick: () => openApp('netmon') },
      { label: 'Network Settings', icon: 'globe', onClick: () => openApp('netsettings') },
    ],
  },
  { separator: true },
  { label: 'Control Panel', icon: 'control-panel', onClick: () => openApp('control') },
  { label: 'About SolanaOS', icon: 'help', onClick: () => openApp('about') },
];

export function StartMenu() {
  const user = useSession((s) => s.user);
  const ref = useRef<HTMLDivElement>(null);
  const [programs, setPrograms] = useState<{ x: number; y: number } | null>(null);
  const hoverTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!ref.current?.contains(t) && !t.closest('.start-button') && !t.closest('.menu')) setStartOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setStartOpen(false);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(hoverTimer.current);
    };
  }, []);

  const run = (fn: () => void) => () => {
    setStartOpen(false);
    fn();
  };

  const showPrograms = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setPrograms({ x: r.right - 2, y: r.bottom });
  };

  return (
    <div className="start-menu" ref={ref} role="menu" aria-label="Start menu">
      <div className="sm-header">
        <span className="sm-avatar">
          {user?.walletIcon ? <WalletIcon src={user.walletIcon} size={44} /> : <Icon name={user?.avatar ?? 'avatar'} size={44} />}
        </span>
        <span className="sm-username">
          {user?.name ?? 'Guest'}
          {user?.walletName && <small className="sm-wallet">{user.walletName}</small>}
        </span>
      </div>
      <div className="sm-accent" />
      <div className="sm-body">
        <div className="sm-left">
          {left.map((e) => (
            <button key={e.label} type="button" className="sm-item big" onClick={run(e.onClick)} onPointerEnter={() => setPrograms(null)}>
              <Icon name={e.icon} size={32} />
              <span>
                <b>{e.label}</b>
                {e.sub && <small>{e.sub}</small>}
              </span>
            </button>
          ))}
          <div className="sm-sep" />
          {recent.map((e) => (
            <button key={e.label} type="button" className="sm-item big" onClick={run(e.onClick)} onPointerEnter={() => setPrograms(null)}>
              <Icon name={e.icon} size={32} />
              <span>{e.label}</span>
            </button>
          ))}
          <div className="sm-spacer" />
          <div className="sm-sep" />
          <button
            type="button"
            className={`sm-item sm-all${programs ? ' active' : ''}`}
            onPointerEnter={(ev) => {
              const el = ev.currentTarget;
              window.clearTimeout(hoverTimer.current);
              hoverTimer.current = window.setTimeout(() => showPrograms(el), 200);
            }}
            onClick={(ev) => showPrograms(ev.currentTarget)}
          >
            <b>All Programs</b>
            <span className="sm-all-arrow">▶</span>
          </button>
        </div>
        <div className="sm-right" onPointerEnter={() => setPrograms(null)}>
          {right.map((e, i) =>
            e === 'sep' ? (
              <div key={i} className="sm-sep light" />
            ) : (
              <button key={e.label} type="button" className={`sm-item${e.bold ? ' bold' : ''}`} onClick={run(e.onClick)}>
                <Icon name={e.icon} size={24} />
                <span>{e.label}</span>
              </button>
            ),
          )}
        </div>
      </div>
      <div className="sm-footer">
        <button type="button" className="sm-foot-btn" onClick={() => showExitDialog('log-off')}>
          <Icon name="log-off" size={24} />
          <span>Log Off</span>
        </button>
        <button type="button" className="sm-foot-btn" onClick={() => showExitDialog('turn-off')}>
          <Icon name="power" size={24} />
          <span>Turn Off Computer</span>
        </button>
      </div>
      {programs && (
        <div className="menu-layer">
          <MenuList
            className="start-flyout"
            items={allPrograms}
            x={programs.x}
            y={0}
            bottom={programs.y}
            onDone={() => setStartOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

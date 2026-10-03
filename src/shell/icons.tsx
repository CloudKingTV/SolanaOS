import { useId, type ReactElement } from 'react';

// Original XP-style icons drawn as SVG on a 32×32 grid.
type Draw = (u: (n: string) => string) => ReactElement;

const lg = (id: string, stops: [string, string][], x2 = 0, y2 = 1) => (
  <linearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}>
    {stops.map(([o, c]) => (
      <stop key={o} offset={o} stopColor={c} />
    ))}
  </linearGradient>
);

const solanaMark = (u: (n: string) => string, x = 4, y = 7, s = 1) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <defs>
      <linearGradient id={u('sol')} x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor="#9945FF" />
        <stop offset="1" stopColor="#14F195" />
      </linearGradient>
    </defs>
    <path fill={`url(#${u('sol')})`} d="M4.5 0H24l-4.5 4.5H0zM0 7.5h19.5L24 12H4.5zM4.5 15H24l-4.5 4.5H0z" />
  </g>
);

const folderShape = (u: (n: string) => string, open = false) => (
  <>
    <defs>
      {lg(u('fb'), [['0', '#ffe9a6'], ['1', '#e9b746']])}
      {lg(u('ff'), [['0', '#fff3c4'], ['1', '#f2c650']])}
    </defs>
    <path d="M2 7.5c0-.8.7-1.5 1.5-1.5h8l2.5 3h14.5c.8 0 1.5.7 1.5 1.5V26c0 .8-.7 1.5-1.5 1.5h-25C2.7 27.5 2 26.8 2 26z" fill={`url(#${u('fb')})`} stroke="#b0812a" />
    {open ? (
      <path d="M5.5 13h25L27 27.5H2z" fill={`url(#${u('ff')})`} stroke="#b0812a" strokeLinejoin="round" />
    ) : (
      <path d="M2 12h28v14c0 .8-.7 1.5-1.5 1.5h-25C2.7 27.5 2 26.8 2 26z" fill={`url(#${u('ff')})`} stroke="#b0812a" />
    )}
  </>
);

const page = (u: (n: string) => string, lines = true) => (
  <>
    <defs>{lg(u('pg'), [['0', '#ffffff'], ['1', '#dfe6f2']], 1, 1)}</defs>
    <path d="M7 2.5h12l6 6v21H7z" fill={`url(#${u('pg')})`} stroke="#6b7a99" strokeLinejoin="round" />
    <path d="M19 2.5v6h6" fill="#cfd8e8" stroke="#6b7a99" strokeLinejoin="round" />
    {lines && <path d="M10 13h12M10 16h12M10 19h12M10 22h9" stroke="#8aa0c8" strokeWidth="1.2" />}
  </>
);

const monitor = (u: (n: string) => string, screen: ReactElement) => (
  <>
    <defs>
      {lg(u('mb'), [['0', '#f2f2f2'], ['1', '#b9bcc4']])}
      {lg(u('ms'), [['0', '#2a1563'], ['1', '#120a33']])}
    </defs>
    <rect x="2.5" y="3.5" width="27" height="20" rx="2" fill={`url(#${u('mb')})`} stroke="#5d6270" />
    <rect x="5" y="6" width="22" height="15" fill={`url(#${u('ms')})`} stroke="#3c3f4a" />
    {screen}
    <path d="M12 23.5h8l1.5 4h-11z" fill="#c9ccd3" stroke="#5d6270" />
    <rect x="8" y="27.5" width="16" height="2.5" rx="1" fill="#d8dae0" stroke="#5d6270" />
  </>
);

const badge = (u: (n: string) => string, color: string, glyph: ReactElement) => (
  <>
    <defs>
      <radialGradient id={u('bd')} cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
        <stop offset="0.35" stopColor={color} />
        <stop offset="1" stopColor={color} stopOpacity="0.85" />
      </radialGradient>
    </defs>
    <circle cx="16" cy="16" r="13.5" fill={`url(#${u('bd')})`} stroke="#00000055" />
    {glyph}
  </>
);

const binShape = (u: (n: string) => string, full: boolean) => (
  <>
    <defs>
      {lg(u('bn'), [['0', '#e8ecf4'], ['0.5', '#ffffff'], ['1', '#aeb6c6']], 1, 0)}
      {lg(u('fl'), [['0', '#14F195'], ['1', '#9945FF']])}
    </defs>
    {full && (
      <path d="M11 9c0-3 3-4 2-7 3 2 5 4 4 7 1-1 2-2 1.5-4 3 2 3.5 5 2.5 8H11z" fill={`url(#${u('fl')})`} opacity="0.95" />
    )}
    <path d="M7 10h18l-2 19H9z" fill={`url(#${u('bn')})`} stroke="#5f6a80" strokeLinejoin="round" />
    <ellipse cx="16" cy="10" rx="9" ry="2.2" fill="#d4dae6" stroke="#5f6a80" />
    <path d="M12 14l.8 12M16 14v12M20 14l-.8 12" stroke="#8792a8" strokeWidth="1.2" />
    {full && <path d="M11 9.5l3-2 4 1.5 3-1" stroke="#7c5bd6" strokeWidth="1.2" fill="none" />}
  </>
);

const networkShape = (u: (n: string) => string) => (
    <>
      <defs>{lg(u('nw'), [['0', '#f4f4f4'], ['1', '#b0b4bf']])}</defs>
      <rect x="2" y="4" width="16" height="12" rx="1" fill={`url(#${u('nw')})`} stroke="#4c5160" />
      <rect x="4" y="6" width="12" height="8" fill="#5a2fd6" />
      <rect x="14" y="14" width="16" height="12" rx="1" fill={`url(#${u('nw')})`} stroke="#4c5160" />
      <rect x="16" y="16" width="12" height="8" fill="#14b98a" />
      <path d="M8 16v3h6M10 26h4" stroke="#4c5160" strokeWidth="1.5" />
    </>
  );

const icons = {
  solana: (u) => (
    <>
      <rect x="1" y="1" width="30" height="30" rx="6" fill="#170d33" />
      {solanaMark(u, 4, 6.25, 1)}
    </>
  ),
  'solana-mark': (u) => solanaMark(u, 4, 6.25, 1),
  folder: (u) => folderShape(u),
  'folder-open': (u) => folderShape(u, true),
  'my-documents': (u) => (
    <>
      {folderShape(u)}
      <path d="M9 4h10l3 3v10H9z" fill="#fff" stroke="#6b7a99" />
      <path d="M11 9h8M11 11.5h8" stroke="#8aa0c8" />
      <path d="M2 12h28v14c0 .8-.7 1.5-1.5 1.5h-25C2.7 27.5 2 26.8 2 26z" fill="#f2c650" opacity="0.9" stroke="#b0812a" />
      {solanaMark(u, 11, 16, 0.42)}
    </>
  ),
  'my-pictures': (u) => (
    <>
      {folderShape(u)}
      <rect x="10" y="14" width="13" height="10" fill="#fff" stroke="#6b7a99" />
      <path d="M11 23l4-5 3 3 2-2 2 4z" fill="#4bb26b" />
      <circle cx="20" cy="17" r="1.4" fill="#f5b400" />
    </>
  ),
  'file-text': (u) => page(u),
  file: (u) => page(u, false),
  notepad: (u) => (
    <>
      {page(u)}
      <path d="M7 2.5h18v4H7z" fill="#5b8fd6" stroke="#2f5b9e" />
      <path d="M10 1v4M14 1v4M18 1v4M22 1v4" stroke="#555" strokeWidth="1.4" />
      <path d="M21 27l7-12 2.2 1.3-7 12-2.8 1.3z" fill="#f5c542" stroke="#8a6a1a" />
    </>
  ),
  calculator: (u) => (
    <>
      <defs>{lg(u('cb'), [['0', '#f6f6f6'], ['1', '#c4c8d2']])}</defs>
      <rect x="6" y="2.5" width="20" height="27" rx="2" fill={`url(#${u('cb')})`} stroke="#4f5566" />
      <rect x="8.5" y="5" width="15" height="5.5" fill="#cfe9d4" stroke="#557a5e" />
      <text x="22.5" y="9.6" fontSize="5" textAnchor="end" fontFamily="monospace" fill="#244">◎42</text>
      {[0, 1, 2].map((r) =>
        [0, 1, 2, 3].map((c) => (
          <rect key={`${r}${c}`} x={8.5 + c * 4} y={13 + r * 5.2} width="3" height="3.8" rx="0.6" fill={c === 3 ? '#9945FF' : '#fff'} stroke="#6a7080" strokeWidth="0.6" />
        )),
      )}
    </>
  ),
  cmd: (u) => (
    <>
      <defs>{lg(u('ct'), [['0', '#6a8de0'], ['1', '#2c4fa8']])}</defs>
      <rect x="2.5" y="4.5" width="27" height="23" rx="1.5" fill="#000" stroke="#555" />
      <rect x="2.5" y="4.5" width="27" height="4" fill={`url(#${u('ct')})`} stroke="#555" />
      <text x="5" y="17.5" fontSize="7" fontFamily="monospace" fill="#c0c0c0">C:\&gt;</text>
      <rect x="5" y="20" width="5" height="1.5" fill="#c0c0c0" />
    </>
  ),
  rugsweeper: (u) => (
    <>
      <defs>{lg(u('rg'), [['0', '#b8324a'], ['1', '#7a1a33']])}</defs>
      <rect x="5" y="7" width="22" height="18" rx="1" fill={`url(#${u('rg')})`} stroke="#4a0f20" />
      <rect x="8" y="10" width="16" height="12" fill="none" stroke="#f2c650" strokeWidth="1.2" />
      <path d="M16 11.5l4 4.5-4 4.5-4-4.5z" fill="#14F195" stroke="#0b6b46" strokeWidth="0.8" />
      <path d="M5 9h-2M5 12h-2M5 15h-2M5 18h-2M5 21h-2M5 24h-2M27 9h2M27 12h2M27 15h2M27 18h2M27 21h2M27 24h2" stroke="#d9c38c" strokeWidth="1.2" />
    </>
  ),
  'burn-empty': (u) => binShape(u, false),
  'burn-full': (u) => binShape(u, true),
  'network-monitor': (u) =>
    monitor(
      u,
      <path d="M6 18l3-2 3 1 3-6 3 4 3-7 3 5 2-2" fill="none" stroke="#14F195" strokeWidth="1.4" />,
    ),
  computer: (u) =>
    monitor(u, <>{solanaMark(u, 10.5, 9.4, 0.46)}</>),
  display: (u) =>
    monitor(
      u,
      <>
        <defs>{lg(u('dw'), [['0', '#7a3df0'], ['1', '#1fbfa0']])}</defs>
        <rect x="5.5" y="6.5" width="21" height="14" fill={`url(#${u('dw')})`} />
        <path d="M5.5 20.5c4-6 9-7 21-4v4z" fill="#3fbf6a" />
      </>,
    ),
  'control-panel': (u) => (
    <>
      <defs>
        {lg(u('cp'), [['0', '#b9a3f5'], ['1', '#6a3fd6']])}
        {lg(u('cg'), [['0', '#ffffff'], ['1', '#c9ced8']])}
      </defs>
      <rect x="3" y="5" width="26" height="22" rx="2" fill={`url(#${u('cp')})`} stroke="#3b1f86" />
      <circle cx="11" cy="13" r="4.5" fill={`url(#${u('cg')})`} stroke="#444" />
      <path d="M11 13l2.5-2.5" stroke="#c0392b" strokeWidth="1.5" />
      <rect x="18" y="9" width="2" height="14" fill="#2a1563" />
      <rect x="23" y="9" width="2" height="14" fill="#2a1563" />
      <rect x="16.5" y="16" width="5" height="3" rx="1" fill={`url(#${u('cg')})`} stroke="#444" />
      <rect x="21.5" y="11" width="5" height="3" rx="1" fill={`url(#${u('cg')})`} stroke="#444" />
      <rect x="7" y="20" width="8" height="3" rx="1" fill="#14F195" stroke="#0b6b46" />
    </>
  ),
  run: (u) => (
    <>
      <defs>{lg(u('rn'), [['0', '#ffffff'], ['1', '#c9d3e6']])}</defs>
      <rect x="3" y="8" width="26" height="18" rx="1.5" fill={`url(#${u('rn')})`} stroke="#4f5f80" />
      <rect x="3" y="8" width="26" height="4" fill="#7a3df0" stroke="#4f5f80" />
      <path d="M8 21l6-5-6-5" transform="translate(2 1)" fill="none" stroke="#2a8f5a" strokeWidth="2.2" />
      <path d="M17 22h7" stroke="#333" strokeWidth="1.6" />
    </>
  ),
  help: (u) =>
    badge(
      u,
      '#3b7de0',
      <text x="16" y="22.5" fontSize="17" fontWeight="bold" textAnchor="middle" fill="#fff" fontFamily="Georgia, serif">?</text>,
    ),
  info: (u) =>
    badge(
      u,
      '#2f6fdc',
      <text x="16" y="23" fontSize="18" fontWeight="bold" textAnchor="middle" fill="#fff" fontFamily="Georgia, serif">i</text>,
    ),
  question: (u) =>
    badge(
      u,
      '#2f6fdc',
      <text x="16" y="22.5" fontSize="17" fontWeight="bold" textAnchor="middle" fill="#fff" fontFamily="Georgia, serif">?</text>,
    ),
  error: (u) =>
    badge(u, '#d9261c', <path d="M11 11l10 10M21 11l-10 10" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />),
  warning: (u) => (
    <>
      <defs>{lg(u('wn'), [['0', '#ffe680'], ['1', '#f2b600']])}</defs>
      <path d="M16 3l14 25H2z" fill={`url(#${u('wn')})`} stroke="#8a6500" strokeLinejoin="round" />
      <path d="M16 11v9" stroke="#000" strokeWidth="3" strokeLinecap="round" />
      <circle cx="16" cy="24" r="1.8" />
    </>
  ),
  'log-off': (u) => (
    <>
      <defs>{lg(u('lk'), [['0', '#ffe9a0'], ['1', '#d9a520']])}</defs>
      <rect x="2" y="2" width="28" height="28" rx="4" fill="#e9a531" stroke="#8a5a10" />
      <circle cx="12" cy="13" r="5" fill="none" stroke={`url(#${u('lk')})`} strokeWidth="3" />
      <path d="M15.5 16.5l8 8M20 21l2-2M22.5 23.5l2-2" stroke="#fff3c8" strokeWidth="2.6" strokeLinecap="round" />
    </>
  ),
  power: (u) => (
    <>
      <defs>{lg(u('pw'), [['0', '#ff8a6a'], ['1', '#c9301a']])}</defs>
      <rect x="2" y="2" width="28" height="28" rx="4" fill={`url(#${u('pw')})`} stroke="#7a1808" />
      <path d="M11 10a8 8 0 1 0 10 0" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M16 6.5v9" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" />
    </>
  ),
  restart: (u) => (
    <>
      <defs>{lg(u('rs'), [['0', '#7fe6b0'], ['1', '#1f9a5a']])}</defs>
      <rect x="2" y="2" width="28" height="28" rx="4" fill={`url(#${u('rs')})`} stroke="#0d5a32" />
      <path d="M22.5 11.5A8 8 0 1 0 24 17" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M24.5 6.5v6h-6" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  standby: (u) => (
    <>
      <defs>{lg(u('sb'), [['0', '#ffd877'], ['1', '#e09a10']])}</defs>
      <rect x="2" y="2" width="28" height="28" rx="4" fill={`url(#${u('sb')})`} stroke="#7a5208" />
      <path d="M20 8a9 9 0 1 0 5 13A7 7 0 0 1 20 8z" fill="#fff" />
    </>
  ),
  'switch-user': (u) => (
    <>
      <defs>{lg(u('su'), [['0', '#9cc2ff'], ['1', '#2f62c9']])}</defs>
      <rect x="2" y="2" width="28" height="28" rx="4" fill={`url(#${u('su')})`} stroke="#173b80" />
      <circle cx="12" cy="12" r="3.5" fill="#fff" />
      <path d="M6 23c0-4 3-6 6-6s6 2 6 6z" fill="#fff" />
      <path d="M19 10h7M23 7l3 3-3 3M26 20h-7M22 17l-3 3 3 3" fill="none" stroke="#fff" strokeWidth="1.8" />
    </>
  ),
  avatar: (u) => (
    <>
      <defs>
        {lg(u('av'), [['0', '#9945FF'], ['1', '#14F195']], 1, 1)}
        <radialGradient id={u('ah')} cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#c8d0e0" />
        </radialGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="3" fill={`url(#${u('av')})`} />
      <circle cx="16" cy="14" r="8" fill={`url(#${u('ah')})`} stroke="#3a2a6a" />
      <rect x="10.5" y="10.5" width="11" height="6.5" rx="3" fill="#1b1036" />
      <path d="M12.5 13h7" stroke="#14F195" strokeWidth="1.2" />
      <path d="M6 31c0-6 4.5-8.5 10-8.5S26 25 26 31z" fill={`url(#${u('ah')})`} stroke="#3a2a6a" />
    </>
  ),
  wallet: (u) => (
    <>
      <defs>{lg(u('wl'), [['0', '#8d5af7'], ['1', '#4a1fa8']])}</defs>
      <rect x="3" y="8" width="26" height="19" rx="3" fill={`url(#${u('wl')})`} stroke="#2a0f6a" />
      <path d="M5 8l16-4 2 4" fill="#c9b6ff" stroke="#2a0f6a" />
      <rect x="19" y="14" width="10" height="7" rx="2" fill="#2a0f6a" />
      <circle cx="23" cy="17.5" r="1.6" fill="#14F195" />
    </>
  ),
  network: (u) => networkShape(u),
  'network-off': (u) => (
    <>
      {networkShape(u)}
      <circle cx="10" cy="24" r="6" fill="#d9261c" stroke="#fff" />
      <path d="M7.5 21.5l5 5M12.5 21.5l-5 5" stroke="#fff" strokeWidth="1.8" />
    </>
  ),
  volume: () => (
    <>
      <path d="M4 12h6l7-6v20l-7-6H4z" fill="#e9eef8" stroke="#4c5160" strokeLinejoin="round" />
      <path d="M21 11c2 2 2 8 0 10M24 8c4 4 4 12 0 16" fill="none" stroke="#e9eef8" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  'volume-muted': () => (
    <>
      <path d="M4 12h6l7-6v20l-7-6H4z" fill="#e9eef8" stroke="#4c5160" strokeLinejoin="round" />
      <circle cx="24" cy="16" r="6" fill="#d9261c" stroke="#fff" />
      <path d="M21.5 13.5l5 5M26.5 13.5l-5 5" stroke="#fff" strokeWidth="1.8" />
    </>
  ),
  sound: (u) => (
    <>
      <defs>{lg(u('sd'), [['0', '#cfd6e6'], ['1', '#7c879e']])}</defs>
      <path d="M4 12h6l8-7v22l-8-7H4z" fill={`url(#${u('sd')})`} stroke="#3e4558" strokeLinejoin="round" />
      <path d="M22 11c2 2 2 8 0 10M25 8c4 4 4 12 0 16" fill="none" stroke="#7a3df0" strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  globe: (u) => (
    <>
      <defs>
        <radialGradient id={u('gl')} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#b9f5dc" />
          <stop offset="1" stopColor="#13a47a" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="13" fill={`url(#${u('gl')})`} stroke="#0b5a43" />
      <path d="M3 16h26M16 3c-5 4-5 22 0 26M16 3c5 4 5 22 0 26M5.5 9h21M5.5 23h21" fill="none" stroke="#0b5a43" strokeWidth="1" />
    </>
  ),
  system: (u) => (
    <>
      {monitor(u, <>{solanaMark(u, 10.5, 9.4, 0.46)}</>)}
      <circle cx="25" cy="25" r="6" fill="#e9eef8" stroke="#3e4558" />
      <path d="M25 22v6M22 25h6" stroke="#3e4558" strokeWidth="1.6" />
    </>
  ),
  back: (u) => (
    <>
      <defs>{lg(u('bk'), [['0', '#7fe6b0'], ['1', '#1a9a5a']])}</defs>
      <circle cx="16" cy="16" r="13" fill={`url(#${u('bk')})`} stroke="#0d5a32" />
      <path d="M18 9l-7 7 7 7" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  forward: (u) => (
    <>
      <defs>{lg(u('fw'), [['0', '#7fe6b0'], ['1', '#1a9a5a']])}</defs>
      <circle cx="16" cy="16" r="13" fill={`url(#${u('fw')})`} stroke="#0d5a32" />
      <path d="M14 9l7 7-7 7" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  up: (u) => (
    <>
      {folderShape(u)}
      <path d="M16 25V15M11 19l5-5 5 5" fill="none" stroke="#1a9a5a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  tour: (u) => (
    <>
      <defs>{lg(u('tr'), [['0', '#ffe680'], ['1', '#f2a600']])}</defs>
      <path d="M16 2l3.7 8.5 9.3.9-7 6.2 2 9.1-8-4.8-8 4.8 2-9.1-7-6.2 9.3-.9z" fill={`url(#${u('tr')})`} stroke="#8a5a00" strokeLinejoin="round" />
    </>
  ),
  'screen-saver': (u) =>
    monitor(
      u,
      <>
        <circle cx="10" cy="10" r="0.8" fill="#fff" />
        <circle cx="21" cy="9" r="1" fill="#14F195" />
        <circle cx="16" cy="15" r="1.2" fill="#c9a8ff" />
        <circle cx="8" cy="18" r="0.7" fill="#fff" />
        <circle cx="24" cy="17" r="0.8" fill="#fff" />
      </>,
    ),
  drive: (u) => (
    <>
      <defs>
        {lg(u('dv'), [['0', '#f4f4f6'], ['0.5', '#d9dbe2'], ['1', '#a9adb9']])}
        {lg(u('dl'), [['0', '#9945FF'], ['1', '#14F195']], 1, 0)}
      </defs>
      <path d="M3 13l4-6h18l4 6v11H3z" fill={`url(#${u('dv')})`} stroke="#555a68" strokeLinejoin="round" />
      <path d="M3 13h26" stroke="#555a68" />
      <rect x="5" y="16" width="22" height="5" rx="1" fill="#e9ebf0" stroke="#8a8f9c" />
      <rect x="6" y="17" width="12" height="3" fill={`url(#${u('dl')})`} />
      <circle cx="24.5" cy="18.5" r="1" fill="#14F195" />
      {solanaMark(u, 11, 8.6, 0.42)}
    </>
  ),
  coin: (u) => (
    <>
      <defs>
        <radialGradient id={u('cn')} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.35" stopColor="#c9b6ff" />
          <stop offset="1" stopColor="#6a3fe0" />
        </radialGradient>
      </defs>
      <ellipse cx="16" cy="18" rx="12" ry="11" fill="#3f1aa0" />
      <circle cx="16" cy="15.5" r="12" fill={`url(#${u('cn')})`} stroke="#2e1470" />
      <circle cx="16" cy="15.5" r="8.5" fill="none" stroke="#ffffff" strokeOpacity="0.55" />
      {solanaMark(u, 10, 10.6, 0.5)}
    </>
  ),
  'explorer-web': (u) => (
    <>
      <defs>
        <radialGradient id={u('ew')} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#d9f3ff" />
          <stop offset="1" stopColor="#3a74e0" />
        </radialGradient>
        {lg(u('er'), [['0', '#9945FF'], ['1', '#14F195']], 1, 0)}
      </defs>
      <circle cx="16" cy="16" r="11" fill={`url(#${u('ew')})`} stroke="#1d3f8a" />
      <text x="16" y="22.5" fontSize="18" fontWeight="bold" textAnchor="middle" fill="#fff" fontFamily="Georgia, serif" stroke="#1d3f8a" strokeWidth="0.6">e</text>
      <ellipse cx="16" cy="16" rx="15" ry="5.5" fill="none" stroke={`url(#${u('er')})`} strokeWidth="2.4" transform="rotate(-25 16 16)" />
    </>
  ),
  inbox: (u) => (
    <>
      <defs>{lg(u('ib'), [['0', '#ffffff'], ['1', '#dfe4ef']])}</defs>
      <rect x="3" y="8" width="26" height="18" rx="1.5" fill={`url(#${u('ib')})`} stroke="#4f5f80" />
      <path d="M3.5 9l12.5 10 12.5-10" fill="none" stroke="#4f5f80" />
      <path d="M3.5 25.5l9.5-8M28.5 25.5l-9.5-8" stroke="#8a97b2" />
      <circle cx="25" cy="8" r="5" fill="#14b981" stroke="#fff" />
      <path d="M23 8h4M25 6v4" stroke="#fff" strokeWidth="1.5" />
    </>
  ),
  send: (u) => (
    <>
      <defs>{lg(u('sn'), [['0', '#b58cff'], ['1', '#5a1fc9']], 1, 1)}</defs>
      <path d="M3 15L29 4 21 28l-5-9z" fill={`url(#${u('sn')})`} stroke="#2e1470" strokeLinejoin="round" />
      <path d="M16 19L29 4" stroke="#e9e0ff" strokeWidth="1.2" />
      <path d="M16 19l-1 7 3.5-4" fill="#3f1aa0" />
    </>
  ),
  airdrop: (u) => (
    <>
      <defs>{lg(u('ad'), [['0', '#14F195'], ['1', '#9945FF']], 1, 0)}</defs>
      <path d="M4 14C4 7 10 3 16 3s12 4 12 11c-2-2-4-2-6 0-2-2-4-2-6 0-2-2-4-2-6 0-2-2-4-2-6 0z" fill={`url(#${u('ad')})`} stroke="#2e1470" />
      <path d="M4.5 14L14 23M27.5 14L18 23M16 14v9" stroke="#2e1470" />
      <rect x="12.5" y="22" width="7" height="7" rx="1" fill="#f2c650" stroke="#8a6a1a" />
      {solanaMark(u, 13.3, 23.4, 0.22)}
    </>
  ),
} satisfies Record<string, Draw>;

export type IconName = keyof typeof icons;

export function Icon({ name, size = 32, className }: { name: IconName; size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  const u = (n: string) => `${id}-${n}`;
  const draw = icons[name] as Draw;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      {draw(u)}
    </svg>
  );
}

export function SolanaLogo({ size = 24 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={(size * 19.5) / 24} viewBox="0 0 24 19.5" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#9945FF" />
          <stop offset="1" stopColor="#14F195" />
        </linearGradient>
      </defs>
      <path fill={`url(#${id}g)`} d="M4.5 0H24l-4.5 4.5H0zM0 7.5h19.5L24 12H4.5zM4.5 15H24l-4.5 4.5H0z" />
    </svg>
  );
}

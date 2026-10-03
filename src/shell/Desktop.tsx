import { useEffect, useMemo, useRef, useState } from 'react';
import { DESKTOP_DIR, displayName, list, mkdir, recycle, recycled, rename, uniqueName, useVfs, writeFile, VfsError } from '../os/vfs';
import { basename, extname, join, keyOf } from '../os/path';
import { openApp } from '../os/windows';
import { openMyDocuments, openPath } from '../os/shellActions';
import { messageBox } from '../os/dialogs';
import { emptyBurnBin } from '../apps/burnbin/actions';
import { useTokenBinItems } from '../apps/burnbin/TokenBin';
import { useWallet } from '../os/wallet/standard';
import { Icon, type IconName } from './icons';
import { openContextMenu, sep, type MenuItem } from './Menu';

interface DeskItem {
  key: string;
  label: string;
  icon: IconName;
  open: () => void;
  menu: () => MenuItem[];
  path?: string;
  renamable?: boolean;
  dropTarget?: boolean;
}

const CELL_W = 84;
const CELL_H = 82;
const POS_KEY = 'solanaos.desktop.positions.v1';

function loadPositions(): Record<string, { col: number; row: number }> {
  try {
    return JSON.parse(localStorage.getItem(POS_KEY) ?? '{}');
  } catch {
    return {};
  }
}
function savePositions(p: Record<string, { col: number; row: number }>) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(p));
  } catch {
    // Non-critical.
  }
}

function fileIcon(path: string, isDir: boolean): IconName {
  if (isDir) return 'folder';
  return extname(path) === 'txt' || extname(path) === 'md' ? 'file-text' : 'file';
}

export function Desktop() {
  const nodes = useVfs((s) => s.nodes);
  const tokenBin = useTokenBinItems().length;
  const binFull = recycled(nodes).length > 0 || tokenBin > 0;
  const walletConnected = useWallet((s) => !!s.connection);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [positions, setPositions] = useState(loadPositions);
  const [band, setBand] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [dragging, setDragging] = useState<{ key: string; dx: number; dy: number; x: number; y: number } | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState(8);

  // Observe size rather than window resizes: the desktop is laid out while hidden during logon.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => {
      if (el.clientHeight > 0) setRows(Math.max(3, Math.floor((el.clientHeight - 8) / CELL_H)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const items: DeskItem[] = useMemo(() => {
    const sys: DeskItem[] = [
      {
        key: 'sys:wallet',
        label: 'My Wallet',
        icon: 'wallet',
        open: () => openApp('mywallet'),
        menu: () => [
          { label: 'Open', bold: true, onClick: () => openApp('mywallet') },
          { label: walletConnected ? 'Send...' : 'Connect Wallet...', onClick: () => openApp(walletConnected ? 'send' : 'connect') },
        ],
      },
      {
        key: 'sys:docs',
        label: 'My Documents',
        icon: 'my-documents',
        open: openMyDocuments,
        menu: () => [{ label: 'Open', bold: true, onClick: openMyDocuments }],
      },
      {
        key: 'sys:burnbin',
        label: 'Burn Bin',
        icon: binFull ? 'burn-full' : 'burn-empty',
        open: () => openApp('burnbin'),
        dropTarget: true,
        menu: () => [
          { label: 'Open', bold: true, onClick: () => openApp('burnbin') },
          {
            label: 'Empty Burn Bin',
            disabled: !binFull,
            onClick: () => (tokenBin ? openApp('burnbin', { view: 'tokens' }) : void emptyBurnBin()),
          },
        ],
      },
      {
        key: 'sys:solexplorer',
        label: 'Solana Explorer',
        icon: 'explorer-web',
        open: () => openApp('solexplorer'),
        menu: () => [{ label: 'Open', bold: true, onClick: () => openApp('solexplorer') }],
      },
      {
        key: 'sys:inbox',
        label: 'Inbox',
        icon: 'inbox',
        open: () => openApp('inbox'),
        menu: () => [{ label: 'Open', bold: true, onClick: () => openApp('inbox') }],
      },
      {
        key: 'sys:netmon',
        label: 'Network Monitor',
        icon: 'network-monitor',
        open: () => openApp('netmon'),
        menu: () => [{ label: 'Open', bold: true, onClick: () => openApp('netmon') }],
      },
      {
        key: 'sys:cmd',
        label: 'Command Prompt',
        icon: 'cmd',
        open: () => openApp('cmd'),
        menu: () => [{ label: 'Open', bold: true, onClick: () => openApp('cmd') }],
      },
      {
        key: 'sys:rugsweeper',
        label: 'Rugsweeper',
        icon: 'rugsweeper',
        open: () => openApp('rugsweeper'),
        menu: () => [{ label: 'Play', bold: true, onClick: () => openApp('rugsweeper') }],
      },
    ];
    const files: DeskItem[] = list(DESKTOP_DIR, nodes).map((n) => ({
      key: keyOf(n.path),
      label: displayName(n),
      icon: fileIcon(n.path, n.type === 'dir'),
      path: n.path,
      renamable: true,
      open: () => openPath(n.path),
      menu: () => [
        { label: 'Open', bold: true, onClick: () => openPath(n.path) },
        sep,
        { label: 'Delete', onClick: () => tryRecycle(n.path) },
        { label: 'Rename', onClick: () => setRenaming(keyOf(n.path)) },
      ],
    }));
    return [...sys, ...files];
  }, [nodes, binFull, tokenBin, walletConnected]);

  // Assign grid cells: saved position if free, otherwise next free cell (column-major, like XP).
  const layout = useMemo(() => {
    const taken = new Set<string>();
    const out = new Map<string, { col: number; row: number }>();
    for (const it of items) {
      const p = positions[it.key];
      if (p && p.row < rows && !taken.has(`${p.col},${p.row}`)) {
        out.set(it.key, p);
        taken.add(`${p.col},${p.row}`);
      }
    }
    let c = 0;
    let r = 0;
    for (const it of items) {
      if (out.has(it.key)) continue;
      while (taken.has(`${c},${r}`)) {
        r++;
        if (r >= rows) ((r = 0), c++);
      }
      out.set(it.key, { col: c, row: r });
      taken.add(`${c},${r}`);
    }
    return out;
  }, [items, positions, rows]);

  const tryRecycle = (path: string) => {
    try {
      recycle(path);
    } catch (e) {
      void messageBox({ title: 'Error Deleting File', icon: 'error', message: e instanceof VfsError ? e.message : String(e) });
    }
  };

  const deleteSelected = () => {
    for (const it of items) if (selected.has(it.key) && it.path) tryRecycle(it.path);
    setSelected(new Set());
  };

  const newItem = (kind: 'folder' | 'text') => {
    const name = kind === 'folder' ? uniqueName(DESKTOP_DIR, 'New Folder') : uniqueName(DESKTOP_DIR, 'New Text Document', 'txt');
    const path = join(DESKTOP_DIR, name);
    if (kind === 'folder') mkdir(path);
    else writeFile(path, '');
    setSelected(new Set([keyOf(path)]));
    setRenaming(keyOf(path));
  };

  const desktopMenu = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.desk-icon')) return;
    setSelected(new Set());
    openContextMenu(e, [
      {
        label: 'Arrange Icons By',
        submenu: [
          {
            label: 'Name',
            onClick: () => {
              setPositions({});
              savePositions({});
            },
          },
        ],
      },
      { label: 'Refresh', onClick: () => setSelected(new Set()) },
      sep,
      {
        label: 'New',
        submenu: [
          { label: 'Folder', icon: 'folder', onClick: () => newItem('folder') },
          { label: 'Text Document', icon: 'file-text', onClick: () => newItem('text') },
        ],
      },
      sep,
      { label: 'Properties', onClick: () => openApp('display') },
    ]);
  };

  const onAreaPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    setSelected(new Set());
    setRenaming(null);
    const r = areaRef.current!.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    setBand({ x0: x, y0: y, x1: x, y1: y });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onAreaPointerMove = (e: React.PointerEvent) => {
    if (!band) return;
    const r = areaRef.current!.getBoundingClientRect();
    const nb = { ...band, x1: e.clientX - r.left, y1: e.clientY - r.top };
    setBand(nb);
    const [lx, hx] = [Math.min(nb.x0, nb.x1), Math.max(nb.x0, nb.x1)];
    const [ly, hy] = [Math.min(nb.y0, nb.y1), Math.max(nb.y0, nb.y1)];
    const sel = new Set<string>();
    for (const it of items) {
      const p = layout.get(it.key)!;
      const ix = p.col * CELL_W + 4;
      const iy = p.row * CELL_H + 4;
      if (ix + CELL_W - 8 > lx && ix < hx && iy + CELL_H - 8 > ly && iy < hy) sel.add(it.key);
    }
    setSelected(sel);
  };
  const onAreaPointerUp = () => setBand(null);

  const startIconDrag = (it: DeskItem, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (e.ctrlKey) {
      setSelected((s) => {
        const n = new Set(s);
        if (n.has(it.key)) n.delete(it.key);
        else n.add(it.key);
        return n;
      });
      return;
    }
    if (!selected.has(it.key)) setSelected(new Set([it.key]));
    const p = layout.get(it.key)!;
    const r = areaRef.current!.getBoundingClientRect();
    const sx = e.clientX;
    const sy = e.clientY;
    const ox = p.col * CELL_W + 4;
    const oy = p.row * CELL_H + 4;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      moved = true;
      setDragging({ key: it.key, dx: ox - (sx - r.left), dy: oy - (sy - r.top), x: ev.clientX - r.left, y: ev.clientY - r.top });
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      setDragging(null);
      if (!moved) return;
      // Dropped on the Burn Bin?
      const binPos = layout.get('sys:burnbin')!;
      const dropX = ev.clientX - r.left;
      const dropY = ev.clientY - r.top;
      const overBin =
        dropX >= binPos.col * CELL_W && dropX < (binPos.col + 1) * CELL_W && dropY >= binPos.row * CELL_H && dropY < (binPos.row + 1) * CELL_H;
      if (overBin && it.key !== 'sys:burnbin') {
        if (it.path) tryRecycle(it.path);
        else void messageBox({ title: 'Burn Bin', icon: 'warning', message: `'${it.label}' is a system item and can't be burned.` });
        return;
      }
      const col = Math.max(0, Math.round((dropX + (ox - (sx - r.left)) - 4) / CELL_W));
      const row = Math.max(0, Math.min(rows - 1, Math.round((dropY + (oy - (sy - r.top)) - 4) / CELL_H)));
      const occupied = [...layout.entries()].some(([k, v]) => k !== it.key && v.col === col && v.row === row);
      if (occupied) return;
      const next = { ...Object.fromEntries(layout), [it.key]: { col, row } };
      setPositions(next);
      savePositions(next);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (renaming) return;
    if (e.key === 'Delete') deleteSelected();
    if (e.key === 'Enter') items.filter((it) => selected.has(it.key)).forEach((it) => it.open());
    if (e.key === 'F2') {
      const it = items.find((x) => selected.has(x.key) && x.renamable);
      if (it) setRenaming(it.key);
    }
    if (e.key === 'a' && e.ctrlKey) {
      e.preventDefault();
      setSelected(new Set(items.map((i) => i.key)));
    }
  };

  return (
    <div
      className="desktop-icons"
      ref={areaRef}
      tabIndex={-1}
      onPointerDown={onAreaPointerDown}
      onPointerMove={onAreaPointerMove}
      onPointerUp={onAreaPointerUp}
      onContextMenu={desktopMenu}
      onKeyDown={onKeyDown}
    >
      {items.map((it) => {
        const p = layout.get(it.key)!;
        const isDrag = dragging?.key === it.key;
        const left = isDrag ? dragging.x + dragging.dx : p.col * CELL_W + 4;
        const top = isDrag ? dragging.y + dragging.dy : p.row * CELL_H + 4;
        return (
          <div
            key={it.key}
            className={`desk-icon${selected.has(it.key) ? ' selected' : ''}${isDrag ? ' dragging' : ''}`}
            style={{ left, top }}
            data-key={it.key}
            onPointerDown={(e) => startIconDrag(it, e)}
            onDoubleClick={() => it.open()}
            onContextMenu={(e) => {
              e.stopPropagation();
              setSelected(new Set([it.key]));
              openContextMenu(e, it.menu());
            }}
          >
            <Icon name={it.icon} size={32} />
            {renaming === it.key && it.path ? (
              <RenameBox
                initial={basename(it.path)}
                onDone={(name) => {
                  setRenaming(null);
                  if (name && name !== basename(it.path!)) {
                    try {
                      rename(it.path!, name);
                    } catch (e) {
                      void messageBox({ title: 'Error Renaming File', icon: 'error', message: e instanceof Error ? e.message : String(e) });
                    }
                  }
                }}
              />
            ) : (
              <span className="desk-label">{it.label}</span>
            )}
          </div>
        );
      })}
      {band && (
        <div
          className="select-band"
          style={{
            left: Math.min(band.x0, band.x1),
            top: Math.min(band.y0, band.y1),
            width: Math.abs(band.x1 - band.x0),
            height: Math.abs(band.y1 - band.y0),
          }}
        />
      )}
    </div>
  );
}

export function RenameBox({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const dot = initial.lastIndexOf('.');
    el.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial]);
  const done = (v: string | null) => {
    if (finished.current) return;
    finished.current = true;
    onDone(v);
  };
  return (
    <input
      ref={ref}
      className="rename-box"
      defaultValue={initial}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') done(e.currentTarget.value.trim());
        if (e.key === 'Escape') done(null);
      }}
      onBlur={(e) => done(e.currentTarget.value.trim())}
    />
  );
}


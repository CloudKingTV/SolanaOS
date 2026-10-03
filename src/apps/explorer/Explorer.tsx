import { useEffect, useState } from 'react';
import {
  DESKTOP_DIR,
  MY_DOCUMENTS,
  RECYCLER,
  displayName,
  list,
  mkdir,
  recycle,
  recycled,
  rename,
  stat,
  uniqueName,
  useVfs,
  writeFile,
  VfsError,
  type VNode,
} from '../../os/vfs';
import { basename, dirname, isWithin, join, keyOf, normalize, resolve } from '../../os/path';
import { openApp, setWindowArgs, setWindowTitle, closeWindow, type AppProps } from '../../os/windows';
import { openFolder, openPath } from '../../os/shellActions';
import { messageBox } from '../../os/dialogs';
import { Icon, type IconName } from '../../shell/icons';
import { MenuBar, openContextMenu, sep } from '../../shell/Menu';
import { FileView, type ViewMode } from '../../shell/FileView';

function folderTitle(path: string) {
  const p = normalize(path);
  if (keyOf(p) === keyOf('C:\\')) return 'Local Disk (C:)';
  return basename(p);
}

function folderIcon(path: string): IconName {
  const k = keyOf(path);
  if (k === keyOf(MY_DOCUMENTS)) return 'my-documents';
  if (k === keyOf(`${MY_DOCUMENTS}\\My Pictures`)) return 'my-pictures';
  if (k === keyOf('C:\\')) return 'computer';
  return 'folder-open';
}

export function Explorer({ windowId, args }: AppProps) {
  const path = normalize(String(args.path ?? MY_DOCUMENTS));
  const nodes = useVfs((s) => s.nodes);
  const [history, setHistory] = useState<{ stack: string[]; i: number }>({ stack: [path], i: 0 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>('tiles');
  const [address, setAddress] = useState(path);

  const folder = stat(path);
  const items = folder ? list(path, nodes).filter((n) => keyOf(n.path) !== keyOf(RECYCLER)) : [];
  const selectedNodes = items.filter((n) => selected.has(keyOf(n.path)));

  useEffect(() => {
    setWindowTitle(windowId, folderTitle(path));
    setAddress(path);
    setSelected(new Set());
  }, [path, windowId]);

  // If the folder disappears (deleted elsewhere), fall back to its nearest existing parent.
  useEffect(() => {
    if (folder) return;
    let p = dirname(path);
    while (!stat(p) && p.length > 3) p = dirname(p);
    setWindowArgs(windowId, { path: p });
  }, [folder, path, windowId]);

  const navigate = (to: string, push = true) => {
    const target = normalize(to);
    if (keyOf(target) === keyOf(RECYCLER)) {
      openApp('burnbin');
      return;
    }
    const n = stat(target);
    if (!n || n.type !== 'dir') {
      void messageBox({ title: folderTitle(path), icon: 'error', message: `SolanaOS cannot find '${target}'.`, owner: windowId });
      setAddress(path);
      return;
    }
    if (push) setHistory((h) => ({ stack: [...h.stack.slice(0, h.i + 1), n.path], i: h.i + 1 }));
    setWindowArgs(windowId, { path: n.path });
  };

  const back = () => {
    if (history.i <= 0) return;
    const i = history.i - 1;
    setHistory({ ...history, i });
    navigate(history.stack[i], false);
  };
  const forward = () => {
    if (history.i >= history.stack.length - 1) return;
    const i = history.i + 1;
    setHistory({ ...history, i });
    navigate(history.stack[i], false);
  };
  const up = () => path.length > 3 && navigate(dirname(path));

  const open = (n: VNode) => (n.type === 'dir' ? navigate(n.path) : openPath(n.path, windowId));

  const fail = (title: string, e: unknown) =>
    void messageBox({ title, icon: 'error', message: e instanceof VfsError ? e.message : String(e), owner: windowId });

  const deleteSelected = () => {
    for (const n of selectedNodes) {
      try {
        recycle(n.path);
      } catch (e) {
        fail('Error Deleting File or Folder', e);
      }
    }
    setSelected(new Set());
  };

  const newItem = (kind: 'folder' | 'text') => {
    try {
      const name = kind === 'folder' ? uniqueName(path, 'New Folder') : uniqueName(path, 'New Text Document', 'txt');
      const p = join(path, name);
      if (kind === 'folder') mkdir(p);
      else writeFile(p, '');
      setSelected(new Set([keyOf(p)]));
      setRenaming(keyOf(p));
    } catch (e) {
      fail('Error', e);
    }
  };

  const onRename = (n: VNode, name: string | null) => {
    setRenaming(null);
    if (!name || name === displayName(n)) return;
    try {
      const moved = rename(n.path, name);
      setSelected(new Set([keyOf(moved.path)]));
    } catch (e) {
      fail('Error Renaming File or Folder', e);
    }
  };

  const itemMenu = (n: VNode, e: React.MouseEvent) =>
    openContextMenu(e, [
      { label: 'Open', bold: true, onClick: () => open(n) },
      ...(n.type === 'dir' ? [{ label: 'Open in New Window', onClick: () => openApp('explorer', { path: n.path }) }] : []),
      sep,
      { label: 'Delete', onClick: deleteSelected },
      { label: 'Rename', onClick: () => setRenaming(keyOf(n.path)) },
    ]);

  const bgMenu = (e: React.MouseEvent) =>
    openContextMenu(e, [
      {
        label: 'View',
        submenu: [
          { label: 'Tiles', checked: mode === 'tiles', onClick: () => setMode('tiles') },
          { label: 'Icons', checked: mode === 'icons', onClick: () => setMode('icons') },
          { label: 'Details', checked: mode === 'details', onClick: () => setMode('details') },
        ],
      },
      sep,
      {
        label: 'New',
        submenu: [
          { label: 'Folder', icon: 'folder', onClick: () => newItem('folder') },
          { label: 'Text Document', icon: 'file-text', onClick: () => newItem('text') },
        ],
      },
    ]);

  const single = selectedNodes.length === 1 ? selectedNodes[0] : null;
  const binCount = recycled(nodes).length;
  const allPlaces: { label: string; icon: IconName; path: string }[] = [
    { label: 'My Documents', icon: 'my-documents', path: MY_DOCUMENTS },
    { label: 'Desktop', icon: 'display', path: DESKTOP_DIR },
    { label: 'Local Disk (C:)', icon: 'computer', path: 'C:\\' },
    { label: 'Burn Bin', icon: binCount ? 'burn-full' : 'burn-empty', path: RECYCLER },
  ];
  const places = allPlaces.filter((p) => keyOf(p.path) !== keyOf(path));

  return (
    <div className="explorer" onKeyDown={(e) => {
      if (renaming) return;
      if (e.key === 'Delete' && selectedNodes.length) deleteSelected();
      if (e.key === 'F2' && single) setRenaming(keyOf(single.path));
      if (e.key === 'Backspace' && (e.target as HTMLElement).tagName !== 'INPUT') up();
    }}>
      <MenuBar
        menus={[
          {
            label: 'File',
            items: [
              {
                label: 'New',
                submenu: [
                  { label: 'Folder', icon: 'folder', onClick: () => newItem('folder') },
                  { label: 'Text Document', icon: 'file-text', onClick: () => newItem('text') },
                ],
              },
              sep,
              { label: 'Delete', disabled: !selectedNodes.length, onClick: deleteSelected },
              { label: 'Rename', disabled: !single, onClick: () => single && setRenaming(keyOf(single.path)) },
              sep,
              { label: 'Close', onClick: () => closeWindow(windowId) },
            ],
          },
          {
            label: 'Edit',
            items: [{ label: 'Select All', shortcut: 'Ctrl+A', onClick: () => setSelected(new Set(items.map((i) => keyOf(i.path)))) }],
          },
          {
            label: 'View',
            items: [
              { label: 'Tiles', checked: mode === 'tiles', onClick: () => setMode('tiles') },
              { label: 'Icons', checked: mode === 'icons', onClick: () => setMode('icons') },
              { label: 'Details', checked: mode === 'details', onClick: () => setMode('details') },
            ],
          },
          { label: 'Help', items: [{ label: 'About SolanaOS', onClick: () => openApp('about') }] },
        ]}
      />
      <div className="toolbar">
        <button type="button" className="tool-btn" disabled={history.i <= 0} onClick={back} title="Back">
          <Icon name="back" size={22} />
          <span>Back</span>
        </button>
        <button type="button" className="tool-btn" disabled={history.i >= history.stack.length - 1} onClick={forward} title="Forward">
          <Icon name="forward" size={22} />
        </button>
        <button type="button" className="tool-btn" disabled={path.length <= 3} onClick={up} title="Up">
          <Icon name="up" size={22} />
        </button>
        <div className="tool-sep" />
        <button
          type="button"
          className="tool-btn"
          title="Views"
          onClick={() => setMode(mode === 'tiles' ? 'icons' : mode === 'icons' ? 'details' : 'tiles')}
        >
          <Icon name="display" size={22} />
          <span>Views</span>
        </button>
      </div>
      <form
        className="address-bar"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(resolve(path, address));
        }}
      >
        <span className="address-label">Address</span>
        <span className="address-input">
          <Icon name={folderIcon(path)} size={16} />
          <input value={address} onChange={(e) => setAddress(e.target.value)} aria-label="Address" />
        </span>
        <button type="submit" className="address-go">
          <Icon name="forward" size={16} /> Go
        </button>
      </form>
      <div className="explorer-main">
        <aside className="task-pane">
          <section className="tp-section">
            <h3>File and Folder Tasks</h3>
            <div className="tp-body">
              <button type="button" onClick={() => newItem('folder')}>
                <Icon name="folder" size={16} /> Make a new folder
              </button>
              <button type="button" onClick={() => newItem('text')}>
                <Icon name="file-text" size={16} /> Create a text document
              </button>
              {single && (
                <>
                  <button type="button" onClick={() => setRenaming(keyOf(single.path))}>
                    <Icon name="notepad" size={16} /> Rename this {single.type === 'dir' ? 'folder' : 'file'}
                  </button>
                  <button type="button" onClick={deleteSelected}>
                    <Icon name="burn-full" size={16} /> Burn this {single.type === 'dir' ? 'folder' : 'file'}
                  </button>
                </>
              )}
              {selectedNodes.length > 1 && (
                <button type="button" onClick={deleteSelected}>
                  <Icon name="burn-full" size={16} /> Burn the selected items
                </button>
              )}
            </div>
          </section>
          <section className="tp-section">
            <h3>Other Places</h3>
            <div className="tp-body">
              {places.map((p) => (
                <button key={p.path} type="button" onClick={() => (p.path === RECYCLER ? openFolder(RECYCLER) : navigate(p.path))}>
                  <Icon name={p.icon} size={16} /> {p.label}
                </button>
              ))}
            </div>
          </section>
          <section className="tp-section">
            <h3>Details</h3>
            <div className="tp-body tp-details">
              {single ? (
                <>
                  <b>{displayName(single)}</b>
                  <span>{single.type === 'dir' ? 'File Folder' : 'Text Document'}</span>
                  <span>Modified: {new Date(single.mtime).toLocaleString()}</span>
                </>
              ) : (
                <>
                  <b>{folderTitle(path)}</b>
                  <span>
                    {items.length} object{items.length === 1 ? '' : 's'}
                    {selectedNodes.length > 1 ? `, ${selectedNodes.length} selected` : ''}
                  </span>
                </>
              )}
            </div>
          </section>
        </aside>
        <FileView
          items={items}
          selected={selected}
          onSelect={setSelected}
          onOpen={open}
          onItemMenu={itemMenu}
          onBackgroundMenu={bgMenu}
          renaming={renaming}
          onRename={onRename}
          mode={mode}
          emptyText="This folder is empty."
        />
      </div>
      <div className="status-bar">
        <span>
          {selectedNodes.length ? `${selectedNodes.length} object(s) selected` : `${items.length} object(s)`}
        </span>
        <span>{isWithin(path, MY_DOCUMENTS) ? 'My Documents' : 'Local Disk (C:)'}</span>
      </div>
    </div>
  );
}


import { useState } from 'react';
import { recycled, restore, removeForever, useVfs, displayName, VfsError, type VNode } from '../../os/vfs';
import { dirname, keyOf } from '../../os/path';
import { closeWindow, type AppProps } from '../../os/windows';
import { messageBox } from '../../os/dialogs';
import { Icon } from '../../shell/icons';
import { MenuBar, openContextMenu, sep } from '../../shell/Menu';
import { FileView } from '../../shell/FileView';
import { emptyBurnBin } from './actions';
import { TokenBin, useTokenBinItems } from './TokenBin';

export function BurnBin({ windowId, args }: AppProps) {
  const nodes = useVfs((s) => s.nodes);
  const tokenItems = useTokenBinItems();
  const [view, setView] = useState<'files' | 'tokens'>(args.view === 'files' ? 'files' : args.view === 'tokens' || tokenItems.length ? 'tokens' : 'files');
  const items = recycled(nodes);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const sel = items.filter((n) => selected.has(keyOf(n.path)));

  const fail = (e: unknown) =>
    void messageBox({ title: 'Burn Bin', icon: 'error', message: e instanceof VfsError ? e.message : String(e), owner: windowId });

  const restoreSel = (list: VNode[] = sel) => {
    for (const n of list) {
      try {
        restore(n.path);
      } catch (e) {
        fail(e);
      }
    }
    setSelected(new Set());
  };

  const burnSel = async () => {
    if (!sel.length) return;
    const answer = await messageBox({
      title: 'Confirm File Delete',
      icon: 'warning',
      message:
        sel.length === 1
          ? `Are you sure you want to permanently burn '${displayName(sel[0])}'?`
          : `Are you sure you want to permanently burn these ${sel.length} items?`,
      buttons: ['Yes', 'No'],
      owner: windowId,
    });
    if (answer !== 'Yes') return;
    for (const n of sel) removeForever(n.path);
    setSelected(new Set());
  };

  return (
    <div className="explorer">
      <MenuBar
        menus={[
          {
            label: 'File',
            items: [
              { label: 'Empty Burn Bin', disabled: !items.length, onClick: () => void emptyBurnBin(windowId) },
              { label: 'Restore', disabled: !sel.length, onClick: () => restoreSel() },
              { label: 'Burn Permanently', disabled: !sel.length, onClick: () => void burnSel() },
              sep,
              { label: 'Close', onClick: () => closeWindow(windowId) },
            ],
          },
          {
            label: 'Edit',
            items: [{ label: 'Select All', onClick: () => setSelected(new Set(items.map((i) => keyOf(i.path)))) }],
          },
        ]}
      />
      <div className="explorer-main">
        <aside className="task-pane">
          <section className="tp-section">
            <h3>File Tasks</h3>
            <div className="tp-body">
              <button type="button" disabled={!items.length} onClick={() => void emptyBurnBin(windowId)}>
                <Icon name="burn-full" size={16} /> Empty the Burn Bin
              </button>
              <button type="button" disabled={!items.length} onClick={() => restoreSel(sel.length ? sel : items)}>
                <Icon name="back" size={16} /> {sel.length ? 'Restore the selected items' : 'Restore all items'}
              </button>
            </div>
          </section>
          <section className="tp-section">
            <h3>View</h3>
            <div className="tp-body">
              <button type="button" className={view === 'tokens' ? 'active' : ''} onClick={() => setView('tokens')}>
                <Icon name="coin" size={16} /> Token accounts ({tokenItems.length})
              </button>
              <button type="button" className={view === 'files' ? 'active' : ''} onClick={() => setView('files')}>
                <Icon name="file-text" size={16} /> Files ({items.length})
              </button>
            </div>
          </section>
        </aside>
        {view === 'tokens' ? (
          <TokenBin windowId={windowId} />
        ) : (
        <FileView
          items={items}
          selected={selected}
          onSelect={setSelected}
          onOpen={(n) => restoreSel([n])}
          onItemMenu={(_n, e) =>
            openContextMenu(e, [
              { label: 'Restore', bold: true, onClick: () => restoreSel() },
              sep,
              { label: 'Burn Permanently', onClick: () => void burnSel() },
            ])
          }
          onBackgroundMenu={(e) =>
            openContextMenu(e, [{ label: 'Empty Burn Bin', disabled: !items.length, onClick: () => void emptyBurnBin(windowId) }])
          }
          mode="details"
          extraColumns={[{ label: 'Original Location', value: (n) => (n.origPath ? dirname(n.origPath) : '') }]}
          emptyText="The Burn Bin is empty."
        />
        )}
      </div>
      <div className="status-bar">
        <span>{view === 'tokens' ? `${tokenItems.length} token account(s)` : `${items.length} object(s)`}</span>
      </div>
    </div>
  );
}

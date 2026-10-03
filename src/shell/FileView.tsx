import { useState } from 'react';
import type { VNode } from '../os/vfs';
import { displayName, formatSize, sizeOf } from '../os/vfs';
import { extname, keyOf } from '../os/path';
import { Icon, type IconName } from './icons';
import { RenameBox } from './Desktop';

export type ViewMode = 'tiles' | 'icons' | 'details';

export function iconFor(n: VNode): IconName {
  if (n.type === 'dir') return /my pictures$/i.test(n.path) ? 'my-pictures' : 'folder';
  const ext = extname(displayName(n));
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image';
  return ext === 'txt' || ext === 'md' || ext === 'log' ? 'file-text' : 'file';
}

export function typeName(n: VNode): string {
  if (n.type === 'dir') return 'File Folder';
  const ext = extname(displayName(n));
  if (ext === 'txt') return 'Text Document';
  if (ext === 'png') return 'PNG Image';
  return ext ? `${ext.toUpperCase()} File` : 'File';
}

const fmtDate = (t: number) =>
  new Date(t).toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

interface Props {
  items: VNode[];
  selected: Set<string>;
  onSelect: (keys: Set<string>) => void;
  onOpen: (n: VNode) => void;
  onItemMenu?: (n: VNode, e: React.MouseEvent) => void;
  onBackgroundMenu?: (e: React.MouseEvent) => void;
  renaming?: string | null;
  onRename?: (n: VNode, name: string | null) => void;
  mode?: ViewMode;
  /** Extra columns for the details view (e.g. "Original Location" in the Burn Bin). */
  extraColumns?: { label: string; value: (n: VNode) => string }[];
  emptyText?: string;
}

export function FileView({
  items,
  selected,
  onSelect,
  onOpen,
  onItemMenu,
  onBackgroundMenu,
  renaming,
  onRename,
  mode = 'tiles',
  extraColumns = [],
  emptyText,
}: Props) {
  const [anchor, setAnchor] = useState<string | null>(null);

  const click = (n: VNode, e: React.MouseEvent) => {
    e.stopPropagation();
    const k = keyOf(n.path);
    if (e.ctrlKey || e.metaKey) {
      const s = new Set(selected);
      if (s.has(k)) s.delete(k);
      else s.add(k);
      onSelect(s);
      setAnchor(k);
    } else if (e.shiftKey && anchor) {
      const keys = items.map((i) => keyOf(i.path));
      const [a, b] = [keys.indexOf(anchor), keys.indexOf(k)].sort((x, y) => x - y);
      onSelect(new Set(keys.slice(a, b + 1)));
    } else {
      onSelect(new Set([k]));
      setAnchor(k);
    }
  };

  const keyNav = (e: React.KeyboardEvent) => {
    if (renaming) return;
    const keys = items.map((i) => keyOf(i.path));
    const cur = keys.findIndex((k) => selected.has(k));
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      const k = keys[Math.min(keys.length - 1, cur + 1)];
      if (k) onSelect(new Set([k]));
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const k = keys[Math.max(0, cur - 1)];
      if (k) onSelect(new Set([k]));
    } else if (e.key === 'Enter' && cur >= 0) {
      onOpen(items[cur]);
    } else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSelect(new Set(keys));
    }
  };

  const label = (n: VNode) =>
    renaming === keyOf(n.path) && onRename ? (
      <RenameBox initial={displayName(n)} onDone={(name) => onRename(n, name)} />
    ) : (
      <span className="fv-name">{displayName(n)}</span>
    );

  const itemProps = (n: VNode) => ({
    className: `fv-item${selected.has(keyOf(n.path)) ? ' selected' : ''}`,
    onClick: (e: React.MouseEvent) => click(n, e),
    onDoubleClick: () => onOpen(n),
    onContextMenu: (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!selected.has(keyOf(n.path))) onSelect(new Set([keyOf(n.path)]));
      onItemMenu?.(n, e);
    },
  });

  return (
    <div
      className={`file-view fv-${mode}`}
      tabIndex={0}
      onKeyDown={keyNav}
      onClick={() => onSelect(new Set())}
      onContextMenu={(e) => {
        onSelect(new Set());
        onBackgroundMenu?.(e);
      }}
    >
      {items.length === 0 && emptyText && <div className="fv-empty">{emptyText}</div>}
      {mode === 'details' ? (
        <table className="fv-table">
          <thead>
            <tr>
              <th>Name</th>
              {extraColumns.map((c) => (
                <th key={c.label}>{c.label}</th>
              ))}
              <th className="num">Size</th>
              <th>Type</th>
              <th>Date Modified</th>
            </tr>
          </thead>
          <tbody>
            {items.map((n) => (
              <tr key={n.path} {...itemProps(n)}>
                <td>
                  <Icon name={iconFor(n)} size={16} />
                  {label(n)}
                </td>
                {extraColumns.map((c) => (
                  <td key={c.label}>{c.value(n)}</td>
                ))}
                <td className="num">{n.type === 'file' ? formatSize(sizeOf(n)) : ''}</td>
                <td>{typeName(n)}</td>
                <td>{fmtDate(n.deletedAt ?? n.mtime)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        items.map((n) => (
          <div key={n.path} {...itemProps(n)}>
            <Icon name={iconFor(n)} size={mode === 'tiles' ? 48 : 32} />
            <div className="fv-text">
              {label(n)}
              {mode === 'tiles' && (
                <>
                  <span className="fv-meta">{typeName(n)}</span>
                  {n.type === 'file' && <span className="fv-meta">{formatSize(sizeOf(n))}</span>}
                </>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

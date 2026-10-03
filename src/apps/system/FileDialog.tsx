import { useEffect, useState } from 'react';
import { DESKTOP_DIR, MY_DOCUMENTS, RECYCLER, displayName, exists, list, stat, useVfs, type VNode } from '../../os/vfs';
import { basename, dirname, extname, keyOf, normalize, resolve } from '../../os/path';
import { closeWindow, setCloseGuard, setWindowTitle, type AppProps } from '../../os/windows';
import { messageBox, type FileDialogOptions } from '../../os/dialogs';
import { Icon, type IconName } from '../../shell/icons';
import { FileView } from '../../shell/FileView';

export function FileDialog({ windowId, args }: AppProps) {
  const opts = args as unknown as FileDialogOptions & { resolve: (p: string | null) => void };
  const nodes = useVfs((s) => s.nodes);
  const [dir, setDir] = useState(() => normalize(opts.initialDir && stat(opts.initialDir) ? opts.initialDir : MY_DOCUMENTS));
  const [name, setName] = useState(opts.initialName ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const ext = opts.extension;

  useEffect(() => {
    setWindowTitle(windowId, opts.title ?? (opts.mode === 'save' ? 'Save As' : 'Open'));
    setCloseGuard(windowId, () => {
      opts.resolve(null);
      return true;
    });
  }, [windowId, opts]);

  const items = list(dir, nodes).filter(
    (n) => keyOf(n.path) !== keyOf(RECYCLER) && (n.type === 'dir' || !ext || extname(n.path) === ext),
  );

  const finish = (p: string | null) => {
    setCloseGuard(windowId, null);
    opts.resolve(p);
    closeWindow(windowId);
  };

  const submit = async () => {
    let n = name.trim();
    if (!n) return;
    const target = resolve(dir, n);
    const node = stat(target);
    if (node?.type === 'dir') {
      setDir(node.path);
      setName('');
      return;
    }
    if (opts.mode === 'open') {
      if (!node) {
        await messageBox({ title: 'Open', icon: 'warning', message: `${basename(target)}\nFile not found.\nPlease verify the correct file name was given.`, owner: windowId });
        return;
      }
      finish(node.path);
      return;
    }
    // Save: add the default extension, confirm overwrite.
    if (ext && !extname(n)) n = `${n}.${ext}`;
    const savePath = resolve(dir, n);
    if (!exists(dirname(savePath))) {
      await messageBox({ title: 'Save As', icon: 'warning', message: `The folder '${dirname(savePath)}' does not exist.`, owner: windowId });
      return;
    }
    if (exists(savePath)) {
      const a = await messageBox({
        title: 'Confirm Save As',
        icon: 'warning',
        message: `${basename(savePath)} already exists.\nDo you want to replace it?`,
        buttons: ['Yes', 'No'],
        owner: windowId,
      });
      if (a !== 'Yes') return;
    }
    finish(savePath);
  };

  const open = (n: VNode) => {
    if (n.type === 'dir') {
      setDir(n.path);
      setSelected(new Set());
    } else {
      setName(displayName(n));
      finish(n.path);
    }
  };

  const places: { label: string; icon: IconName; path: string }[] = [
    { label: 'Desktop', icon: 'display', path: DESKTOP_DIR },
    { label: 'My Documents', icon: 'my-documents', path: MY_DOCUMENTS },
    { label: 'Local Disk (C:)', icon: 'computer', path: 'C:\\' },
  ];

  return (
    <form
      className="file-dialog"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="fd-top">
        <label>
          {opts.mode === 'save' ? 'Save in:' : 'Look in:'}
          <span className="fd-lookin">
            <Icon name="folder-open" size={16} />
            {dir.length <= 3 ? 'Local Disk (C:)' : basename(dir)}
          </span>
        </label>
        <button type="button" className="tool-btn small" disabled={dir.length <= 3} onClick={() => setDir(dirname(dir))} title="Up One Level">
          <Icon name="up" size={18} />
        </button>
      </div>
      <div className="fd-main">
        <div className="fd-places">
          {places.map((p) => (
            <button key={p.path} type="button" className={keyOf(dir) === keyOf(p.path) ? 'active' : ''} onClick={() => setDir(p.path)}>
              <Icon name={p.icon} size={32} />
              <span>{p.label}</span>
            </button>
          ))}
        </div>
        <FileView
          items={items}
          selected={selected}
          onSelect={(s) => {
            setSelected(s);
            const n = items.find((i) => s.has(keyOf(i.path)));
            if (n && n.type === 'file') setName(displayName(n));
          }}
          onOpen={open}
          mode="icons"
        />
      </div>
      <div className="fd-fields">
        <label>
          <span>File name:</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" className="btn">
          {opts.mode === 'save' ? 'Save' : 'Open'}
        </button>
        <label>
          <span>Files of type:</span>
          <select disabled>
            <option>{ext ? `Text Documents (*.${ext})` : 'All Files (*.*)'}</option>
          </select>
        </label>
        <button type="button" className="btn" onClick={() => finish(null)}>
          Cancel
        </button>
      </div>
    </form>
  );
}


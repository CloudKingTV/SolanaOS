import { useEffect, useState } from 'react';
import { openApp, setWindowTitle, type AppProps } from '../../os/windows';
import { list, readFile, stat, useVfs } from '../../os/vfs';
import { basename, dirname, extname, keyOf } from '../../os/path';
import { Icon } from '../../shell/icons';

export interface PictureItem {
  src: string;
  title: string;
  /** VFS path, when the picture is a local file. */
  path?: string;
  /** Token mint or asset address, when the picture is a collectible. */
  address?: string;
}

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
export const isImagePath = (p: string) => IMAGE_EXT.has(extname(p));

function localItems(path: string): PictureItem[] {
  return list(dirname(path))
    .filter((n) => n.type === 'file' && isImagePath(n.path))
    .map((n) => ({ src: n.content ?? '', title: basename(n.path), path: n.path }));
}

export function PictureViewer({ windowId, args }: AppProps) {
  useVfs((s) => s.nodes); // re-render when files change
  const items: PictureItem[] = Array.isArray(args.items)
    ? (args.items as PictureItem[])
    : typeof args.path === 'string' && stat(args.path)
      ? localItems(args.path)
      : [];
  const startIndex =
    typeof args.index === 'number'
      ? args.index
      : typeof args.path === 'string'
        ? Math.max(0, items.findIndex((i) => i.path && keyOf(i.path) === keyOf(args.path as string)))
        : 0;
  const [index, setIndex] = useState(startIndex);
  const [fit, setFit] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [show, setShow] = useState(false);
  const [broken, setBroken] = useState(false);

  useEffect(() => setIndex(startIndex), [startIndex]);
  const item = items[Math.min(index, items.length - 1)];

  useEffect(() => {
    setWindowTitle(windowId, `${item?.title ?? 'No picture'} - Picture Viewer`);
    setBroken(false);
    setRotation(0);
  }, [item?.title, item?.src, windowId]);

  useEffect(() => {
    if (!show || items.length < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % items.length), 3500);
    return () => clearInterval(t);
  }, [show, items.length]);

  const prev = () => setIndex((i) => (i - 1 + items.length) % items.length);
  const next = () => setIndex((i) => (i + 1) % items.length);

  return (
    <div
      className={`picture-viewer${show ? ' slideshow' : ''}`}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') prev();
        if (e.key === 'ArrowRight' || e.key === ' ') next();
        if (e.key === 'Escape') setShow(false);
        if (e.key === 'F11') {
          e.preventDefault();
          setShow((s) => !s);
        }
      }}
      onClick={() => show && setShow(false)}
    >
      <div className="pv-stage">
        {!item ? (
          <div className="fv-empty">No pictures to show.</div>
        ) : broken ? (
          <div className="fv-empty">
            <Icon name="image" size={48} />
            <p>This picture couldn't be loaded. Its host may be offline.</p>
          </div>
        ) : (
          <img
            src={item.path ? (readFileSafe(item.path) ?? item.src) : item.src}
            alt={item.title}
            className={fit ? 'fit' : 'actual'}
            style={{ transform: `rotate(${rotation}deg)` }}
            referrerPolicy="no-referrer"
            draggable={false}
            onError={() => setBroken(true)}
          />
        )}
      </div>
      {!show && (
        <div className="pv-toolbar">
          <button type="button" className="tool-btn" title="Previous Image (Left Arrow)" disabled={items.length < 2} onClick={prev}>
            <Icon name="back" size={20} />
          </button>
          <button type="button" className="tool-btn" title="Next Image (Right Arrow)" disabled={items.length < 2} onClick={next}>
            <Icon name="forward" size={20} />
          </button>
          <span className="tool-sep" />
          <button type="button" className={`tool-btn${fit ? ' on' : ''}`} title="Best Fit" onClick={() => setFit(true)}>
            ⤢
          </button>
          <button type="button" className={`tool-btn${!fit ? ' on' : ''}`} title="Actual Size" onClick={() => setFit(false)}>
            1:1
          </button>
          <button type="button" className="tool-btn" title="Start Slide Show (F11)" disabled={!items.length} onClick={(e) => { e.stopPropagation(); setShow(true); }}>
            <Icon name="display" size={20} />
          </button>
          <span className="tool-sep" />
          <button type="button" className="tool-btn" title="Rotate Clockwise" onClick={() => setRotation((r) => r + 90)}>
            ↻
          </button>
          <button type="button" className="tool-btn" title="Rotate Counterclockwise" onClick={() => setRotation((r) => r - 90)}>
            ↺
          </button>
          {item?.path && (
            <>
              <span className="tool-sep" />
              <button type="button" className="tool-btn" title="Edit in Paint" onClick={() => openApp('paint', { path: item.path })}>
                <Icon name="paint" size={20} />
              </button>
            </>
          )}
          {item?.address && (
            <>
              <span className="tool-sep" />
              <button type="button" className="tool-btn" title="View in Solana Explorer" onClick={() => openApp('solexplorer', { url: `sol://address/${item.address}` })}>
                <Icon name="explorer-web" size={20} />
              </button>
            </>
          )}
          <span className="pv-count">{items.length ? `${index + 1} of ${items.length}` : ''}</span>
        </div>
      )}
    </div>
  );
}

function readFileSafe(path: string): string | null {
  try {
    return readFile(path);
  } catch {
    return null;
  }
}

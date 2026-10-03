import { useCallback, useEffect, useRef, useState } from 'react';
import { openApp, requestClose, setCloseGuard, setWindowTitle, type AppProps } from '../../os/windows';
import { readFile, writeFile, MY_DOCUMENTS, VfsError } from '../../os/vfs';
import { basename, dirname } from '../../os/path';
import { fileDialog, messageBox } from '../../os/dialogs';
import { MenuBar, sep } from '../../shell/Menu';
import { useWallet } from '../../os/wallet/standard';
import { PALETTE, floodFill, getPixel, hexToRgba, linePoints, rgbaToHex } from './raster';

type Tool = 'pencil' | 'brush' | 'airbrush' | 'eraser' | 'fill' | 'picker' | 'line' | 'rect' | 'ellipse';
type FillMode = 'outline' | 'both' | 'fill';

const TOOLS: { id: Tool; label: string; glyph: string }[] = [
  { id: 'pencil', label: 'Pencil', glyph: '✎' },
  { id: 'brush', label: 'Brush', glyph: '🖌' },
  { id: 'airbrush', label: 'Airbrush', glyph: '✺' },
  { id: 'eraser', label: 'Eraser', glyph: '▭' },
  { id: 'fill', label: 'Fill With Color', glyph: '◧' },
  { id: 'picker', label: 'Pick Color', glyph: '⌖' },
  { id: 'line', label: 'Line', glyph: '╱' },
  { id: 'rect', label: 'Rectangle', glyph: '□' },
  { id: 'ellipse', label: 'Ellipse', glyph: '◯' },
];

export const MY_PICTURES = `${MY_DOCUMENTS}\\My Pictures`;
const DEFAULT_SIZE = 256;

export function Paint({ windowId, args }: AppProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>('pencil');
  const [fg, setFg] = useState('#000000');
  const [bg, setBg] = useState('#ffffff');
  const [size, setSize] = useState(3);
  const [fillMode, setFillMode] = useState<FillMode>('outline');
  const [zoom, setZoom] = useState(2);
  const [dims, setDims] = useState({ w: DEFAULT_SIZE, h: DEFAULT_SIZE });
  const [path, setPath] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [cursor, setCursor] = useState<string>('');
  const undo = useRef<ImageData[]>([]);
  const redo = useRef<ImageData[]>([]);
  const stroke = useRef<{ x: number; y: number; sx: number; sy: number; color: string; button: number } | null>(null);
  const walletConnected = useWallet((s) => !!s.connection);

  const ctx = () => canvasRef.current!.getContext('2d', { willReadFrequently: true })!;

  const clear = useCallback((w: number, h: number) => {
    const c = canvasRef.current!;
    c.width = w;
    c.height = h;
    overlayRef.current!.width = w;
    overlayRef.current!.height = h;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    setDims({ w, h });
    undo.current = [];
    redo.current = [];
  }, []);

  const loadDataUrl = useCallback(
    (url: string) =>
      new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          clear(img.width, img.height);
          ctx().drawImage(img, 0, 0);
          resolve();
        };
        img.onerror = () => reject(new Error('That file is not a picture SolanaOS can open.'));
        img.src = url;
      }),
    [clear],
  );

  useEffect(() => {
    clear(DEFAULT_SIZE, DEFAULT_SIZE);
  }, [clear]);

  useEffect(() => {
    if (typeof args.path !== 'string') return;
    const p = args.path;
    try {
      void loadDataUrl(readFile(p))
        .then(() => {
          setPath(p);
          setDirty(false);
        })
        .catch((e: Error) => void messageBox({ title: 'Paint', icon: 'error', message: e.message, owner: windowId }));
    } catch (e) {
      void messageBox({ title: 'Paint', icon: 'error', message: e instanceof Error ? e.message : String(e), owner: windowId });
    }
  }, [args.path, loadDataUrl, windowId]);

  useEffect(() => {
    setWindowTitle(windowId, `${path ? basename(path) : 'untitled'} - Paint`);
  }, [path, windowId]);

  const snapshot = () => {
    undo.current.push(ctx().getImageData(0, 0, dims.w, dims.h));
    if (undo.current.length > 30) undo.current.shift();
    redo.current = [];
    setDirty(true);
  };

  const doUndo = () => {
    const prev = undo.current.pop();
    if (!prev) return;
    redo.current.push(ctx().getImageData(0, 0, dims.w, dims.h));
    ctx().putImageData(prev, 0, 0);
  };
  const doRedo = () => {
    const next = redo.current.pop();
    if (!next) return;
    undo.current.push(ctx().getImageData(0, 0, dims.w, dims.h));
    ctx().putImageData(next, 0, 0);
  };

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.floor(((e.clientX - r.left) / r.width) * dims.w),
      y: Math.floor(((e.clientY - r.top) / r.height) * dims.h),
    };
  };

  const dab = (g: CanvasRenderingContext2D, x: number, y: number, color: string, t: Tool) => {
    g.fillStyle = color;
    if (t === 'pencil') g.fillRect(x, y, 1, 1);
    else if (t === 'eraser') g.fillRect(x - size, y - size, size * 2 + 1, size * 2 + 1);
    else if (t === 'brush') {
      g.beginPath();
      g.arc(x + 0.5, y + 0.5, size, 0, Math.PI * 2);
      g.fill();
    } else if (t === 'airbrush') {
      const r = size * 3;
      for (let i = 0; i < r * 2; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * r;
        g.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d), 1, 1);
      }
    }
  };

  const drawShape = (g: CanvasRenderingContext2D, t: Tool, x0: number, y0: number, x1: number, y1: number, color: string, other: string) => {
    g.lineWidth = t === 'line' ? size : Math.max(1, Math.round(size / 2));
    g.strokeStyle = color;
    g.fillStyle = other;
    g.lineCap = 'round';
    g.beginPath();
    if (t === 'line') {
      g.moveTo(x0 + 0.5, y0 + 0.5);
      g.lineTo(x1 + 0.5, y1 + 0.5);
      g.stroke();
      return;
    }
    const x = Math.min(x0, x1) + 0.5;
    const y = Math.min(y0, y1) + 0.5;
    const w = Math.abs(x1 - x0);
    const h = Math.abs(y1 - y0);
    if (t === 'rect') g.rect(x, y, w, h);
    else g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    if (fillMode !== 'outline') {
      g.fillStyle = fillMode === 'fill' ? color : other;
      g.fill();
    }
    if (fillMode !== 'fill') g.stroke();
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    const { x, y } = pos(e);
    const color = tool === 'eraser' ? bg : e.button === 2 ? bg : fg;
    if (tool === 'picker') {
      const hex = rgbaToHex(getPixel(ctx().getImageData(0, 0, dims.w, dims.h), x, y));
      if (e.button === 2) setBg(hex);
      else setFg(hex);
      return;
    }
    snapshot();
    if (tool === 'fill') {
      const img = ctx().getImageData(0, 0, dims.w, dims.h);
      floodFill(img, x, y, hexToRgba(color));
      ctx().putImageData(img, 0, 0);
      return;
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    stroke.current = { x, y, sx: x, sy: y, color, button: e.button };
    if (['pencil', 'brush', 'airbrush', 'eraser'].includes(tool)) dab(ctx(), x, y, color, tool);
  };

  const onMove = (e: React.PointerEvent) => {
    const { x, y } = pos(e);
    setCursor(x >= 0 && y >= 0 && x < dims.w && y < dims.h ? `${x},${y}` : '');
    const s = stroke.current;
    if (!s) return;
    if (['pencil', 'brush', 'airbrush', 'eraser'].includes(tool)) {
      const g = ctx();
      if (tool === 'airbrush') dab(g, x, y, s.color, tool);
      else for (const [px, py] of linePoints(s.x, s.y, x, y)) dab(g, px, py, s.color, tool);
      s.x = x;
      s.y = y;
    } else {
      const o = overlayRef.current!.getContext('2d')!;
      o.clearRect(0, 0, dims.w, dims.h);
      drawShape(o, tool, s.sx, s.sy, x, y, s.color, s.button === 2 ? fg : bg);
    }
  };

  const onUp = (e: React.PointerEvent) => {
    const s = stroke.current;
    if (!s) return;
    stroke.current = null;
    if (['line', 'rect', 'ellipse'].includes(tool)) {
      const { x, y } = pos(e);
      overlayRef.current!.getContext('2d')!.clearRect(0, 0, dims.w, dims.h);
      drawShape(ctx(), tool, s.sx, s.sy, x, y, s.color, s.button === 2 ? fg : bg);
    }
  };

  const dataUrl = () => canvasRef.current!.toDataURL('image/png');

  const saveTo = (p: string) => {
    try {
      writeFile(p, dataUrl());
      setPath(p);
      setDirty(false);
      return true;
    } catch (e) {
      void messageBox({ title: 'Paint', icon: 'error', message: e instanceof VfsError ? e.message : String(e), owner: windowId });
      return false;
    }
  };
  const saveAs = async () => {
    const p = await fileDialog({ mode: 'save', owner: windowId, initialDir: path ? dirname(path) : MY_PICTURES, initialName: path ? basename(path) : 'untitled.png', extension: 'png' });
    return p ? saveTo(p) : false;
  };
  const save = async () => (path ? saveTo(path) : saveAs());

  const confirmDiscard = useCallback(async () => {
    if (!dirty) return true;
    const a = await messageBox({
      title: 'Paint',
      icon: 'warning',
      message: `Save changes to ${path ? basename(path) : 'untitled'}?`,
      buttons: ['Yes', 'No', 'Cancel'],
      owner: windowId,
    });
    if (a === 'Cancel') return false;
    if (a === 'Yes') return save();
    return true;
    // `save` changes every render; dirty/path cover what matters here.
  }, [dirty, path, windowId]);

  useEffect(() => {
    setCloseGuard(windowId, confirmDiscard);
  }, [windowId, confirmDiscard]);

  const newImage = async () => {
    if (!(await confirmDiscard())) return;
    clear(DEFAULT_SIZE, DEFAULT_SIZE);
    setPath(null);
    setDirty(false);
  };

  const open = async () => {
    if (!(await confirmDiscard())) return;
    const p = await fileDialog({ mode: 'open', owner: windowId, initialDir: MY_PICTURES, extension: 'png' });
    if (!p) return;
    try {
      await loadDataUrl(readFile(p));
      setPath(p);
      setDirty(false);
    } catch (e) {
      void messageBox({ title: 'Paint', icon: 'error', message: e instanceof Error ? e.message : String(e), owner: windowId });
    }
  };

  const transform = (fn: (img: ImageData) => ImageData) => {
    snapshot();
    ctx().putImageData(fn(ctx().getImageData(0, 0, dims.w, dims.h)), 0, 0);
  };
  const invert = () =>
    transform((img) => {
      for (let i = 0; i < img.data.length; i += 4) {
        img.data[i] = 255 - img.data[i];
        img.data[i + 1] = 255 - img.data[i + 1];
        img.data[i + 2] = 255 - img.data[i + 2];
      }
      return img;
    });
  const flipH = () =>
    transform((img) => {
      const out = new ImageData(img.width, img.height);
      for (let y = 0; y < img.height; y++)
        for (let x = 0; x < img.width; x++) {
          const s = (y * img.width + x) * 4;
          const d = (y * img.width + (img.width - 1 - x)) * 4;
          out.data.set(img.data.subarray(s, s + 4), d);
        }
      return out;
    });

  const mint = () => openApp('mint', { dataUrl: dataUrl(), name: path ? basename(path).replace(/\.png$/i, '') : 'Untitled' });

  return (
    <div className="paint" onKeyDown={(e) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); }
      else if (e.ctrlKey && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); }
      else if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); }
    }} tabIndex={-1}>
      <MenuBar
        menus={[
          {
            label: 'File',
            items: [
              { label: 'New', shortcut: 'Ctrl+N', onClick: () => void newImage() },
              { label: 'Open...', onClick: () => void open() },
              { label: 'Save', shortcut: 'Ctrl+S', onClick: () => void save() },
              { label: 'Save As...', onClick: () => void saveAs() },
              sep,
              { label: 'Mint as NFT...', bold: true, onClick: mint, disabled: !walletConnected },
              sep,
              { label: 'Exit', onClick: () => void requestClose(windowId) },
            ],
          },
          {
            label: 'Edit',
            items: [
              { label: 'Undo', shortcut: 'Ctrl+Z', onClick: doUndo },
              { label: 'Redo', shortcut: 'Ctrl+Y', onClick: doRedo },
              sep,
              {
                label: 'Clear Image',
                onClick: () => {
                  snapshot();
                  const g = ctx();
                  g.fillStyle = bg;
                  g.fillRect(0, 0, dims.w, dims.h);
                },
              },
            ],
          },
          {
            label: 'View',
            items: [1, 2, 3, 4].map((z) => ({ label: `Zoom ${z * 100}%`, checked: zoom === z, onClick: () => setZoom(z) })),
          },
          {
            label: 'Image',
            items: [
              { label: 'Flip Horizontal', onClick: flipH },
              { label: 'Invert Colors', onClick: invert },
              sep,
              ...[
                [128, 128],
                [256, 256],
                [512, 512],
              ].map(([w, h]) => ({
                label: `New ${w} × ${h} canvas`,
                onClick: async () => {
                  if (!(await confirmDiscard())) return;
                  clear(w, h);
                  setPath(null);
                  setDirty(false);
                },
              })),
            ],
          },
          { label: 'Help', items: [{ label: 'About SolanaOS', onClick: () => openApp('about') }] },
        ]}
      />
      <div className="paint-main">
        <div className="paint-tools">
          <div className="paint-toolgrid">
            {TOOLS.map((t) => (
              <button key={t.id} type="button" title={t.label} aria-label={t.label} className={`paint-tool${tool === t.id ? ' active' : ''}`} onClick={() => setTool(t.id)}>
                {t.glyph}
              </button>
            ))}
          </div>
          <div className="paint-options">
            {['line', 'rect', 'ellipse'].includes(tool) && tool !== 'line' ? (
              (['outline', 'both', 'fill'] as FillMode[]).map((m) => (
                <button key={m} type="button" className={`paint-opt${fillMode === m ? ' active' : ''}`} onClick={() => setFillMode(m)} title={m}>
                  <span className={`shape-${m}`} />
                </button>
              ))
            ) : tool === 'pencil' || tool === 'fill' || tool === 'picker' ? null : (
              [1, 2, 3, 5].map((s) => (
                <button key={s} type="button" className={`paint-opt${size === s ? ' active' : ''}`} onClick={() => setSize(s)} title={`Size ${s}`}>
                  <span className="dot" style={{ width: s * 2 + 1, height: s * 2 + 1 }} />
                </button>
              ))
            )}
          </div>
        </div>
        <div className="paint-canvas-area">
          <div className="paint-stack" style={{ width: dims.w * zoom, height: dims.h * zoom }}>
            <canvas
              ref={canvasRef}
              className="paint-canvas"
              style={{ width: dims.w * zoom, height: dims.h * zoom }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={() => setCursor('')}
              onContextMenu={(e) => e.preventDefault()}
              data-tool={tool}
            />
            <canvas ref={overlayRef} className="paint-overlay" style={{ width: dims.w * zoom, height: dims.h * zoom }} />
          </div>
        </div>
      </div>
      <div className="paint-palette">
        <div className="paint-current" title="Left click picks the foreground color; right click picks the background">
          <span className="bgc" style={{ background: bg }} />
          <span className="fgc" style={{ background: fg }} />
        </div>
        <div className="paint-swatches">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              className="swatch"
              style={{ background: c }}
              aria-label={c}
              onClick={() => setFg(c)}
              onContextMenu={(e) => {
                e.preventDefault();
                setBg(c);
              }}
            />
          ))}
        </div>
        <label className="paint-custom" title="Custom color">
          <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} />
        </label>
      </div>
      <div className="status-bar">
        <span>{walletConnected ? 'Tip: File → Mint as NFT turns this picture into a Solana collectible.' : 'For Help, click About SolanaOS on the Help Menu.'}</span>
        <span>{cursor}</span>
        <span>
          {dims.w} × {dims.h}
        </span>
      </div>
    </div>
  );
}

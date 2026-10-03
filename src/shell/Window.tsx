import { memo, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import {
  focusWindow,
  getApp,
  minimizeWindow,
  moveWindow,
  requestClose,
  resizeWindow,
  toggleMaximize,
  useWindows,
  type WinState,
} from '../os/windows';
import { WindowIdContext } from '../os/windowContext';
import { Icon } from './icons';
import { openContextMenu, sep } from './Menu';

const TASKBAR_H = 30;
type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const EDGES: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

function WindowFrame({ win, active }: { win: WinState; active: boolean }) {
  const app = getApp(win.appId);
  const flash = useWindows((s) => (s.flash?.id === win.id ? s.flash.n : 0));
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    if (!flash) return;
    setFlashing(true);
    const t = window.setTimeout(() => setFlashing(false), 700);
    return () => window.clearTimeout(t);
  }, [flash]);
  const frameRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const fitted = useRef(false);
  const fit = !!app?.fitContent;

  // Fit-to-content windows track their content's natural size.
  useLayoutEffect(() => {
    if (!fit) return;
    const frame = frameRef.current;
    const body = bodyRef.current;
    const content = body?.firstElementChild as HTMLElement | null;
    if (!frame || !body || !content) return;
    const measure = () => {
      const cur = useWindows.getState().windows.find((x) => x.id === win.id);
      if (!cur || cur.maximized) return;
      const chromeW = frame.offsetWidth - body.clientWidth;
      const chromeH = frame.offsetHeight - body.clientHeight;
      const w = Math.min(window.innerWidth, content.offsetWidth + chromeW);
      const h = Math.min(window.innerHeight - TASKBAR_H, content.offsetHeight + chromeH);
      if (w === cur.w && h === cur.h) return;
      let { x, y } = cur;
      if (!fitted.current && (app?.dialog || cur.modalFor)) {
        // Keep dialogs centered where they were opened.
        x = Math.round(cur.x + (cur.w - w) / 2);
        y = Math.round(cur.y + (cur.h - h) / 2);
      }
      x = Math.max(0, Math.min(x, window.innerWidth - w));
      y = Math.max(0, Math.min(y, window.innerHeight - TASKBAR_H - h));
      fitted.current = true;
      resizeWindow(win.id, { x, y, w, h });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(content);
    return () => ro.disconnect();
  }, [fit, win.id, app?.dialog]);

  if (!app) return null;

  const resizable = app.resizable !== false && !win.maximized;
  const canMax = app.resizable !== false && app.maximizable !== false && !app.dialog;
  const canMin = app.minimizable !== false && !app.dialog;
  const App = app.component;

  const onTitleDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.title-buttons')) return;
    focusWindow(win.id);
    if (win.maximized) return;
    drag.current = { dx: e.clientX - win.x, dy: e.clientY - win.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onTitleMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const maxX = window.innerWidth - 60;
    const maxY = window.innerHeight - TASKBAR_H - 20;
    const x = Math.min(maxX, Math.max(60 - win.w, e.clientX - drag.current.dx));
    const y = Math.min(maxY, Math.max(0, e.clientY - drag.current.dy));
    moveWindow(win.id, x, y);
  };
  const onTitleUp = () => {
    drag.current = null;
  };

  const startResize = (edge: Edge) => (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    focusWindow(win.id);
    const start = { x: e.clientX, y: e.clientY, rect: { x: win.x, y: win.y, w: win.w, h: win.h } };
    const minW = app.minWidth ?? 200;
    const minH = app.minHeight ?? 120;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      let { x, y, w, h } = start.rect;
      if (edge.includes('e')) w = Math.max(minW, w + dx);
      if (edge.includes('s')) h = Math.max(minH, h + dy);
      if (edge.includes('w')) {
        const nw = Math.max(minW, w - dx);
        x += w - nw;
        w = nw;
      }
      if (edge.includes('n')) {
        const nh = Math.max(minH, h - dy);
        const ny = Math.max(0, y + h - nh);
        h = y + h - ny;
        y = ny;
      }
      resizeWindow(win.id, { x, y, w, h });
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const systemMenu = (e: { clientX: number; clientY: number; preventDefault?: () => void }) =>
    openContextMenu(e, [
      { label: 'Restore', disabled: !win.maximized, onClick: () => toggleMaximize(win.id) },
      { label: 'Minimize', disabled: !canMin, onClick: () => minimizeWindow(win.id) },
      { label: 'Maximize', disabled: !canMax || win.maximized, onClick: () => toggleMaximize(win.id) },
      sep,
      { label: 'Close', bold: true, shortcut: 'Alt+F4', onClick: () => void requestClose(win.id) },
    ]);

  const style = win.maximized
    ? { left: 0, top: 0, width: '100%', height: '100%', zIndex: win.z }
    : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z };

  return (
    <div
      ref={frameRef}
      className={`window${active ? ' active' : ''}${win.maximized ? ' maximized' : ''}${app.dialog ? ' dialog' : ''}${win.minimized ? ' minimized' : ''}${fit ? ' fit' : ''}`}
      style={style}
      data-app={win.appId}
      data-window-id={win.id}
      role="dialog"
      aria-label={win.title}
      onPointerDownCapture={() => !active && focusWindow(win.id)}
    >
      <div className={`window-inner${flashing ? ' flash' : ''}`}>
        <div
          className="title-bar"
          onPointerDown={onTitleDown}
          onPointerMove={onTitleMove}
          onPointerUp={onTitleUp}
          onPointerCancel={onTitleUp}
          onDoubleClick={(e) => !(e.target as HTMLElement).closest('.title-buttons') && canMax && toggleMaximize(win.id)}
          onContextMenu={(e) => systemMenu(e)}
        >
          {!app.dialog && (
            <span
              className="title-icon"
              onPointerDown={(e) => {
                e.stopPropagation();
                const r = e.currentTarget.getBoundingClientRect();
                systemMenu({ clientX: r.left, clientY: r.bottom });
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                void requestClose(win.id);
              }}
            >
              <Icon name={win.icon} size={16} />
            </span>
          )}
          <span className="title-text">{win.title}</span>
          <div className="title-buttons">
            {canMin && (
              <button type="button" className="tb-btn tb-min" aria-label="Minimize" onClick={() => minimizeWindow(win.id)} />
            )}
            {canMax && (
              <button
                type="button"
                className={`tb-btn ${win.maximized ? 'tb-restore' : 'tb-max'}`}
                aria-label={win.maximized ? 'Restore' : 'Maximize'}
                onClick={() => toggleMaximize(win.id)}
              />
            )}
            <button type="button" className="tb-btn tb-close" aria-label="Close" onClick={() => void requestClose(win.id)} />
          </div>
        </div>
        <div className="window-body" ref={bodyRef}>
          <WindowIdContext.Provider value={win.id}>
            <App windowId={win.id} args={win.args} />
          </WindowIdContext.Provider>
        </div>
      </div>
      {resizable && EDGES.map((edge) => <div key={edge} className={`rz rz-${edge}`} onPointerDown={startResize(edge)} />)}
    </div>
  );
}

export const Window = memo(WindowFrame);

export function WindowLayer() {
  const windows = useWindows((s) => s.windows);
  let activeId: string | null = null;
  let topZ = -1;
  for (const w of windows) if (!w.minimized && w.z > topZ) ((topZ = w.z), (activeId = w.id));
  return (
    <div className="window-layer">
      {windows.map((w) => (
        <Window key={w.id} win={w} active={w.id === activeId} />
      ))}
    </div>
  );
}

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { Icon, type IconName } from './icons';

export interface MenuItem {
  label?: string;
  icon?: IconName;
  onClick?: () => void;
  disabled?: boolean;
  bold?: boolean;
  checked?: boolean;
  separator?: boolean;
  shortcut?: string;
  submenu?: MenuItem[];
}

export const sep: MenuItem = { separator: true };

interface CtxState {
  menu: { x: number; y: number; items: MenuItem[] } | null;
}
const useCtx = create<CtxState>(() => ({ menu: null }));

export function openContextMenu(e: { clientX: number; clientY: number; preventDefault?: () => void }, items: MenuItem[]) {
  e.preventDefault?.();
  useCtx.setState({ menu: { x: e.clientX, y: e.clientY, items } });
}

export function closeContextMenu() {
  useCtx.setState({ menu: null });
}

/** Keeps a floating element inside the viewport. */
function useFitToViewport(ref: React.RefObject<HTMLElement | null>, x: number, y: number, flipX?: number, bottom?: number) {
  const [pos, setPos] = useState({ x, y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let nx = x;
    let ny = bottom !== undefined ? bottom - r.height : y;
    if (nx + r.width > window.innerWidth) nx = flipX !== undefined ? flipX - r.width : window.innerWidth - r.width - 2;
    if (ny + r.height > window.innerHeight) ny = Math.max(0, window.innerHeight - r.height - 2);
    setPos({ x: Math.max(0, nx), y: Math.max(0, ny) });
  }, [ref, x, y, flipX, bottom]);
  return pos;
}

export function MenuList({
  items,
  x,
  y,
  flipX,
  bottom,
  onDone,
  className = '',
}: {
  items: MenuItem[];
  x: number;
  y: number;
  flipX?: number;
  /** Align the menu's bottom edge here instead of its top (Start menu flyout). */
  bottom?: number;
  onDone: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useFitToViewport(ref, x, y, flipX, bottom);
  const [sub, setSub] = useState<{ index: number; x: number; y: number; flip: number } | null>(null);
  const [hover, setHover] = useState(-1);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <>
      <div
        ref={ref}
        className={`menu ${className}`}
        style={{ left: pos.x, top: pos.y }}
        role="menu"
        onContextMenu={(e) => e.preventDefault()}
      >
        {items.map((it, i) =>
          it.separator ? (
            <div key={i} className="menu-sep" />
          ) : (
            <div
              key={i}
              role="menuitem"
              aria-disabled={it.disabled}
              className={`menu-item${it.disabled ? ' disabled' : ''}${hover === i ? ' hover' : ''}${it.bold ? ' bold' : ''}`}
              onPointerEnter={(e) => {
                setHover(i);
                window.clearTimeout(timer.current);
                const r = e.currentTarget.getBoundingClientRect();
                if (it.submenu && !it.disabled) {
                  timer.current = window.setTimeout(() => setSub({ index: i, x: r.right - 3, y: r.top - 3, flip: r.left + 3 }), 250);
                } else {
                  timer.current = window.setTimeout(() => setSub(null), 250);
                }
              }}
              onPointerLeave={() => setHover(-1)}
              onClick={(e) => {
                e.stopPropagation();
                if (it.disabled) return;
                if (it.submenu) {
                  const r = e.currentTarget.getBoundingClientRect();
                  setSub({ index: i, x: r.right - 3, y: r.top - 3, flip: r.left + 3 });
                  return;
                }
                onDone();
                it.onClick?.();
              }}
            >
              <span className="menu-check">{it.checked ? '✓' : it.icon ? <Icon name={it.icon} size={16} /> : null}</span>
              <span className="menu-label">{it.label}</span>
              {it.shortcut && <span className="menu-shortcut">{it.shortcut}</span>}
              {it.submenu && <span className="menu-arrow">▶</span>}
            </div>
          ),
        )}
      </div>
      {sub && items[sub.index]?.submenu && (
        <MenuList items={items[sub.index].submenu!} x={sub.x} y={sub.y} flipX={sub.flip} onDone={onDone} className={className} />
      )}
    </>
  );
}

export function ContextMenuHost() {
  const menu = useCtx((s) => s.menu);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.menu')) closeContextMenu();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeContextMenu();
    const onBlur = () => closeContextMenu();
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onBlur);
    };
  }, [menu]);
  if (!menu) return null;
  return (
    <div className="menu-layer">
      <MenuList items={menu.items} x={menu.x} y={menu.y} onDone={closeContextMenu} />
    </div>
  );
}

export interface MenuBarMenu {
  label: string;
  items: MenuItem[];
}

/** A window's File / Edit / View … menu bar. */
export function MenuBar({ menus, extra }: { menus: MenuBarMenu[]; extra?: ReactNode }) {
  const [open, setOpen] = useState<{ index: number; x: number; y: number } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.menu') && !barRef.current?.contains(t)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openAt = (i: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setOpen({ index: i, x: r.left, y: r.bottom });
  };

  return (
    <div className="menubar" ref={barRef}>
      {menus.map((m, i) => (
        <button
          key={m.label}
          type="button"
          className={`menubar-item${open?.index === i ? ' open' : ''}`}
          onPointerDown={(e) => {
            e.preventDefault();
            if (open?.index === i) setOpen(null);
            else openAt(i, e.currentTarget);
          }}
          onPointerEnter={(e) => open && open.index !== i && openAt(i, e.currentTarget)}
        >
          {m.label}
        </button>
      ))}
      {extra}
      {open && (
        <div className="menu-layer">
          <MenuList items={menus[open.index].items} x={open.x} y={open.y} onDone={() => setOpen(null)} />
        </div>
      )}
    </div>
  );
}

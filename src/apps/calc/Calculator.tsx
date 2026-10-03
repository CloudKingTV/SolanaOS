import { useCallback, useEffect, useRef, useState } from 'react';
import { press, initialCalc, type CalcKey, type CalcState } from './engine';
import { closeWindow, openApp, type AppProps } from '../../os/windows';
import { MenuBar, sep } from '../../shell/Menu';

/** Rent-exempt minimum for an account of `bytes` data: (128 + bytes) × 3480 lamports/byte-year × 2 years. */
export function rentExemptLamports(bytes: number): number {
  return (128 + Math.max(0, Math.floor(bytes))) * 3480 * 2;
}

type Btn = { label: string; key: CalcKey; cls?: string; title?: string };

const d = (n: string): Btn => ({ label: n, key: { t: 'digit', d: n } });
const grid: Btn[][] = [
  [d('7'), d('8'), d('9'), { label: '/', key: { t: 'op', op: '/' }, cls: 'op' }, { label: 'sqrt', key: { t: 'sqrt' }, cls: 'fn' }],
  [d('4'), d('5'), d('6'), { label: '*', key: { t: 'op', op: '*' }, cls: 'op' }, { label: '%', key: { t: 'percent' }, cls: 'fn' }],
  [d('1'), d('2'), d('3'), { label: '-', key: { t: 'op', op: '-' }, cls: 'op' }, { label: '1/x', key: { t: 'inverse' }, cls: 'fn' }],
  [d('0'), { label: '+/-', key: { t: 'negate' } }, { label: '.', key: { t: 'dot' } }, { label: '+', key: { t: 'op', op: '+' }, cls: 'op' }, { label: '=', key: { t: 'equals' }, cls: 'op' }],
];
const mem: Btn[] = [
  { label: 'MC', key: { t: 'mc' } },
  { label: 'MR', key: { t: 'mr' } },
  { label: 'MS', key: { t: 'ms' } },
  { label: 'M+', key: { t: 'mplus' } },
];

export function Calculator({ windowId }: AppProps) {
  const [s, setS] = useState<CalcState>(initialCalc);
  const [solana, setSolana] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const k = useCallback((key: CalcKey) => setS((cur) => press(cur, key)), []);
  const v = Number.parseFloat(s.display);

  useEffect(() => root.current?.focus(), []);

  const onKey = (e: React.KeyboardEvent) => {
    const map: Record<string, CalcKey> = {
      '+': { t: 'op', op: '+' },
      '-': { t: 'op', op: '-' },
      '*': { t: 'op', op: '*' },
      '/': { t: 'op', op: '/' },
      '=': { t: 'equals' },
      Enter: { t: 'equals' },
      '.': { t: 'dot' },
      ',': { t: 'dot' },
      Backspace: { t: 'back' },
      Escape: { t: 'clear' },
      Delete: { t: 'clearEntry' },
      '%': { t: 'percent' },
      '@': { t: 'sqrt' },
      r: { t: 'inverse' },
    };
    if (e.ctrlKey && e.key === 'c') {
      e.preventDefault();
      void navigator.clipboard?.writeText(s.display).catch(() => {});
      return;
    }
    // Leave other modifier combos (Alt+R for Run, etc.) to the shell.
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (/^[0-9]$/.test(e.key)) k({ t: 'digit', d: e.key });
    else if (map[e.key]) k(map[e.key]);
    else return;
    e.preventDefault();
  };

  return (
    <div className="calc" ref={root} tabIndex={0} onKeyDown={onKey}>
      <MenuBar
        menus={[
          {
            label: 'Edit',
            items: [
              { label: 'Copy', shortcut: 'Ctrl+C', onClick: () => void navigator.clipboard?.writeText(s.display).catch(() => {}) },
              sep,
              { label: 'Close', onClick: () => closeWindow(windowId) },
            ],
          },
          {
            label: 'View',
            items: [
              { label: 'Standard', checked: !solana, onClick: () => setSolana(false) },
              { label: 'Solana', checked: solana, onClick: () => setSolana(true) },
            ],
          },
          { label: 'Help', items: [{ label: 'About SolanaOS', onClick: () => openApp('about') }] },
        ]}
      />
      <div className="calc-display" aria-live="polite">
        {s.display}
      </div>
      {solana && (
        <div className="calc-sol">
          <div className="calc-sol-readout">
            {Number.isFinite(v) ? (
              <>
                <span>◎ {v.toLocaleString('en-US', { maximumFractionDigits: 9 })} SOL = {(v * 1e9).toLocaleString('en-US', { maximumFractionDigits: 0 })} lamports</span>
                <span>Rent for {Math.max(0, Math.floor(v)).toLocaleString('en-US')} bytes: {(rentExemptLamports(v) / 1e9).toFixed(8)} SOL</span>
              </>
            ) : (
              <span>—</span>
            )}
          </div>
          <div className="calc-sol-btns">
            <button type="button" className="btn calc-btn fn" title="Convert SOL to lamports" onClick={() => k({ t: 'set', value: Math.round(v * 1e9) })}>
              SOL→L
            </button>
            <button type="button" className="btn calc-btn fn" title="Convert lamports to SOL" onClick={() => k({ t: 'set', value: v / 1e9 })}>
              L→SOL
            </button>
            <button type="button" className="btn calc-btn fn" title="Rent-exempt minimum (SOL) for an account with this many bytes" onClick={() => k({ t: 'set', value: rentExemptLamports(v) / 1e9 })}>
              Rent
            </button>
          </div>
        </div>
      )}
      <div className="calc-top">
        <div className="calc-mem-indicator">{s.memory !== 0 ? 'M' : ''}</div>
        <button type="button" className="btn calc-btn op wide" onClick={() => k({ t: 'back' })}>
          Backspace
        </button>
        <button type="button" className="btn calc-btn op wide" onClick={() => k({ t: 'clearEntry' })}>
          CE
        </button>
        <button type="button" className="btn calc-btn op wide" onClick={() => k({ t: 'clear' })}>
          C
        </button>
      </div>
      <div className="calc-body">
        <div className="calc-mem">
          {mem.map((b) => (
            <button key={b.label} type="button" className="btn calc-btn op" onClick={() => k(b.key)}>
              {b.label}
            </button>
          ))}
        </div>
        <div className="calc-grid">
          {grid.flat().map((b) => (
            <button key={b.label} type="button" className={`btn calc-btn ${b.cls ?? 'num'}`} onClick={() => k(b.key)}>
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

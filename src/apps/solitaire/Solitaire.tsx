import { useEffect, useRef, useState } from 'react';
import { closeWindow, openApp, type AppProps } from '../../os/windows';
import { MenuBar, sep } from '../../shell/Menu';
import { SolanaLogo } from '../../shell/icons';
import { sounds } from '../../os/sound';
import { RANKS, SUITS, autoFoundation, drawCards, isRed, isWon, move, newGame, type Card, type Game, type Pile } from './engine';

const W = 71;
const H = 96;
const DOWN_GAP = 5;
const UP_GAP = 18;

function CardView({ card, selected, onClick, onDoubleClick, style }: { card: Card; selected?: boolean; onClick?: (e: React.MouseEvent) => void; onDoubleClick?: () => void; style?: React.CSSProperties }) {
  if (!card.up) {
    return (
      <div className="sol-card back" style={style} onClick={onClick}>
        <SolanaLogo size={34} />
      </div>
    );
  }
  const sym = SUITS[card.suit];
  return (
    <div
      className={`sol-card face${isRed(card) ? ' red' : ''}${selected ? ' selected' : ''}`}
      style={style}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      aria-label={`${RANKS[card.rank]} of ${['spades', 'hearts', 'diamonds', 'clubs'][card.suit]}`}
    >
      <span className="corner tl">
        {RANKS[card.rank]}
        <br />
        {sym}
      </span>
      <span className="pip">{card.rank > 10 ? <b>{RANKS[card.rank]}</b> : sym}</span>
      <span className="corner br">
        {RANKS[card.rank]}
        <br />
        {sym}
      </span>
    </div>
  );
}

/** The famous cascade when you win. */
function WinCascade({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width;
    canvas.height = r.height;
    const colors = ['#9945FF', '#14F195', '#ffffff', '#c6161b'];
    let card = 0;
    let x = 0;
    let y = 0;
    let vx = 0;
    let vy = 0;
    const spawn = () => {
      const slot = card % 4;
      x = 300 + slot * (W + 10);
      y = 10;
      vx = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 4);
      vy = -Math.random() * 6;
      card++;
    };
    spawn();
    let raf = 0;
    const tick = () => {
      for (let k = 0; k < 2; k++) {
        vy += 0.6;
        x += vx;
        y += vy;
        if (y + H > canvas.height) {
          y = canvas.height - H;
          vy *= -0.75;
        }
        ctx.fillStyle = '#fff';
        ctx.fillRect(x, y, W, H);
        ctx.strokeStyle = '#000';
        ctx.strokeRect(x + 0.5, y + 0.5, W - 1, H - 1);
        ctx.fillStyle = colors[card % colors.length];
        ctx.font = 'bold 28px Georgia';
        ctx.fillText(SUITS[card % 4], x + 22, y + 58);
        if (x + W < 0 || x > canvas.width) {
          if (card >= 52) return onDone();
          spawn();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [onDone]);
  return <canvas ref={ref} className="sol-cascade" onClick={onDone} />;
}

export function Solitaire({ windowId }: AppProps) {
  const [draw, setDraw] = useState<1 | 3>(1);
  const [game, setGame] = useState<Game>(() => newGame(1));
  const [history, setHistory] = useState<Game[]>([]);
  const [sel, setSel] = useState<Pile | null>(null);
  const [time, setTime] = useState(0);
  const [started, setStarted] = useState<number | null>(null);
  const [won, setWon] = useState(false);
  const [cascade, setCascade] = useState(false);

  useEffect(() => {
    if (!started || won) return;
    const t = setInterval(() => setTime(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [started, won]);

  const apply = (next: Game | null) => {
    if (!next) return false;
    setHistory((h) => [...h.slice(-100), game]);
    setGame(next);
    setSel(null);
    setStarted((s) => s ?? Date.now());
    if (isWon(next)) {
      setWon(true);
      setCascade(true);
      sounds.ding();
    }
    return true;
  };

  const deal = (d: 1 | 3 = draw) => {
    setGame(newGame(d));
    setHistory([]);
    setSel(null);
    setTime(0);
    setStarted(null);
    setWon(false);
    setCascade(false);
  };

  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev || won) return;
    setHistory((h) => h.slice(0, -1));
    setGame(prev);
    setSel(null);
  };

  const target = (to: { kind: 'foundation' | 'tableau'; i: number }) => {
    if (sel && apply(move(game, sel, to))) return true;
    return false;
  };

  const clickSource = (p: Pile, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (sel) {
      const to = p.kind === 'foundation' ? { kind: 'foundation' as const, i: p.i } : p.kind === 'tableau' ? { kind: 'tableau' as const, i: p.i } : null;
      if (to && target(to)) return;
    }
    setSel(sel && JSON.stringify(sel) === JSON.stringify(p) ? null : p);
  };

  const isSel = (p: Pile, index?: number) => {
    if (!sel || sel.kind !== p.kind) return false;
    if (sel.kind === 'tableau' && p.kind === 'tableau') return sel.i === p.i && index !== undefined && index >= sel.index;
    if (sel.kind === 'foundation' && p.kind === 'foundation') return sel.i === p.i;
    return sel.kind === 'waste';
  };

  const wasteShown = game.waste.slice(game.draw === 3 ? -3 : -1);

  return (
    <div className="solitaire">
      <MenuBar
        menus={[
          {
            label: 'Game',
            items: [
              { label: 'Deal', shortcut: 'F2', onClick: () => deal() },
              sep,
              { label: 'Undo', disabled: !history.length || won, onClick: undo },
              sep,
              { label: 'Draw One', checked: draw === 1, onClick: () => (setDraw(1), deal(1)) },
              { label: 'Draw Three', checked: draw === 3, onClick: () => (setDraw(3), deal(3)) },
              sep,
              { label: 'Exit', onClick: () => closeWindow(windowId) },
            ],
          },
          { label: 'Help', items: [{ label: 'About SolanaOS', onClick: () => openApp('about') }] },
        ]}
      />
      <div className="sol-table" onClick={() => setSel(null)} tabIndex={-1} onKeyDown={(e) => e.key === 'F2' && deal()}>
        <div className="sol-top">
          <div className="sol-slot" onClick={(e) => (e.stopPropagation(), apply(drawCards(game)))}>
            {game.stock.length ? <CardView card={game.stock[game.stock.length - 1]} /> : <span className="sol-recycle">↻</span>}
          </div>
          <div className="sol-slot sol-waste">
            {wasteShown.map((c, i) => {
              const top = i === wasteShown.length - 1;
              return (
                <CardView
                  key={`${c.suit}-${c.rank}`}
                  card={c}
                  style={{ left: i * 14 }}
                  selected={top && isSel({ kind: 'waste' })}
                  onClick={top ? (e) => clickSource({ kind: 'waste' }, e) : undefined}
                  onDoubleClick={top ? () => apply(autoFoundation(game, { kind: 'waste' })) : undefined}
                />
              );
            })}
          </div>
          <div className="sol-gap" />
          {game.foundations.map((f, i) => (
            <div
              key={i}
              className="sol-slot foundation"
              onClick={(e) => {
                e.stopPropagation();
                if (!target({ kind: 'foundation', i }) && f.length) clickSource({ kind: 'foundation', i });
              }}
            >
              {f.length ? <CardView card={f[f.length - 1]} selected={isSel({ kind: 'foundation', i })} /> : <span className="sol-ace">A</span>}
            </div>
          ))}
        </div>
        <div className="sol-tableau">
          {game.tableau.map((pile, i) => {
            let top = 0;
            return (
              <div
                key={i}
                className="sol-column"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!pile.length) target({ kind: 'tableau', i });
                }}
              >
                {!pile.length && <div className="sol-slot empty" />}
                {pile.map((c, idx) => {
                  const y = top;
                  top += c.up ? UP_GAP : DOWN_GAP;
                  const p: Pile = { kind: 'tableau', i, index: idx };
                  return (
                    <CardView
                      key={`${c.suit}-${c.rank}`}
                      card={c}
                      style={{ top: y }}
                      selected={isSel(p, idx)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!c.up) {
                          if (idx === pile.length - 1) apply({ ...game, tableau: game.tableau.map((t, k) => (k === i ? t.map((x, j) => (j === idx ? { ...x, up: true } : x)) : t)) });
                          return;
                        }
                        clickSource(p);
                      }}
                      onDoubleClick={idx === pile.length - 1 ? () => apply(autoFoundation(game, p)) : undefined}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
        {cascade && <WinCascade onDone={() => setCascade(false)} />}
        {won && !cascade && (
          <div className="sol-won" onClick={(e) => e.stopPropagation()}>
            <b>You win!</b>
            <span>
              Score {game.score} · {time}s
            </span>
            <button type="button" className="btn" onClick={() => deal()}>
              Deal Again
            </button>
          </div>
        )}
      </div>
      <div className="status-bar">
        <span>Score: {game.score}</span>
        <span>Time: {time}</span>
        <span>{draw === 1 ? 'Draw One' : 'Draw Three'}</span>
      </div>
    </div>
  );
}

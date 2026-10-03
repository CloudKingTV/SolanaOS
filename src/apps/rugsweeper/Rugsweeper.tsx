import { useEffect, useRef, useState } from 'react';
import { LEVELS, chord, cycleMark, flagsLeft, newBoard, reveal, type Board, type Level } from './engine';
import { closeWindow, openApp, type AppProps } from '../../os/windows';
import { MenuBar, sep } from '../../shell/Menu';
import { messageBox } from '../../os/dialogs';
import { sounds } from '../../os/sound';

const BEST_KEY = 'solanaos.rugsweeper.best.v1';

function loadBest(): Partial<Record<Level, number>> {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function Led({ value }: { value: number }) {
  const v = Math.max(-99, Math.min(999, value));
  const s = v < 0 ? `-${String(-v).padStart(2, '0')}` : String(v).padStart(3, '0');
  return <div className="rs-led">{s}</div>;
}

function Face({ state }: { state: 'smile' | 'oh' | 'cool' | 'dead' }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#ffe14d" stroke="#000" />
      {state === 'dead' ? (
        <path d="M7 7l3 3M10 7l-3 3M14 7l3 3M17 7l-3 3" stroke="#000" strokeWidth="1.4" />
      ) : state === 'cool' ? (
        <>
          <path d="M4.5 9h15" stroke="#000" strokeWidth="1.2" />
          <path d="M5.5 8.5h5.5l-.6 3h-4.3zM13 8.5h5.5l-.6 3h-4.3z" fill="#1b1036" />
          <path d="M6.5 9.5h3M14 9.5h3" stroke="#14F195" strokeWidth="0.8" />
        </>
      ) : (
        <>
          <circle cx="8.5" cy="9" r="1.3" />
          <circle cx="15.5" cy="9" r="1.3" />
        </>
      )}
      {state === 'oh' ? (
        <circle cx="12" cy="16" r="2.4" fill="none" stroke="#000" strokeWidth="1.4" />
      ) : state === 'dead' ? (
        <path d="M8 17.5c2-2.5 6-2.5 8 0" fill="none" stroke="#000" strokeWidth="1.4" />
      ) : (
        <path d="M7.5 14.5c2 3 7 3 9 0" fill="none" stroke="#000" strokeWidth="1.4" />
      )}
    </svg>
  );
}

const Rug = ({ exploded }: { exploded?: boolean }) => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-label="rug">
    <rect x="3" y="3" width="10" height="10" fill={exploded ? '#1b1036' : '#8a1d3a'} stroke="#000" strokeWidth="0.8" />
    <rect x="5" y="5" width="6" height="6" fill="none" stroke="#f2c650" strokeWidth="0.8" />
    <path d="M8 6l2 2-2 2-2-2z" fill="#14F195" />
    <path d="M3 4H1.5M3 7H1.5M3 10H1.5M3 12.5H1.5M13 4h1.5M13 7h1.5M13 10h1.5M13 12.5h1.5" stroke="#d9c38c" strokeWidth="0.8" />
  </svg>
);

const Flag = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" aria-label="flag">
    <path d="M7 2v10" stroke="#000" strokeWidth="1.4" />
    <path d="M7 2.5L2 5l5 2.5z" fill="#9945FF" />
    <path d="M4 13h6v1.5H4z" fill="#000" />
  </svg>
);

export function Rugsweeper({ windowId }: AppProps) {
  const [level, setLevel] = useState<Level>('beginner');
  const [board, setBoard] = useState<Board>(() => newBoard(9, 9, 10));
  const [time, setTime] = useState(0);
  const [pressing, setPressing] = useState(false);
  const [marks, setMarks] = useState(true);
  const started = useRef<number | null>(null);

  const reset = (lv: Level = level) => {
    const L = LEVELS[lv];
    setLevel(lv);
    setBoard(newBoard(L.w, L.h, L.rugs));
    setTime(0);
    started.current = null;
  };

  useEffect(() => {
    if (board.status !== 'playing') return;
    started.current ??= Date.now();
    const t = setInterval(() => setTime(Math.min(999, Math.floor((Date.now() - started.current!) / 1000) + 1)), 250);
    return () => clearInterval(t);
  }, [board.status]);

  useEffect(() => {
    if (board.status === 'lost') sounds.boom();
    if (board.status === 'won') {
      sounds.ding();
      const best = loadBest();
      if (!best[level] || time < best[level]!) {
        best[level] = time;
        try {
          localStorage.setItem(BEST_KEY, JSON.stringify(best));
        } catch {
          // Non-critical.
        }
        void messageBox({
          title: 'Rugsweeper',
          icon: 'info',
          message: `You dodged every rug on ${level} in ${time} seconds — a new best time!`,
          owner: windowId,
        });
      }
    }
    // Only react to the status change itself.
  }, [board.status]);

  const face = board.status === 'lost' ? 'dead' : board.status === 'won' ? 'cool' : pressing ? 'oh' : 'smile';

  const showBest = () => {
    const b = loadBest();
    void messageBox({
      title: 'Fastest Rug Dodgers',
      icon: 'info',
      message: `Beginner: ${b.beginner ?? '—'} seconds\nIntermediate: ${b.intermediate ?? '—'} seconds\nExpert: ${b.expert ?? '—'} seconds`,
      owner: windowId,
    });
  };

  return (
    <div className="rugsweeper">
      <MenuBar
        menus={[
          {
            label: 'Game',
            items: [
              { label: 'New', shortcut: 'F2', onClick: () => reset() },
              sep,
              { label: 'Beginner', checked: level === 'beginner', onClick: () => reset('beginner') },
              { label: 'Intermediate', checked: level === 'intermediate', onClick: () => reset('intermediate') },
              { label: 'Expert', checked: level === 'expert', onClick: () => reset('expert') },
              sep,
              { label: 'Marks (?)', checked: marks, onClick: () => setMarks(!marks) },
              sep,
              { label: 'Best Times...', onClick: showBest },
              sep,
              { label: 'Exit', onClick: () => closeWindow(windowId) },
            ],
          },
          {
            label: 'Help',
            items: [
              {
                label: 'How to Play',
                onClick: () =>
                  void messageBox({
                    title: 'Rugsweeper',
                    icon: 'info',
                    message:
                      'Clear the board without pulling a rug.\n\nLeft-click to reveal a square. Numbers show how many rugs touch that square.\nRight-click to plant a flag on a suspected rug.\nClick a number with all its rugs flagged to clear its neighbors.',
                    owner: windowId,
                  }),
              },
              { label: 'About SolanaOS', onClick: () => openApp('about') },
            ],
          },
        ]}
      />
      <div className="rs-frame" onKeyDown={(e) => e.key === 'F2' && reset()} tabIndex={0}>
        <div className="rs-head">
          <Led value={flagsLeft(board)} />
          <button type="button" className="rs-face" onClick={() => reset()} aria-label="New game">
            <Face state={face} />
          </button>
          <Led value={time} />
        </div>
        <div
          className="rs-grid"
          style={{ gridTemplateColumns: `repeat(${board.w}, 16px)` }}
          onPointerDown={(e) => e.button === 0 && board.status !== 'won' && board.status !== 'lost' && setPressing(true)}
          onPointerUp={() => setPressing(false)}
          onPointerLeave={() => setPressing(false)}
          onContextMenu={(e) => e.preventDefault()}
        >
          {board.cells.map((c, i) => {
            const wrongFlag = board.status === 'lost' && c.mark === 1 && !c.rug;
            return (
              <button
                key={i}
                type="button"
                className={`rs-cell${c.open ? ' open' : ''}${board.boom === i ? ' boom' : ''}`}
                data-n={c.open && !c.rug ? c.adj : undefined}
                onClick={() => setBoard((b) => (b.cells[i].open ? chord(b, i) : reveal(b, i)))}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setBoard((b) => cycleMark(b, i, marks));
                }}
                aria-label={`Square ${(i % board.w) + 1}, ${Math.floor(i / board.w) + 1}`}
              >
                {c.open && c.rug ? (
                  <Rug exploded={board.boom === i} />
                ) : c.open ? (
                  c.adj || ''
                ) : wrongFlag ? (
                  <span className="rs-wrong">✕</span>
                ) : c.mark === 1 ? (
                  <Flag />
                ) : c.mark === 2 ? (
                  '?'
                ) : (
                  ''
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

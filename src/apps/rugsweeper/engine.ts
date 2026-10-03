export interface Cell {
  rug: boolean;
  open: boolean;
  /** 0 = none, 1 = flag, 2 = question mark */
  mark: 0 | 1 | 2;
  adj: number;
}

export type Status = 'ready' | 'playing' | 'won' | 'lost';

export interface Board {
  w: number;
  h: number;
  rugs: number;
  cells: Cell[];
  status: Status;
  /** Index of the rug that was clicked when the game was lost. */
  boom: number | null;
}

export const LEVELS = {
  beginner: { w: 9, h: 9, rugs: 10 },
  intermediate: { w: 16, h: 16, rugs: 40 },
  expert: { w: 30, h: 16, rugs: 99 },
} as const;
export type Level = keyof typeof LEVELS;

export function newBoard(w: number, h: number, rugs: number): Board {
  return {
    w,
    h,
    rugs: Math.min(rugs, w * h - 9),
    cells: Array.from({ length: w * h }, () => ({ rug: false, open: false, mark: 0, adj: 0 })),
    status: 'ready',
    boom: null,
  };
}

export function neighbors(b: Pick<Board, 'w' | 'h'>, i: number): number[] {
  const x = i % b.w;
  const y = Math.floor(i / b.w);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < b.w && ny < b.h) out.push(ny * b.w + nx);
    }
  return out;
}

/** Place rugs, keeping the first-clicked cell and its neighbors safe. */
export function plant(b: Board, safe: number, rand: () => number = Math.random): Board {
  const forbidden = new Set([safe, ...neighbors(b, safe)]);
  const cells = b.cells.map((c) => ({ ...c, rug: false, adj: 0 }));
  const candidates = cells.map((_, i) => i).filter((i) => !forbidden.has(i));
  for (let n = 0; n < b.rugs && candidates.length; n++) {
    const j = Math.floor(rand() * candidates.length);
    cells[candidates[j]].rug = true;
    candidates.splice(j, 1);
  }
  for (let i = 0; i < cells.length; i++) cells[i].adj = neighbors(b, i).filter((n) => cells[n].rug).length;
  return { ...b, cells, status: 'playing' };
}

function checkWin(b: Board): Board {
  const won = b.cells.every((c) => c.rug || c.open);
  if (!won) return b;
  return { ...b, status: 'won', cells: b.cells.map((c) => (c.rug ? { ...c, mark: 1 } : c)) };
}

export function reveal(board: Board, i: number, rand?: () => number): Board {
  let b = board;
  if (b.status === 'won' || b.status === 'lost') return b;
  if (b.status === 'ready') b = plant(b, i, rand);
  const c = b.cells[i];
  if (c.open || c.mark === 1) return b;
  const cells = b.cells.slice();
  if (c.rug) {
    return {
      ...b,
      status: 'lost',
      boom: i,
      cells: cells.map((x) => (x.rug && x.mark !== 1 ? { ...x, open: true } : x)),
    };
  }
  // Flood-fill open cells with no adjacent rugs.
  const stack = [i];
  while (stack.length) {
    const k = stack.pop()!;
    const cell = cells[k];
    if (cell.open || cell.mark === 1) continue;
    cells[k] = { ...cell, open: true, mark: 0 };
    if (cell.adj === 0) for (const n of neighbors(b, k)) if (!cells[n].open && !cells[n].rug) stack.push(n);
  }
  return checkWin({ ...b, cells });
}

/** Clicking an open number with the right number of flags around it opens the rest. */
export function chord(b: Board, i: number): Board {
  const c = b.cells[i];
  if (b.status !== 'playing' || !c.open || c.adj === 0) return b;
  const ns = neighbors(b, i);
  const flags = ns.filter((n) => b.cells[n].mark === 1).length;
  if (flags !== c.adj) return b;
  let out = b;
  for (const n of ns) if (!out.cells[n].open && out.cells[n].mark !== 1) out = reveal(out, n);
  return out;
}

export function cycleMark(b: Board, i: number, allowQuestion = true): Board {
  if (b.status === 'won' || b.status === 'lost') return b;
  const c = b.cells[i];
  if (c.open) return b;
  const next = (c.mark === 0 ? 1 : c.mark === 1 ? (allowQuestion ? 2 : 0) : 0) as Cell['mark'];
  const cells = b.cells.slice();
  cells[i] = { ...c, mark: next };
  return { ...b, cells };
}

export function flagsLeft(b: Board): number {
  return b.rugs - b.cells.filter((c) => c.mark === 1).length;
}

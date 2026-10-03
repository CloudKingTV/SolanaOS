// Klondike rules, kept pure so they can be unit tested.

export interface Card {
  suit: 0 | 1 | 2 | 3; // ♠ ♥ ♦ ♣
  rank: number; // 1 (A) … 13 (K)
  up: boolean;
}

export interface Game {
  stock: Card[];
  waste: Card[];
  foundations: Card[][];
  tableau: Card[][];
  draw: 1 | 3;
  score: number;
  moves: number;
}

export type Pile = { kind: 'waste' } | { kind: 'foundation'; i: number } | { kind: 'tableau'; i: number; index: number };

export const SUITS = ['♠', '♥', '♦', '♣'] as const;
export const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const isRed = (c: Card) => c.suit === 1 || c.suit === 2;

export function newGame(draw: 1 | 3 = 1, rand: () => number = Math.random): Game {
  const deck: Card[] = [];
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) deck.push({ suit: s as Card['suit'], rank: r, up: false });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const tableau: Card[][] = [];
  for (let i = 0; i < 7; i++) {
    const pile = deck.splice(0, i + 1);
    pile[pile.length - 1].up = true;
    tableau.push(pile);
  }
  return { stock: deck, waste: [], foundations: [[], [], [], []], tableau, draw, score: 0, moves: 0 };
}

const clone = (g: Game): Game => ({
  ...g,
  stock: g.stock.map((c) => ({ ...c })),
  waste: g.waste.map((c) => ({ ...c })),
  foundations: g.foundations.map((p) => p.map((c) => ({ ...c }))),
  tableau: g.tableau.map((p) => p.map((c) => ({ ...c }))),
});

export function canFoundation(card: Card, pile: Card[]): boolean {
  const top = pile[pile.length - 1];
  return top ? top.suit === card.suit && top.rank === card.rank - 1 : card.rank === 1;
}

export function canTableau(card: Card, pile: Card[]): boolean {
  const top = pile[pile.length - 1];
  return top ? top.up && isRed(top) !== isRed(card) && top.rank === card.rank + 1 : card.rank === 13;
}

/** Turn over the stock (or recycle the waste). */
export function drawCards(g: Game): Game {
  const n = clone(g);
  if (!n.stock.length) {
    if (!n.waste.length) return g;
    n.stock = n.waste.reverse().map((c) => ({ ...c, up: false }));
    n.waste = [];
    n.score = Math.max(0, n.score - (n.draw === 1 ? 100 : 20));
  } else {
    for (let i = 0; i < n.draw && n.stock.length; i++) n.waste.push({ ...n.stock.pop()!, up: true });
  }
  n.moves++;
  return n;
}

/** Cards that would move from a source (one card, or a run from the tableau). */
export function cardsAt(g: Game, from: Pile): Card[] {
  if (from.kind === 'waste') return g.waste.length ? [g.waste[g.waste.length - 1]] : [];
  if (from.kind === 'foundation') {
    const f = g.foundations[from.i];
    return f.length ? [f[f.length - 1]] : [];
  }
  const pile = g.tableau[from.i];
  if (from.index < 0 || from.index >= pile.length || !pile[from.index].up) return [];
  return pile.slice(from.index);
}

function flipTop(g: Game, i: number) {
  const pile = g.tableau[i];
  const top = pile[pile.length - 1];
  if (top && !top.up) {
    top.up = true;
    g.score += 5;
  }
}

/** Try a move; returns the new game, or null if it's not legal. */
export function move(g: Game, from: Pile, to: { kind: 'foundation' | 'tableau'; i: number }): Game | null {
  const cards = cardsAt(g, from);
  if (!cards.length) return null;
  if (from.kind === to.kind && from.i === to.i) return null;
  if (to.kind === 'foundation') {
    if (cards.length !== 1 || !canFoundation(cards[0], g.foundations[to.i])) return null;
  } else if (!canTableau(cards[0], g.tableau[to.i])) return null;

  const n = clone(g);
  if (from.kind === 'waste') n.waste.pop();
  else if (from.kind === 'foundation') n.foundations[from.i].pop();
  else n.tableau[from.i].splice(from.index);
  const moved = cards.map((c) => ({ ...c, up: true }));
  if (to.kind === 'foundation') n.foundations[to.i].push(...moved);
  else n.tableau[to.i].push(...moved);

  if (to.kind === 'foundation') n.score += 10;
  else if (from.kind === 'waste') n.score += 5;
  else if (from.kind === 'foundation') n.score = Math.max(0, n.score - 15);
  if (from.kind === 'tableau') flipTop(n, from.i);
  n.moves++;
  return n;
}

/** Double-click: send a card to the first foundation that takes it. */
export function autoFoundation(g: Game, from: Pile): Game | null {
  const cards = cardsAt(g, from);
  if (cards.length !== 1) return null;
  for (let i = 0; i < 4; i++) {
    const r = move(g, from, { kind: 'foundation', i });
    if (r) return r;
  }
  return null;
}

export const isWon = (g: Game) => g.foundations.every((f) => f.length === 13);

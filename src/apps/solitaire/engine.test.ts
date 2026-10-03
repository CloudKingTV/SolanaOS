import { describe, expect, it } from 'vitest';
import { autoFoundation, canFoundation, canTableau, drawCards, isWon, move, newGame, type Card, type Game } from './engine';

const c = (rank: number, suit: Card['suit'], up = true): Card => ({ rank, suit, up });
const empty = (): Game => ({ stock: [], waste: [], foundations: [[], [], [], []], tableau: [[], [], [], [], [], [], []], draw: 1, score: 0, moves: 0 });

describe('solitaire', () => {
  it('deals 28 tableau cards with only the tops face up', () => {
    const g = newGame(1, () => 0.42);
    expect(g.tableau.map((p) => p.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(g.stock).toHaveLength(24);
    for (const p of g.tableau) expect(p.map((x) => x.up)).toEqual(p.map((_, i) => i === p.length - 1));
  });

  it('follows tableau and foundation rules', () => {
    expect(canTableau(c(12, 1), [c(13, 0)])).toBe(true); // red Q on black K
    expect(canTableau(c(12, 0), [c(13, 3)])).toBe(false); // same color
    expect(canTableau(c(13, 0), [])).toBe(true);
    expect(canTableau(c(12, 0), [])).toBe(false);
    expect(canFoundation(c(1, 2), [])).toBe(true);
    expect(canFoundation(c(2, 2), [c(1, 2)])).toBe(true);
    expect(canFoundation(c(2, 1), [c(1, 2)])).toBe(false);
  });

  it('moves runs and flips the uncovered card', () => {
    const g = empty();
    g.tableau[0] = [c(5, 0, false), c(13, 0), c(12, 1)];
    const r = move(g, { kind: 'tableau', i: 0, index: 1 }, { kind: 'tableau', i: 1 })!;
    expect(r.tableau[1].map((x) => x.rank)).toEqual([13, 12]);
    expect(r.tableau[0][0].up).toBe(true);
    expect(r.score).toBe(5);
    expect(move(g, { kind: 'tableau', i: 0, index: 0 }, { kind: 'tableau', i: 2 })).toBeNull(); // face-down
  });

  it('draws and recycles the stock', () => {
    const g = empty();
    g.stock = [c(1, 0, false), c(2, 0, false)];
    const a = drawCards(g);
    expect(a.waste.map((x) => x.rank)).toEqual([2]);
    const b = drawCards(drawCards(a));
    expect(b.stock).toHaveLength(2);
    expect(b.waste).toHaveLength(0);
  });

  it('auto-plays to the foundation and detects a win', () => {
    let g = empty();
    g.foundations = [0, 1, 2, 3].map((s) => Array.from({ length: s === 3 ? 12 : 13 }, (_, i) => c(i + 1, s as Card['suit'])));
    g.waste = [c(13, 3)];
    g = autoFoundation(g, { kind: 'waste' })!;
    expect(isWon(g)).toBe(true);
  });
});

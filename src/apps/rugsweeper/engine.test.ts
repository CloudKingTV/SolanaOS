import { describe, expect, it } from 'vitest';
import { chord, cycleMark, flagsLeft, neighbors, newBoard, plant, reveal } from './engine';

// Deterministic RNG for reproducible boards.
function seeded(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

describe('rugsweeper', () => {
  it('never places a rug on or next to the first click', () => {
    for (let s = 1; s < 30; s++) {
      const b = plant(newBoard(9, 9, 10), 40, seeded(s));
      expect(b.cells.filter((c) => c.rug)).toHaveLength(10);
      for (const i of [40, ...neighbors(b, 40)]) expect(b.cells[i].rug).toBe(false);
    }
  });

  it('flood-fills empty regions on the first click', () => {
    const b = reveal(newBoard(9, 9, 10), 40, seeded(7));
    expect(b.status).toBe('playing');
    expect(b.cells.filter((c) => c.open).length).toBeGreaterThan(1);
  });

  it('loses when a rug is revealed', () => {
    let b = reveal(newBoard(9, 9, 10), 40, seeded(3));
    const rug = b.cells.findIndex((c) => c.rug);
    b = reveal(b, rug);
    expect(b.status).toBe('lost');
    expect(b.boom).toBe(rug);
  });

  it('wins when every safe square is open', () => {
    let b = reveal(newBoard(9, 9, 10), 40, seeded(5));
    b.cells.forEach((c, i) => {
      if (!c.rug && !b.cells[i].open) b = reveal(b, i);
    });
    expect(b.status).toBe('won');
    expect(flagsLeft(b)).toBe(0);
  });

  it('cycles flag → question → none, and flags block reveal', () => {
    let b = plant(newBoard(9, 9, 10), 40, seeded(9));
    b = cycleMark(b, 0);
    expect(b.cells[0].mark).toBe(1);
    expect(reveal(b, 0).cells[0].open).toBe(false);
    b = cycleMark(cycleMark(b, 0), 0);
    expect(b.cells[0].mark).toBe(0);
  });

  it('chords around a satisfied number', () => {
    let b = reveal(newBoard(9, 9, 10), 40, seeded(11));
    const i = b.cells.findIndex((c, k) => c.open && c.adj > 0 && neighbors(b, k).some((n) => !b.cells[n].open && !b.cells[n].rug));
    for (const n of neighbors(b, i)) if (b.cells[n].rug) b = cycleMark(b, n);
    const after = chord(b, i);
    for (const n of neighbors(b, i)) if (!after.cells[n].rug) expect(after.cells[n].open).toBe(true);
  });
});

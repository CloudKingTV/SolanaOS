// "Solana Radio": generative music whose density follows the network's live TPS.
// Pure note generation lives here so it can be tested; scheduling is in Solamp.

export interface RadioNote {
  /** Seconds from the start of the beat. */
  at: number;
  midi: number;
  dur: number;
  gain: number;
  kind: 'lead' | 'bass' | 'pad';
}

// A minor pentatonic over two octaves: always consonant, never wrong.
const SCALE = [0, 3, 5, 7, 10];
export const ROOT = 57; // A3

export function scaleNote(step: number): number {
  const octave = Math.floor(step / SCALE.length);
  const idx = ((step % SCALE.length) + SCALE.length) % SCALE.length;
  return ROOT + octave * 12 + SCALE[idx];
}

/** Lead notes per beat from TPS: quiet chain → sparse, busy chain → up to 6 notes. */
export function densityFor(tps: number): number {
  if (!Number.isFinite(tps) || tps <= 0) return 1;
  return Math.max(1, Math.min(6, Math.round(Math.log2(tps / 250 + 1) * 1.6)));
}

/** Small deterministic PRNG so the same slot always sounds the same. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Notes for one beat. `beat` counts beats since the radio started; `seed` should change slowly
 * (e.g. the current slot divided by 64) so the melody wanders with the chain.
 */
export function beatNotes(beat: number, tps: number, seed: number, beatLength = 0.5): RadioNote[] {
  const rand = mulberry32(seed * 7919 + beat * 104729);
  const notes: RadioNote[] = [];
  const n = densityFor(tps);
  let step = 5 + Math.floor(rand() * 5);
  for (let i = 0; i < n; i++) {
    step += Math.floor(rand() * 5) - 2;
    step = Math.max(0, Math.min(10, step));
    notes.push({ at: (i * beatLength) / n, midi: scaleNote(step), dur: (beatLength / n) * 1.6, gain: 0.18 + rand() * 0.08, kind: 'lead' });
  }
  if (beat % 2 === 0) notes.push({ at: 0, midi: ROOT - 12 + SCALE[[0, 0, 3, 4][Math.floor(beat / 8) % 4]], dur: beatLength * 1.9, gain: 0.3, kind: 'bass' });
  if (beat % 8 === 0) {
    for (const s of [0, 2, 4]) notes.push({ at: 0, midi: scaleNote(s + 5), dur: beatLength * 8, gain: 0.05, kind: 'pad' });
  }
  return notes;
}

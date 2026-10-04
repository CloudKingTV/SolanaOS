import { describe, expect, it } from 'vitest';
import { ROOT, beatNotes, densityFor, scaleNote } from './radio';
import { audioFromJson, toHttps } from '../solana/metadata';

describe('Solana Radio', () => {
  it('maps TPS to note density', () => {
    expect(densityFor(0)).toBe(1);
    expect(densityFor(NaN)).toBe(1);
    expect(densityFor(500)).toBeLessThan(densityFor(5000));
    expect(densityFor(1e9)).toBe(6);
  });

  it('stays inside the pentatonic scale', () => {
    const allowed = new Set([0, 3, 5, 7, 10]);
    for (let beat = 0; beat < 64; beat++) {
      for (const n of beatNotes(beat, 3000, 42)) expect(allowed.has((((n.midi - ROOT) % 12) + 12) % 12)).toBe(true);
    }
    expect(scaleNote(5)).toBe(ROOT + 12);
  });

  it('is deterministic for the same slot and beat', () => {
    expect(beatNotes(3, 2000, 9)).toEqual(beatNotes(3, 2000, 9));
    expect(beatNotes(3, 2000, 9)).not.toEqual(beatNotes(3, 2000, 10));
  });
});

describe('music NFT metadata', () => {
  it('finds audio in files or animation_url', () => {
    expect(audioFromJson({ properties: { files: [{ uri: 'https://x/cover.png', type: 'image/png' }, { uri: 'ar://abc', type: 'audio/mpeg' }] } })).toBe('https://arweave.net/abc');
    expect(audioFromJson({ animation_url: 'ipfs://Qm1/song.mp3' })).toBe('https://ipfs.io/ipfs/Qm1/song.mp3');
    expect(audioFromJson({ animation_url: 'https://x/viewer.html' })).toBeUndefined();
    expect(audioFromJson({ animation_url: 'https://x/track', properties: { category: 'audio' } })).toBe('https://x/track');
  });

  it('rejects non-https links', () => {
    expect(toHttps('javascript:alert(1)')).toBeUndefined();
    expect(toHttps('http://x/a.mp3')).toBeUndefined();
  });
});

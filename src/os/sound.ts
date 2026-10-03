// All system sounds are synthesized with Web Audio — no recorded assets.
import { useSettings } from './settings';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (useSettings.getState().muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

interface Note {
  freq: number;
  start: number;
  dur: number;
  gain?: number;
  type?: OscillatorType;
  detune?: number;
}

function play(notes: Note[], master = 0.18) {
  const ac = audio();
  if (!ac) return;
  const out = ac.createGain();
  out.gain.value = master;
  // A short feedback delay gives the chimes a bit of space.
  const delay = ac.createDelay();
  delay.delayTime.value = 0.18;
  const fb = ac.createGain();
  fb.gain.value = 0.25;
  delay.connect(fb).connect(delay);
  out.connect(ac.destination);
  out.connect(delay).connect(ac.destination);
  const t0 = ac.currentTime + 0.02;
  for (const n of notes) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = n.type ?? 'sine';
    osc.frequency.value = n.freq;
    if (n.detune) osc.detune.value = n.detune;
    const peak = n.gain ?? 0.5;
    const s = t0 + n.start;
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(peak, s + Math.min(0.08, n.dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, s + n.dur);
    osc.connect(g).connect(out);
    osc.start(s);
    osc.stop(s + n.dur + 0.05);
  }
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

function pad(midis: number[], start: number, dur: number, gain = 0.12): Note[] {
  return midis.flatMap((m) => [
    { freq: hz(m), start, dur, gain, type: 'triangle' as const, detune: -6 },
    { freq: hz(m), start, dur, gain: gain * 0.8, type: 'sine' as const, detune: 6 },
  ]);
}

export const sounds = {
  startup() {
    // A rising, airy swell resolving to a major chord, followed by a bell motif.
    play(
      [
        ...pad([51, 58, 63, 67], 0, 2.4, 0.1),
        ...pad([56, 60, 63, 68], 1.0, 2.6, 0.1),
        ...pad([51, 58, 63, 67, 70], 2.0, 3.2, 0.11),
        { freq: hz(75), start: 0.9, dur: 1.4, gain: 0.35 },
        { freq: hz(79), start: 1.25, dur: 1.4, gain: 0.3 },
        { freq: hz(82), start: 1.6, dur: 1.6, gain: 0.3 },
        { freq: hz(87), start: 2.05, dur: 2.6, gain: 0.32 },
        { freq: hz(39), start: 2.0, dur: 3.0, gain: 0.25, type: 'sine' },
      ],
      0.22,
    );
  },
  shutdown() {
    play(
      [
        ...pad([63, 67, 70], 0, 1.6, 0.1),
        { freq: hz(82), start: 0, dur: 0.9, gain: 0.3 },
        { freq: hz(79), start: 0.3, dur: 0.9, gain: 0.3 },
        { freq: hz(75), start: 0.6, dur: 1.0, gain: 0.3 },
        { freq: hz(70), start: 0.9, dur: 1.6, gain: 0.3 },
        ...pad([51, 58, 63], 0.9, 2.0, 0.1),
      ],
      0.22,
    );
  },
  logon() {
    play([
      { freq: hz(75), start: 0, dur: 0.6, gain: 0.3 },
      { freq: hz(82), start: 0.12, dur: 0.9, gain: 0.3 },
    ]);
  },
  ding() {
    play([
      { freq: hz(88), start: 0, dur: 0.7, gain: 0.35 },
      { freq: hz(81), start: 0.09, dur: 0.9, gain: 0.3 },
    ]);
  },
  error() {
    play([
      { freq: hz(64), start: 0, dur: 0.5, gain: 0.35, type: 'triangle' },
      { freq: hz(57), start: 0.1, dur: 0.7, gain: 0.35, type: 'triangle' },
    ]);
  },
  notify() {
    play([
      { freq: hz(84), start: 0, dur: 0.35, gain: 0.25 },
      { freq: hz(91), start: 0.1, dur: 0.6, gain: 0.25 },
    ]);
  },
  click() {
    play([{ freq: 1800, start: 0, dur: 0.03, gain: 0.08, type: 'square' }], 0.1);
  },
  boom() {
    const ac = audio();
    if (!ac) return;
    const len = Math.floor(ac.sampleRate * 0.6);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    const g = ac.createGain();
    g.gain.value = 0.5;
    src.connect(filter).connect(g).connect(ac.destination);
    src.start();
  },
};

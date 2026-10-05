// Phones put Web Audio on the "ringer" channel: on iPhone, the silent switch mutes it completely,
// while <audio> elements (the "media" channel) keep playing. A media player has to opt into
// playback mode, either with the Audio Session API or by keeping a silent <audio> loop running.

interface AudioSessionNavigator {
  audioSession?: { type: string };
}

function silentWav(seconds = 1, rate = 8000): string {
  const n = Math.round(seconds * rate);
  const bytes = new Uint8Array(44 + n);
  const v = new DataView(bytes.buffer);
  const text = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  v.setUint32(4, 36 + n, true);
  text(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  text(36, 'data');
  v.setUint32(40, n, true);
  bytes.fill(128, 44); // 8-bit silence
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

let keepAlive: HTMLAudioElement | null = null;

/** Call from a tap/click handler, before starting playback. */
export function enterPlaybackMode(): void {
  const nav = navigator as Navigator & AudioSessionNavigator;
  try {
    if (nav.audioSession) nav.audioSession.type = 'playback';
  } catch {
    // Older browsers: the silent loop below does the job.
  }
  if (!keepAlive) {
    keepAlive = new Audio(silentWav());
    keepAlive.loop = true;
    keepAlive.setAttribute('playsinline', '');
  }
  void keepAlive.play().catch(() => {});
}

export function leavePlaybackMode(): void {
  keepAlive?.pause();
  const nav = navigator as Navigator & AudioSessionNavigator;
  try {
    if (nav.audioSession) nav.audioSession.type = 'auto';
  } catch {
    // Ignore.
  }
}

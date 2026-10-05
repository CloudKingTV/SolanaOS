import { useCallback, useEffect, useRef, useState } from 'react';
import { closeWindow, type AppProps } from '../../os/windows';
import { useWallet } from '../../os/wallet/standard';
import { isCollectible, tokenLabel, usePortfolio } from '../../os/wallet/portfolio';
import { getCoreAssets } from '../../os/nft/core';
import { audioFromJson, getTokenJson } from '../../os/solana/metadata';
import { getRecentPerformanceSamples, getSlot, tpsFromSamples } from '../../os/solana/rpc';
import { beatNotes } from '../../os/media/radio';
import { enterPlaybackMode, leavePlaybackMode } from '../../os/media/unlock';
import { messageBox } from '../../os/dialogs';
import { useSettings } from '../../os/settings';
import { MenuBar, sep } from '../../shell/Menu';

interface Track {
  id: string;
  title: string;
  kind: 'file' | 'nft' | 'radio';
  src?: string;
}

const RADIO: Track = { id: 'radio', title: 'Solana Radio — live from the network', kind: 'radio' };
const BEAT = 0.5;
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const fmt = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

export function Solamp({ windowId }: AppProps) {
  const [tracks, setTracks] = useState<Track[]>([RADIO]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [tps, setTps] = useState<number | null>(null);
  const [status, setStatus] = useState('Stopped');
  const [scanning, setScanning] = useState(false);
  const owner = useWallet((s) => s.connection?.address ?? null);
  const holdings = usePortfolio((s) => s.tokens);
  const muted = useSettings((s) => s.muted);

  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const radioBusRef = useRef<AudioNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const routedRef = useRef<HTMLAudioElement | null>(null); // goes through the visualizer
  const plainRef = useRef<HTMLAudioElement | null>(null); // fallback for hosts without CORS
  const usingPlain = useRef(false);
  const radioTimer = useRef<number | undefined>(undefined);
  const radioState = useRef({ beat: 0, nextTime: 0, seed: 1, tps: 1500 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const objectUrls = useRef<string[]>([]);

  const track = tracks[Math.min(index, tracks.length - 1)];

  const audio = useCallback(() => {
    if (!ctxRef.current) {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.gain.value = muted ? 0 : volume;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      gain.connect(analyser).connect(ctx.destination);
      // The radio's synth voices get evened out and brought up to a phone-speaker-friendly level.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -24;
      comp.ratio.value = 4;
      const makeup = ctx.createGain();
      makeup.gain.value = 2.2;
      comp.connect(makeup).connect(gain);
      radioBusRef.current = comp;
      const el = new Audio();
      el.crossOrigin = 'anonymous';
      ctx.createMediaElementSource(el).connect(gain);
      ctxRef.current = ctx;
      gainRef.current = gain;
      analyserRef.current = analyser;
      routedRef.current = el;
      plainRef.current = new Audio();
    }
    if (ctxRef.current.state !== 'running') void ctxRef.current.resume().catch(() => {});
    return ctxRef.current;
  }, [muted, volume]);

  // Volume (and the system mute switch).
  useEffect(() => {
    const v = muted ? 0 : volume;
    if (gainRef.current) gainRef.current.gain.value = v;
    if (plainRef.current) plainRef.current.volume = v;
  }, [volume, muted]);

  const stopRadio = () => {
    window.clearInterval(radioTimer.current);
    radioTimer.current = undefined;
  };

  const stopAll = useCallback(() => {
    stopRadio();
    for (const el of [routedRef.current, plainRef.current]) {
      if (el) {
        el.pause();
        el.removeAttribute('src');
        el.load();
      }
    }
    setPlaying(false);
    setTime(0);
  }, []);

  const startRadio = () => {
    const ctx = audio();
    const st = radioState.current;
    st.beat = 0;
    st.nextTime = ctx.currentTime + 0.1;
    const t0 = ctx.currentTime;
    const tick = () => {
      const c = ctxRef.current!;
      while (st.nextTime < c.currentTime + 0.3) {
        for (const n of beatNotes(st.beat, st.tps, st.seed, BEAT)) {
          const osc = c.createOscillator();
          const g = c.createGain();
          // Sawtooth bass has the harmonics that let small speakers "hear" the low notes.
          osc.type = n.kind === 'bass' ? 'sawtooth' : n.kind === 'pad' ? 'triangle' : 'square';
          osc.frequency.value = hz(n.midi);
          const start = st.nextTime + n.at;
          const peak = n.kind === 'lead' ? n.gain * 0.5 : n.kind === 'pad' ? n.gain * 2 : n.gain * 0.6;
          g.gain.setValueAtTime(0, start);
          g.gain.linearRampToValueAtTime(peak, start + Math.min(0.02, n.dur / 4));
          g.gain.exponentialRampToValueAtTime(0.0001, start + n.dur);
          let out: AudioNode = g;
          if (n.kind !== 'pad') {
            const lp = c.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = n.kind === 'bass' ? 900 : 3200;
            g.connect(lp);
            out = lp;
          }
          osc.connect(g);
          out.connect(radioBusRef.current!);
          osc.start(start);
          osc.stop(start + n.dur + 0.05);
        }
        st.beat++;
        st.nextTime += BEAT;
      }
      setTime(c.currentTime - t0);
    };
    tick();
    radioTimer.current = window.setInterval(tick, 100);
    setDuration(0);
  };

  // Keep the radio fed with live TPS and a slowly changing seed.
  useEffect(() => {
    let live = true;
    const refresh = () => {
      void getRecentPerformanceSamples(5)
        .then((s) => {
          const t = tpsFromSamples(s);
          const v = t[t.length - 1];
          if (live && v) {
            setTps(v);
            radioState.current.tps = v;
          }
        })
        .catch(() => {});
      void getSlot()
        .then((slot) => {
          radioState.current.seed = Math.floor(slot / 64);
        })
        .catch(() => {});
    };
    refresh();
    const t = window.setInterval(refresh, 60_000);
    return () => {
      live = false;
      window.clearInterval(t);
    };
  }, []);

  const play = useCallback(
    async (i = index) => {
      const t = tracks[i];
      if (!t) return;
      stopAll();
      setIndex(i);
      // Must run inside the tap: switches phones to media playback (iPhone silent switch).
      enterPlaybackMode();
      const ctx = audio();
      window.setTimeout(() => {
        if (ctx.state !== 'running') setStatus('Tap ▶ again for sound');
      }, 800);
      if (t.kind === 'radio') {
        startRadio();
        setPlaying(true);
        setStatus('Playing');
        return;
      }
      const routed = routedRef.current!;
      const plain = plainRef.current!;
      usingPlain.current = false;
      routed.src = t.src!;
      try {
        await routed.play();
      } catch {
        // The host doesn't allow cross-origin audio analysis; play without the visualizer.
        usingPlain.current = true;
        plain.src = t.src!;
        plain.volume = muted ? 0 : volume;
        try {
          await plain.play();
        } catch {
          setStatus("Can't play this track");
          return;
        }
      }
      setPlaying(true);
      setStatus('Playing');
    },
    // startRadio uses refs only.
    [index, tracks, stopAll, audio, muted, volume],
  );

  const pause = () => {
    if (track.kind === 'radio') {
      stopAll();
      leavePlaybackMode();
      setStatus('Stopped');
      return;
    }
    const el = usingPlain.current ? plainRef.current : routedRef.current;
    if (!el) return;
    if (el.paused) {
      enterPlaybackMode();
      void el.play();
      setPlaying(true);
      setStatus('Playing');
    } else {
      el.pause();
      leavePlaybackMode();
      setPlaying(false);
      setStatus('Paused');
    }
  };

  const stop = () => {
    stopAll();
    leavePlaybackMode();
    setStatus('Stopped');
  };
  const next = () => void play((index + 1) % tracks.length);
  const prev = () => void play((index - 1 + tracks.length) % tracks.length);

  // Progress + auto-advance for file/NFT tracks.
  useEffect(() => {
    const els = [routedRef.current, plainRef.current].filter(Boolean) as HTMLAudioElement[];
    const onTime = (e: Event) => {
      const el = e.target as HTMLAudioElement;
      setTime(el.currentTime);
      setDuration(el.duration || 0);
    };
    const onEnded = () => next();
    for (const el of els) {
      el.addEventListener('timeupdate', onTime);
      el.addEventListener('ended', onEnded);
    }
    return () => {
      for (const el of els) {
        el.removeEventListener('timeupdate', onTime);
        el.removeEventListener('ended', onEnded);
      }
    };
  });

  // Visualizer.
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const c = canvasRef.current;
      const g = c?.getContext('2d');
      if (c && g) {
        const w = c.width;
        const h = c.height;
        g.fillStyle = '#05030f';
        g.fillRect(0, 0, w, h);
        const bars = 24;
        const data = new Uint8Array(64);
        if (analyserRef.current && !usingPlain.current) analyserRef.current.getByteFrequencyData(data);
        else if (playing) for (let i = 0; i < 64; i++) data[i] = 80 + Math.sin(Date.now() / 180 + i) * 60 + Math.random() * 40;
        for (let i = 0; i < bars; i++) {
          const v = data[Math.floor((i * 48) / bars)] / 255;
          const bh = Math.max(1, Math.round(v * h));
          const grad = g.createLinearGradient(0, h, 0, 0);
          grad.addColorStop(0, '#14F195');
          grad.addColorStop(0.6, '#9945FF');
          grad.addColorStop(1, '#ff5ad1');
          g.fillStyle = grad;
          g.fillRect(i * (w / bars) + 1, h - bh, w / bars - 2, bh);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // Clean up audio when the window closes.
  useEffect(
    () => () => {
      stopRadio();
      leavePlaybackMode();
      routedRef.current?.pause();
      plainRef.current?.pause();
      void ctxRef.current?.close();
      for (const u of objectUrls.current) URL.revokeObjectURL(u);
    },
    [],
  );

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const added: Track[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('audio/') && !/\.(mp3|wav|ogg|flac|m4a|aac|opus)$/i.test(f.name)) continue;
      const url = URL.createObjectURL(f);
      objectUrls.current.push(url);
      added.push({ id: url, title: f.name.replace(/\.[^.]+$/, ''), kind: 'file', src: url });
    }
    if (added.length) setTracks((t) => [...t, ...added]);
  };

  const addNfts = async () => {
    if (!owner) {
      void messageBox({ title: 'Solamp', icon: 'info', message: 'Connect a wallet to load your music NFTs.', owner: windowId });
      return;
    }
    setScanning(true);
    try {
      const candidates: { id: string; title: string; uri: string }[] = holdings
        .filter(isCollectible)
        .filter((h) => h.meta?.uri)
        .map((h) => ({ id: h.mint, title: h.meta?.name || tokenLabel(h), uri: h.meta!.uri }));
      const core = await getCoreAssets(owner).catch(() => []);
      candidates.push(...core.map((a) => ({ id: a.address, title: a.name, uri: a.uri })));
      const found: Track[] = [];
      for (const c of candidates.slice(0, 100)) {
        const src = audioFromJson(await getTokenJson(c.uri));
        if (src) found.push({ id: c.id, title: c.title, kind: 'nft', src });
      }
      const fresh = found.filter((f) => !tracks.some((t) => t.id === f.id));
      setTracks((t) => [...t, ...fresh]);
      void messageBox({
        title: 'Solamp',
        icon: 'info',
        message: found.length ? `Added ${fresh.length} music NFT(s) to the playlist.` : `No music NFTs found in your wallet (checked ${candidates.length} collectible(s)).`,
        owner: windowId,
      });
    } finally {
      setScanning(false);
    }
  };

  const remove = (i: number) => {
    const t = tracks[i];
    if (t.kind === 'radio') return;
    if (i === index) stop();
    setTracks((ts) => ts.filter((_, k) => k !== i));
    if (i < index) setIndex((x) => x - 1);
    if (t.kind === 'file' && t.src) URL.revokeObjectURL(t.src);
  };

  const seek = (v: number) => {
    const el = usingPlain.current ? plainRef.current : routedRef.current;
    if (el && track.kind !== 'radio' && Number.isFinite(el.duration)) el.currentTime = v;
  };

  return (
    <div className="solamp">
      <MenuBar
        menus={[
          {
            label: 'File',
            items: [
              { label: 'Add Music Files...', onClick: () => fileInput.current?.click() },
              { label: 'Add My Music NFTs', disabled: !owner, onClick: () => void addNfts() },
              sep,
              { label: 'Exit', onClick: () => closeWindow(windowId) },
            ],
          },
          {
            label: 'Play',
            items: [
              { label: playing ? 'Pause' : 'Play', onClick: () => (playing ? pause() : void play()) },
              { label: 'Stop', onClick: stop },
              { label: 'Next', onClick: next },
              { label: 'Previous', onClick: prev },
            ],
          },
        ]}
      />
      <div className="sa-main">
        <div className="sa-display">
          <div className="sa-lcd">
            <span className="sa-time">{track.kind === 'radio' && playing ? 'LIVE' : fmt(time)}</span>
            <span className="sa-state">{muted ? 'Muted' : status}</span>
          </div>
          <div className="sa-marquee" title={track.title}>
            <span>{track.title}</span>
          </div>
          <div className="sa-info">
            {muted ? 'Sound is off. Tap the speaker in the taskbar.' : track.kind === 'radio' ? `TPS ${tps ? Math.round(tps).toLocaleString('en-US') : '…'} · notes follow the chain` : track.kind === 'nft' ? 'Music NFT' : 'Local file'}
          </div>
        </div>
        <canvas ref={canvasRef} className="sa-viz" width={100} height={64} aria-hidden="true" />
      </div>
      <input
        type="range"
        className="sa-seek"
        min={0}
        max={duration || 1}
        step={0.1}
        value={track.kind === 'radio' ? 0 : time}
        disabled={track.kind === 'radio' || !duration}
        onChange={(e) => seek(Number(e.target.value))}
        aria-label="Seek"
      />
      <div className="sa-controls">
        <button type="button" className="sa-btn" onClick={prev} aria-label="Previous">⏮</button>
        <button type="button" className="sa-btn" onClick={() => void play()} aria-label="Play">▶</button>
        <button type="button" className="sa-btn" onClick={pause} aria-label="Pause">❚❚</button>
        <button type="button" className="sa-btn" onClick={stop} aria-label="Stop">■</button>
        <button type="button" className="sa-btn" onClick={next} aria-label="Next">⏭</button>
        <button type="button" className="sa-btn eject" onClick={() => fileInput.current?.click()} aria-label="Add files">⏏</button>
        <label className="sa-volume">
          <span>Vol</span>
          <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Volume" />
        </label>
      </div>
      <div className="sa-playlist">
        <div className="sa-pl-head">Playlist</div>
        <ol>
          {tracks.map((t, i) => (
            <li
              key={t.id}
              className={i === index ? 'current' : ''}
              onDoubleClick={() => void play(i)}
              onContextMenu={(e) => {
                e.preventDefault();
                remove(i);
              }}
              title={t.kind === 'radio' ? 'Generated live from Solana network activity' : 'Double-click to play, right-click to remove'}
            >
              <span>
                {i + 1}. {t.title}
              </span>
              <small>{t.kind === 'radio' ? '∞' : t.kind === 'nft' ? 'NFT' : ''}</small>
            </li>
          ))}
        </ol>
        <div className="sa-pl-buttons">
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
            + Files
          </button>
          <button type="button" className="btn" disabled={!owner || scanning} onClick={() => void addNfts()}>
            {scanning ? 'Scanning…' : '+ My NFTs'}
          </button>
        </div>
      </div>
      <input ref={fileInput} type="file" accept="audio/*" multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ''))} />
    </div>
  );
}

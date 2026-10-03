import { useEffect, useRef, useState } from 'react';
import { setPhase } from '../os/session';
import { clusterLabel, endpointHost, rpcUrlFor, useSettings } from '../os/settings';
import { getEpochInfo, getVersion } from '../os/solana/rpc';
import { SolanaLogo } from './icons';

type Line = { text: string; value?: string };

const pad = (label: string) => `${label} `.padEnd(30, '.');

/** BIOS-style POST screen followed by the logo + progress bar. */
export function Boot() {
  const settings = useSettings.getState();
  const [stage, setStage] = useState<'post' | 'logo'>(settings.fastBoot ? 'logo' : 'post');
  const [lines, setLines] = useState<Line[]>([]);
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    setPhase('welcome');
  };

  useEffect(() => {
    if (stage !== 'post') return;
    let cancelled = false;
    const add = (l: Line) => !cancelled && setLines((ls) => [...ls, l]);
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const withTimeout = <T,>(p: Promise<T>, ms = 2500) =>
      Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

    (async () => {
      add({ text: 'SolanaOS BIOS v1.0  —  Proof of History Edition' });
      add({ text: 'Copyright (C) 2026 SolanaOS contributors' });
      add({ text: '' });
      await sleep(250);
      add({ text: pad('Memory test'), value: `${(navigator as { deviceMemory?: number }).deviceMemory ?? 8} GB OK` });
      await sleep(150);
      add({ text: pad('Cluster'), value: clusterLabel(settings.cluster) });
      add({ text: pad('RPC endpoint'), value: endpointHost(rpcUrlFor(settings)) });
      await sleep(150);
      const [version, epoch] = await Promise.allSettled([withTimeout(getVersion()), withTimeout(getEpochInfo())]);
      if (version.status === 'fulfilled') add({ text: pad('Validator software'), value: `solana-core ${version.value['solana-core']}` });
      if (epoch.status === 'fulfilled') {
        const e = epoch.value;
        add({ text: pad('Current slot'), value: e.absoluteSlot.toLocaleString('en-US') });
        add({ text: pad('Epoch'), value: `${e.epoch} (${((e.slotIndex / e.slotsInEpoch) * 100).toFixed(1)}% complete)` });
      } else {
        add({ text: pad('Cluster handshake'), value: 'OFFLINE — continuing without network' });
      }
      await sleep(200);
      add({ text: '' });
      add({ text: 'Starting SolanaOS...' });
      await sleep(700);
      if (!cancelled) setStage('logo');
    })();
    return () => {
      cancelled = true;
    };
  }, [stage, settings]);

  useEffect(() => {
    if (stage !== 'logo') return;
    const t = setTimeout(finish, 3200);
    return () => clearTimeout(t);
  });

  useEffect(() => {
    const skip = () => finish();
    window.addEventListener('keydown', skip);
    return () => window.removeEventListener('keydown', skip);
  });

  if (stage === 'post') {
    return (
      <div className="boot-post" onClick={() => setStage('logo')}>
        <div className="boot-post-logo">
          <SolanaLogo size={56} />
        </div>
        {lines.map((l, i) => (
          <div key={i} className="boot-post-line">
            {l.text || '\u00a0'}
            {l.value && <span className="boot-post-value"> {l.value}</span>}
          </div>
        ))}
        <div className="boot-post-hint">Press any key or click to skip</div>
      </div>
    );
  }

  return (
    <div className="boot-logo" onClick={finish}>
      <div className="boot-brand">
        <SolanaLogo size={84} />
        <div className="boot-wordmark">
          <span className="boot-wordmark-name">
            Solana<span>OS</span>
          </span>
          <span className="boot-wordmark-edition">Proof of History Edition</span>
        </div>
      </div>
      <div className="boot-bar" role="progressbar" aria-label="Starting SolanaOS">
        <div className="boot-bar-blocks">
          <i />
          <i />
          <i />
        </div>
      </div>
      <div className="boot-footer-left">Copyright © 2026 SolanaOS contributors</div>
      <div className="boot-footer-right">Community Edition</div>
    </div>
  );
}

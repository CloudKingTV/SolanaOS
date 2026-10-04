import { useCallback, useEffect, useState } from 'react';
import { closeWindow, focusWindow, getApp, openApp, useWindows, type AppProps } from '../../os/windows';
import { clusterLabel, endpointHost, rpcUrlFor, useSettings } from '../../os/settings';
import {
  getEpochInfo,
  getRecentPerformanceSamples,
  getVersion,
  tpsFromSamples,
  type EpochInfo,
  type PerfSample,
} from '../../os/solana/rpc';
import { MenuBar, sep } from '../../shell/Menu';
import { ValidatorList } from '../../shell/ValidatorList';
import { getValidators, type Validator } from '../../os/solana/validators';
import { Icon } from '../../shell/icons';

type Tab = 'applications' | 'performance' | 'validators';

function Graph({ values, max, label }: { values: number[]; max: number; label: string }) {
  const W = 300;
  const H = 90;
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * W},${H - (Math.min(v, max) / max) * (H - 4) - 2}`);
  return (
    <svg className="nm-graph" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <rect width={W} height={H} fill="#000" />
      {Array.from({ length: 12 }, (_, i) => (
        <line key={`v${i}`} x1={(i * W) / 12} x2={(i * W) / 12} y1="0" y2={H} stroke="#008040" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <line key={`h${i}`} y1={(i * H) / 6} y2={(i * H) / 6} x1="0" x2={W} stroke="#008040" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      ))}
      {values.length > 1 && (
        <polyline points={pts.join(' ')} fill="none" stroke="#14F195" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}

function Meter({ value, max, text }: { value: number; max: number; text: string }) {
  const filled = Math.round((Math.min(value, max) / max) * 14);
  return (
    <div className="nm-meter">
      <div className="nm-meter-bars">
        {Array.from({ length: 14 }, (_, i) => (
          <i key={i} className={13 - i < filled ? 'on' : ''} />
        ))}
      </div>
      <div className="nm-meter-text">{text}</div>
    </div>
  );
}

function niceMax(values: number[]): number {
  const m = Math.max(1, ...values);
  const mag = Math.pow(10, Math.floor(Math.log10(m)));
  return Math.ceil((m * 1.15) / mag) * mag;
}

function Applications() {
  const windows = useWindows((s) => s.windows);
  const tasks = windows.filter((w) => !getApp(w.appId)?.hideInTaskbar && !w.modalFor);
  const [sel, setSel] = useState<string | null>(null);
  return (
    <div className="nm-apps">
      <div className="list-box">
        <table className="fv-table">
          <thead>
            <tr>
              <th>Task</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((w) => (
              <tr
                key={w.id}
                className={`fv-item${sel === w.id ? ' selected' : ''}`}
                onClick={() => setSel(w.id)}
                onDoubleClick={() => focusWindow(w.id)}
              >
                <td>
                  <Icon name={w.icon} size={16} /> {w.title}
                </td>
                <td>Running</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dialog-buttons">
        <button type="button" className="btn" disabled={!sel || !tasks.some((t) => t.id === sel)} onClick={() => sel && closeWindow(sel)}>
          End Task
        </button>
        <button type="button" className="btn" disabled={!sel || !tasks.some((t) => t.id === sel)} onClick={() => sel && focusWindow(sel)}>
          Switch To
        </button>
        <button type="button" className="btn" onClick={() => openApp('run')}>
          New Task...
        </button>
      </div>
    </div>
  );
}

interface PerfData {
  epoch: EpochInfo | null;
  samples: PerfSample[];
  version: string | null;
  error: string | null;
  updated: number | null;
}

function Performance({ data }: { data: PerfData }) {
  const cluster = useSettings((s) => s.cluster);
  const settings = useSettings();
  const tps = tpsFromSamples(data.samples);
  const nonVote = data.samples
    .slice()
    .reverse()
    .map((s) => (s.numNonVoteTransactions !== undefined && s.samplePeriodSecs ? s.numNonVoteTransactions / s.samplePeriodSecs : 0));
  const slotMs = data.samples
    .slice()
    .reverse()
    .map((s) => (s.numSlots ? (s.samplePeriodSecs / s.numSlots) * 1000 : 0));
  const curTps = tps[tps.length - 1] ?? 0;
  const curSlotMs = slotMs[slotMs.length - 1] ?? 0;
  const maxTps = niceMax(tps);
  const e = data.epoch;
  const pct = e ? (e.slotIndex / e.slotsInEpoch) * 100 : 0;
  const etaH = e ? ((e.slotsInEpoch - e.slotIndex) * (curSlotMs || 400)) / 3_600_000 : 0;

  return (
    <div className="nm-perf">
      {data.error && (
        <div className="nm-error">
          <Icon name="warning" size={16} /> Can't reach {endpointHost(rpcUrlFor(settings))}: {data.error}
        </div>
      )}
      <div className="nm-row">
        <fieldset className="group nm-small">
          <legend>TPS</legend>
          <Meter value={curTps} max={maxTps} text={Math.round(curTps).toLocaleString('en-US')} />
        </fieldset>
        <fieldset className="group nm-big">
          <legend>Transactions Per Second History</legend>
          <Graph values={tps} max={maxTps} label="TPS history" />
        </fieldset>
      </div>
      <div className="nm-row">
        <fieldset className="group nm-small">
          <legend>Slot Time</legend>
          <Meter value={curSlotMs} max={800} text={`${Math.round(curSlotMs)} ms`} />
        </fieldset>
        <fieldset className="group nm-big">
          <legend>Non-Vote TPS History</legend>
          <Graph values={nonVote} max={niceMax(nonVote)} label="Non-vote TPS history" />
        </fieldset>
      </div>
      <div className="nm-row nm-stats">
        <fieldset className="group">
          <legend>Totals</legend>
          <dl>
            <dt>Slot</dt>
            <dd>{e?.absoluteSlot.toLocaleString('en-US') ?? '—'}</dd>
            <dt>Block height</dt>
            <dd>{e?.blockHeight.toLocaleString('en-US') ?? '—'}</dd>
            <dt>Transactions</dt>
            <dd>{e?.transactionCount?.toLocaleString('en-US') ?? '—'}</dd>
          </dl>
        </fieldset>
        <fieldset className="group">
          <legend>Epoch</legend>
          <dl>
            <dt>Epoch</dt>
            <dd>{e?.epoch ?? '—'}</dd>
            <dt>Progress</dt>
            <dd>{e ? `${pct.toFixed(1)}%` : '—'}</dd>
            <dt>Time left</dt>
            <dd>{e ? `~${etaH >= 1 ? `${etaH.toFixed(1)} h` : `${Math.round(etaH * 60)} min`}` : '—'}</dd>
          </dl>
          <div className="progress small" aria-label="Epoch progress">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </fieldset>
        <fieldset className="group">
          <legend>Cluster</legend>
          <dl>
            <dt>Cluster</dt>
            <dd>{clusterLabel(cluster)}</dd>
            <dt>Version</dt>
            <dd>{data.version ?? '—'}</dd>
            <dt>RPC</dt>
            <dd title={rpcUrlFor(settings)}>{endpointHost(rpcUrlFor(settings))}</dd>
          </dl>
        </fieldset>
      </div>
    </div>
  );
}

function Validators() {
  const [data, setData] = useState<Validator[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cluster = useSettings((s) => s.cluster);
  const rpcUrl = useSettings((s) => s.customRpcUrl);
  const load = useCallback(() => {
    setError(null);
    getValidators()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(load, [load, cluster, rpcUrl]);
  return (
    <div className="nm-validators">
      {error ? (
        <div className="fv-empty">Couldn't load validators: {error}</div>
      ) : !data ? (
        <div className="fv-empty">Loading validators…</div>
      ) : (
        <ValidatorList validators={data} onSelect={(vote) => openApp('solexplorer', { url: `sol://address/${vote}` })} />
      )}
      <div className="nm-validators-foot">
        <span>Click a validator to open it in Solana Explorer.</span>
        <button type="button" className="btn" onClick={load}>
          Refresh
        </button>
      </div>
    </div>
  );
}

export function NetworkMonitor({ windowId }: AppProps) {
  const [tab, setTab] = useState<Tab>('performance');
  const [speed, setSpeed] = useState<number>(10_000);
  const cluster = useSettings((s) => s.cluster);
  const rpcUrl = useSettings((s) => s.customRpcUrl);
  const windows = useWindows((s) => s.windows);
  const [data, setData] = useState<PerfData>({ epoch: null, samples: [], version: null, error: null, updated: null });

  const refresh = useCallback(async () => {
    const [epoch, samples, version] = await Promise.allSettled([getEpochInfo(), getRecentPerformanceSamples(60), getVersion()]);
    setData((d) => {
      const err = [epoch, samples].find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      return {
        epoch: epoch.status === 'fulfilled' ? epoch.value : d.epoch,
        samples: samples.status === 'fulfilled' ? samples.value : d.samples,
        version: version.status === 'fulfilled' ? version.value['solana-core'] : d.version,
        error: err ? (err.reason instanceof Error ? err.reason.message : String(err.reason)) : null,
        updated: Date.now(),
      };
    });
  }, []);

  useEffect(() => {
    // Switching clusters starts the graphs over.
    setData({ epoch: null, samples: [], version: null, error: null, updated: null });
    void refresh();
  }, [refresh, cluster, rpcUrl]);

  useEffect(() => {
    if (!speed) return;
    const t = setInterval(() => void refresh(), speed);
    return () => clearInterval(t);
  }, [refresh, speed]);

  const tps = tpsFromSamples(data.samples);
  const cur = tps[tps.length - 1];
  const pct = data.epoch ? (data.epoch.slotIndex / data.epoch.slotsInEpoch) * 100 : null;
  const taskCount = windows.filter((w) => !getApp(w.appId)?.hideInTaskbar && !w.modalFor).length;

  return (
    <div className="netmon">
      <MenuBar
        menus={[
          {
            label: 'File',
            items: [
              { label: 'New Task (Run...)', onClick: () => openApp('run') },
              sep,
              { label: 'Exit Network Monitor', onClick: () => closeWindow(windowId) },
            ],
          },
          {
            label: 'View',
            items: [
              { label: 'Refresh Now', shortcut: 'F5', onClick: () => void refresh() },
              {
                label: 'Update Speed',
                submenu: [
                  { label: 'High (5s)', checked: speed === 5000, onClick: () => setSpeed(5000) },
                  { label: 'Normal (10s)', checked: speed === 10_000, onClick: () => setSpeed(10_000) },
                  { label: 'Low (30s)', checked: speed === 30_000, onClick: () => setSpeed(30_000) },
                  { label: 'Paused', checked: speed === 0, onClick: () => setSpeed(0) },
                ],
              },
            ],
          },
          {
            label: 'Options',
            items: [{ label: 'Network Settings...', onClick: () => openApp('netsettings') }],
          },
          { label: 'Help', items: [{ label: 'About SolanaOS', onClick: () => openApp('about') }] },
        ]}
      />
      <div className="tabs">
        <div className="tab-strip" role="tablist">
          {(['applications', 'performance', 'validators'] as Tab[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' selected' : ''}`} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="tab-panel" role="tabpanel" onKeyDown={(e) => e.key === 'F5' && void refresh()}>
          {tab === 'applications' && <Applications />}
          {tab === 'performance' && <Performance data={data} />}
          {tab === 'validators' && <Validators />}
        </div>
      </div>
      <div className="status-bar">
        <span>Windows: {taskCount}</span>
        <span>TPS: {cur !== undefined ? Math.round(cur).toLocaleString('en-US') : '—'}</span>
        <span>Epoch: {pct !== null ? `${pct.toFixed(0)}%` : '—'}</span>
        <span>{clusterLabel(cluster)}</span>
      </div>
    </div>
  );
}

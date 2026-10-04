import { useState } from 'react';
import { closeWindow, type AppProps } from '../../os/windows';
import { MAINNET_ENDPOINTS, clusterLabel, endpointHost, endpointsFor, useSettings, type Cluster } from '../../os/settings';
import { probeEndpoint, rpcVia } from '../../os/solana/rpc';
import { Icon } from '../../shell/icons';

export function NetworkSettings({ windowId }: AppProps) {
  const settings = useSettings();
  const [cluster, setCluster] = useState<Cluster>(settings.cluster);
  const [custom, setCustom] = useState(settings.customRpcUrl);
  const [allowMainnet, setAllowMainnet] = useState(settings.allowMainnetTransactions);
  const [jupKey, setJupKey] = useState(settings.jupiterApiKey);
  const [test, setTest] = useState<{ state: 'idle' | 'testing' | 'ok' | 'fail'; text?: string }>({ state: 'idle' });
  const [probes, setProbes] = useState<{ host: string; ok: boolean; ms: number; detail: string }[] | null>(null);

  const url = endpointsFor({ cluster, customRpcUrl: custom })[0];
  const customValid = cluster !== 'custom' || /^https?:\/\/\S+$/i.test(custom.trim());

  const runTest = async () => {
    setTest({ state: 'testing' });
    setProbes(null);
    if (cluster === 'mainnet-beta') {
      // Check every free server so it's clear which ones work from this device and network.
      const results = await Promise.all(MAINNET_ENDPOINTS.map(async (u) => ({ host: endpointHost(u), ...(await probeEndpoint(u)) })));
      setProbes(results);
      const working = results.filter((r) => r.ok).length;
      setTest(
        working
          ? { state: 'ok', text: `${working} of ${results.length} free Mainnet servers answered. SolanaOS will use them automatically.` }
          : { state: 'fail', text: 'None of the free Mainnet servers answered from this device. Add a free RPC URL (for example from Helius) under Custom RPC.' },
      );
      return;
    }
    const t0 = performance.now();
    try {
      const slot = await rpcVia<number>(endpointsFor({ cluster, customRpcUrl: custom }), 'getSlot', []);
      const used = endpointHost(endpointsFor({ cluster, customRpcUrl: custom })[0]);
      setTest({ state: 'ok', text: `Connected to ${used} in ${Math.round(performance.now() - t0)} ms. Current slot: ${slot.toLocaleString('en-US')}.` });
    } catch (e) {
      setTest({ state: 'fail', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const apply = () => settings.update({ cluster, customRpcUrl: custom.trim(), allowMainnetTransactions: allowMainnet, jupiterApiKey: jupKey.trim() });

  return (
    <div className="net-settings">
      <div className="ns-head">
        <Icon name="globe" size={32} />
        <p>Choose which Solana cluster SolanaOS talks to. Devnet is the default. Its SOL is free and has no value.</p>
      </div>
      <fieldset className="group">
        <legend>Cluster</legend>
        {(['devnet', 'mainnet-beta', 'custom'] as Cluster[]).map((c) => (
          <label key={c} className="radio">
            <input type="radio" name={`cluster-${windowId}`} checked={cluster === c} onChange={() => setCluster(c)} />
            <span>
              <b>{clusterLabel(c)}</b>
              <small>
                {c === 'devnet'
                  ? 'Test network with free SOL. Recommended while SolanaOS is in early development.'
                  : c === 'mainnet-beta'
                    ? "The real network. SolanaOS tries several free public servers; for the most reliable experience, use your own RPC (Custom RPC)."
                    : 'Your own RPC provider (Helius, Triton, QuickNode...). Paste the full HTTPS URL, including any API key.'}
              </small>
            </span>
          </label>
        ))}
        {cluster === 'custom' && (
          <label className="field">
            <span>RPC URL:</span>
            <input value={custom} placeholder="https://..." onChange={(e) => setCustom(e.target.value)} style={{ flex: 1 }} />
          </label>
        )}
        <p className="ns-note">
          A custom URL is stored only in this browser. An API key in the URL is visible to anyone using this browser profile.
        </p>
      </fieldset>
      <fieldset className="group ns-danger">
        <legend>Transactions</legend>
        <label className="check">
          <input type="checkbox" checked={allowMainnet} onChange={(e) => setAllowMainnet(e.target.checked)} />
          <span>
            <b>Allow transactions on Mainnet</b>
            <small>
              When this is off, SolanaOS can only send, burn or close accounts on Devnet. Turn it on only if you understand
              that Mainnet transactions move real funds and can't be undone.
            </small>
          </span>
        </label>
        <label className="field">
          <span>Jupiter API key (swaps):</span>
          <input type="password" value={jupKey} onChange={(e) => setJupKey(e.target.value)} placeholder="Optional" style={{ flex: 1 }} autoComplete="off" />
        </label>
        <small className="ns-note">
          Free from{' '}
          <a href="https://portal.jup.ag" target="_blank" rel="noreferrer noopener">
            portal.jup.ag
          </a>
          . Stored only in this browser.
        </small>
      </fieldset>
      <div className="ns-test">
        <button type="button" className="btn" disabled={!customValid || !url || test.state === 'testing'} onClick={() => void runTest()}>
          Test Connection
        </button>
        <span className={`ns-test-result ${test.state}`}>
          {test.state === 'testing' ? 'Testing…' : test.text}
        </span>
      </div>
      {probes && (
        <table className="se-table ns-probes">
          <tbody>
            {probes.map((p) => (
              <tr key={p.host}>
                <td className={p.ok ? 'good' : 'bad'}>{p.ok ? '✓' : '✗'}</td>
                <td>{p.host}</td>
                <td className="ns-probe-detail" title={p.detail}>
                  {p.ok ? `${p.ms} ms` : p.detail}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="dialog-buttons">
        <button
          type="button"
          className="btn"
          disabled={!customValid}
          onClick={() => {
            apply();
            closeWindow(windowId);
          }}
        >
          OK
        </button>
        <button type="button" className="btn" onClick={() => closeWindow(windowId)}>
          Cancel
        </button>
        <button type="button" className="btn" disabled={!customValid} onClick={apply}>
          Apply
        </button>
      </div>
    </div>
  );
}

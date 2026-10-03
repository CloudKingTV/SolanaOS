import { useState } from 'react';
import { closeWindow, type AppProps } from '../../os/windows';
import { RPC_URLS, clusterLabel, useSettings, type Cluster } from '../../os/settings';
import { rpc } from '../../os/solana/rpc';
import { Icon } from '../../shell/icons';

export function NetworkSettings({ windowId }: AppProps) {
  const settings = useSettings();
  const [cluster, setCluster] = useState<Cluster>(settings.cluster);
  const [custom, setCustom] = useState(settings.customRpcUrl);
  const [allowMainnet, setAllowMainnet] = useState(settings.allowMainnetTransactions);
  const [test, setTest] = useState<{ state: 'idle' | 'testing' | 'ok' | 'fail'; text?: string }>({ state: 'idle' });

  const url = cluster === 'custom' ? custom.trim() : RPC_URLS[cluster];
  const customValid = cluster !== 'custom' || /^https?:\/\/\S+$/i.test(custom.trim());

  const runTest = async () => {
    setTest({ state: 'testing' });
    const t0 = performance.now();
    try {
      const slot = await rpc<number>('getSlot', [], url);
      setTest({ state: 'ok', text: `Connected in ${Math.round(performance.now() - t0)} ms. Current slot: ${slot.toLocaleString('en-US')}.` });
    } catch (e) {
      setTest({ state: 'fail', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const apply = () => settings.update({ cluster, customRpcUrl: custom.trim(), allowMainnetTransactions: allowMainnet });

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
                    ? "The real network. The public endpoint is rate-limited and doesn't serve NFT data."
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
      </fieldset>
      <div className="ns-test">
        <button type="button" className="btn" disabled={!customValid || !url || test.state === 'testing'} onClick={() => void runTest()}>
          Test Connection
        </button>
        <span className={`ns-test-result ${test.state}`}>
          {test.state === 'testing' ? 'Testing…' : test.text}
        </span>
      </div>
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

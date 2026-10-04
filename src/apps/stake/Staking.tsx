import { useEffect, useState } from 'react';
import { openApp, type AppProps } from '../../os/windows';
import { useWallet } from '../../os/wallet/standard';
import { refreshPortfolio } from '../../os/wallet/portfolio';
import { deactivateInstruction, getStakeAccounts, stakeStatus, withdrawInstruction, type StakeAccount } from '../../os/wallet/stake';
import { signAndSend } from '../../os/wallet/tx';
import { formatSol, getEpochInfo, shortAddress } from '../../os/solana/rpc';
import { getValidators, validatorName, type Validator } from '../../os/solana/validators';
import { clusterLabel, useSettings } from '../../os/settings';
import { messageBox } from '../../os/dialogs';
import { showBalloon } from '../../os/session';
import { Icon } from '../../shell/icons';

const STATUS_LABEL = { inactive: 'Inactive', activating: 'Activating', active: 'Active', deactivating: 'Deactivating' } as const;

export function Staking({ windowId }: AppProps) {
  const conn = useWallet((s) => s.connection);
  const cluster = useSettings((s) => s.cluster);
  const customRpc = useSettings((s) => s.customRpcUrl);
  const [accounts, setAccounts] = useState<StakeAccount[] | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [validators, setValidators] = useState<Map<string, Validator>>(new Map());

  const load = () => {
    if (!conn) return;
    setError(null);
    Promise.all([getStakeAccounts(conn.address), getEpochInfo()])
      .then(([a, e]) => {
        setAccounts(a);
        setEpoch(e.epoch);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    void getValidators()
      .then((vs) => setValidators(new Map(vs.map((v) => [v.vote, v]))))
      .catch(() => {});
  };
  const voterName = (vote: string | null) => {
    if (!vote) return '—';
    const v = validators.get(vote);
    return v ? validatorName(v) : shortAddress(vote);
  };
  useEffect(load, [conn, cluster, customRpc]);

  const sel = accounts?.find((a) => a.address === selected) ?? null;
  const status = sel ? stakeStatus(sel, epoch) : null;
  const totalStaked = (accounts ?? []).reduce((s, a) => s + a.lamports, 0);

  const act = async (kind: 'deactivate' | 'withdraw') => {
    if (!sel || !conn) return;
    const msg =
      kind === 'deactivate'
        ? `Unstake ${formatSol(sel.lamports, 6)} SOL from ${voterName(sel.voter)}?\n\nIt stops earning rewards and becomes withdrawable after the current epoch ends.`
        : `Withdraw ${formatSol(sel.lamports, 9)} SOL to your wallet and close this stake account?`;
    if ((await messageBox({ title: 'Staking', icon: 'question', message: msg, buttons: ['Yes', 'No'], owner: windowId })) !== 'Yes') return;
    setBusy(true);
    try {
      await signAndSend([kind === 'deactivate' ? deactivateInstruction(conn.address, sel.address) : withdrawInstruction(conn.address, sel.address, BigInt(sel.lamports))]);
      showBalloon({ title: 'Staking', icon: 'stake', message: kind === 'deactivate' ? 'Unstaking started.' : `Withdrew ${formatSol(sel.lamports, 6)} SOL.` });
      load();
      void refreshPortfolio();
    } catch (e) {
      void messageBox({ title: 'Staking', icon: 'error', message: e instanceof Error ? e.message : String(e), owner: windowId });
    } finally {
      setBusy(false);
    }
  };

  if (!conn) {
    return (
      <div className="explorer">
        <div className="mw-empty">
          <Icon name="stake" size={48} />
          <h2>Staking</h2>
          <p>Connect a wallet to stake SOL and see your stake accounts.</p>
          <button type="button" className="btn" onClick={() => openApp('connect')}>
            Connect Wallet...
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="explorer staking">
      <div className="toolbar">
        <button type="button" className="tool-btn" onClick={() => openApp('stake')}>
          <Icon name="stake" size={22} />
          <span>New Stake...</span>
        </button>
        <button type="button" className="tool-btn" disabled={busy || !sel || (status !== 'active' && status !== 'activating')} onClick={() => void act('deactivate')}>
          <Icon name="standby" size={22} />
          <span>Unstake</span>
        </button>
        <button type="button" className="tool-btn" disabled={busy || !sel || status !== 'inactive'} onClick={() => void act('withdraw')}>
          <Icon name="wallet" size={22} />
          <span>Withdraw</span>
        </button>
        <button type="button" className="tool-btn" onClick={load}>
          <Icon name="restart" size={22} />
          <span>Refresh</span>
        </button>
      </div>
      <div className="staking-main">
        {error ? (
          <div className="fv-empty">
            Couldn't list stake accounts: {error}
            <br />
            Some public RPC endpoints don't allow this lookup; a custom RPC in Network Settings usually fixes it.
          </div>
        ) : !accounts ? (
          <div className="fv-empty">Loading stake accounts…</div>
        ) : !accounts.length ? (
          <div className="fv-empty">
            You have no stake accounts on {clusterLabel(cluster)}.{' '}
            <button type="button" className="link-btn" onClick={() => openApp('stake')}>
              Stake some SOL
            </button>
          </div>
        ) : (
          <div className="list-box">
            <table className="fv-table">
              <thead>
                <tr>
                  <th>Stake account</th>
                  <th>Validator</th>
                  <th className="num">Balance (SOL)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr
                    key={a.address}
                    className={`fv-item${selected === a.address ? ' selected' : ''}`}
                    onClick={() => setSelected(a.address)}
                    onDoubleClick={() => openApp('solexplorer', { url: `sol://address/${a.address}` })}
                  >
                    <td title={a.address}>{shortAddress(a.address)}</td>
                    <td title={a.voter ?? ''}>{voterName(a.voter)}</td>
                    <td className="num">{formatSol(a.lamports, 6)}</td>
                    <td>{STATUS_LABEL[stakeStatus(a, epoch)]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="status-bar">
        <span>{accounts ? `${accounts.length} stake account(s) · ${formatSol(totalStaked, 4)} SOL` : ''}</span>
        <span>Epoch {epoch || '—'}</span>
        <span>{clusterLabel(cluster)}</span>
      </div>
    </div>
  );
}

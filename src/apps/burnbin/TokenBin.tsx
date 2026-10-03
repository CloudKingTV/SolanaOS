import { useMemo, useState } from 'react';
import { useWallet } from '../../os/wallet/standard';
import { isEmpty, refreshPortfolio, tokenLabel, usePortfolio, type Holding } from '../../os/wallet/portfolio';
import { queuedFor, unqueue, useBurnQueue } from '../../os/wallet/burnQueue';
import { burnBatches, planBurn } from '../../os/wallet/burn';
import { buildTransaction, signAndSendAll, assertCanWrite } from '../../os/wallet/tx';
import { formatAmount, formatSol } from '../../os/solana/rpc';
import { chainFor, clusterLabel, useSettings } from '../../os/settings';
import { messageBox } from '../../os/dialogs';
import { showBalloon, shortAddr } from '../../os/session';
import { openApp } from '../../os/windows';
import { sounds } from '../../os/sound';
import { Icon } from '../../shell/icons';
import { openContextMenu, sep } from '../../shell/Menu';

/** Token accounts in the Burn Bin: every empty account, plus anything the user sent here. */
export function useTokenBinItems(): Holding[] {
  const owner = useWallet((s) => s.connection?.address);
  const tokens = usePortfolio((s) => s.tokens);
  const queued = useBurnQueue((s) => s.queued);
  return useMemo(() => {
    const q = queuedFor(owner, queued);
    return tokens.filter((t) => (isEmpty(t) && !t.isNative) || q.has(t.pubkey));
  }, [owner, tokens, queued]);
}

export function TokenBin({ windowId }: { windowId: string }) {
  const conn = useWallet((s) => s.connection);
  const loading = usePortfolio((s) => s.loading);
  const items = useTokenBinItems();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const cluster = useSettings((s) => s.cluster);

  if (!conn) {
    return (
      <div className="fv-empty tb-empty">
        <Icon name="wallet" size={32} />
        <p>Connect a wallet to find empty token accounts and reclaim their rent.</p>
        <button type="button" className="btn" onClick={() => openApp('connect')}>
          Connect Wallet...
        </button>
      </div>
    );
  }

  const owner = conn.address;
  const chosen = selected.size ? items.filter((i) => selected.has(i.pubkey)) : items;
  const plan = planBurn(chosen, owner);

  const run = async () => {
    try {
      assertCanWrite();
    } catch (e) {
      void messageBox({ title: 'Burn Bin', icon: 'warning', message: e instanceof Error ? e.message : String(e), owner: windowId });
      return;
    }
    if (!plan.accounts.length) return;
    const mainnet = chainFor(useSettings.getState()) === 'solana:mainnet';
    const burnLines = plan.burns.map((b) => `  • ${formatAmount(b.amount, b.decimals, 6)} ${tokenLabel(b as Holding)}`).join('\n');
    const answer = await messageBox({
      title: 'Confirm Burn',
      icon: 'warning',
      message:
        `${mainnet ? 'You are on MAINNET. This uses real funds.\n\n' : ''}` +
        `Close ${plan.accounts.length} token account${plan.accounts.length === 1 ? '' : 's'} and reclaim about ${formatSol(plan.reclaimLamports, 6)} SOL.` +
        (plan.burns.length ? `\n\nThese tokens will be burned permanently:\n${burnLines}` : '') +
        (plan.skipped.length ? `\n\n${plan.skipped.length} account(s) will be skipped (frozen or not yours).` : '') +
        `\n\nYour wallet will ask you to approve ${Math.ceil(plan.accounts.length / 8)} transaction(s). This can't be undone. Continue?`,
      buttons: ['Yes', 'No'],
      owner: windowId,
    });
    if (answer !== 'Yes') return;
    const batches = burnBatches(plan, owner);
    setProgress({ done: 0, total: batches.length });
    try {
      const txs = [];
      for (const b of batches) txs.push(await buildTransaction(b));
      const sigs = await signAndSendAll(txs, (done, total) => setProgress({ done, total }));
      unqueue(owner, plan.accounts.map((a) => a.pubkey));
      setSelected(new Set());
      sounds.boom();
      showBalloon({
        title: 'Burn Bin emptied',
        icon: 'burn-empty',
        message: `Closed ${plan.accounts.length} account(s) and reclaimed ${formatSol(plan.reclaimLamports, 6)} SOL. Click to view the transaction.`,
        onClick: () => openApp('solexplorer', { url: `sol://tx/${sigs[sigs.length - 1]}` }),
      });
    } catch (e) {
      void messageBox({ title: 'Burn Bin', icon: 'error', message: e instanceof Error ? e.message : String(e), owner: windowId });
    } finally {
      setProgress(null);
      void refreshPortfolio();
    }
  };

  return (
    <div className="token-bin">
      <div className="tb-toolbar">
        <span>
          {items.length
            ? `${items.length} token account(s) · ${formatSol(planBurn(items, owner).reclaimLamports, 6)} SOL reclaimable on ${clusterLabel(cluster)}`
            : loading
              ? 'Reading token accounts…'
              : 'No empty token accounts. Right-click a token in My Wallet and choose "Send to Burn Bin" to burn it.'}
        </span>
        <button type="button" className="btn" disabled={!plan.accounts.length || !!progress} onClick={() => void run()}>
          {selected.size ? 'Burn selected' : 'Empty Burn Bin'}
        </button>
      </div>
      {progress && (
        <div className="tb-progress">
          <span>
            Waiting for your wallet… {progress.done}/{progress.total} transaction(s) confirmed
          </span>
          <div className="progress">
            <div className="progress-fill" style={{ width: `${Math.max(8, (progress.done / progress.total) * 100)}%` }} />
          </div>
        </div>
      )}
      <div className="list-box">
        <table className="fv-table">
          <thead>
            <tr>
              <th>Token</th>
              <th className="num">Amount</th>
              <th>Account</th>
              <th className="num">Rent (SOL)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((h) => (
              <tr
                key={h.pubkey}
                className={`fv-item${selected.has(h.pubkey) ? ' selected' : ''}`}
                onClick={(e) => {
                  const s = new Set(e.ctrlKey || e.metaKey ? selected : []);
                  if (s.has(h.pubkey)) s.delete(h.pubkey);
                  else s.add(h.pubkey);
                  setSelected(s);
                }}
                onContextMenu={(e) =>
                  openContextMenu(e, [
                    { label: 'View in Solana Explorer', onClick: () => openApp('solexplorer', { url: `sol://address/${h.pubkey}` }) },
                    sep,
                    { label: 'Restore to My Wallet', disabled: isEmpty(h), onClick: () => unqueue(owner, [h.pubkey]) },
                  ])
                }
              >
                <td>
                  <Icon name="coin" size={16} /> {tokenLabel(h)}
                </td>
                <td className="num">{formatAmount(h.amount, h.decimals, 6)}</td>
                <td title={h.pubkey}>{shortAddr(h.pubkey)}</td>
                <td className="num">{formatSol(h.lamports, 6)}</td>
                <td>{h.state === 'frozen' ? 'Frozen (skipped)' : isEmpty(h) ? 'Empty' : 'Will be burned'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mw-note">
        Closing an account returns its rent deposit to your wallet. NFTs burned here only lose the token; their metadata
        accounts stay on-chain.
      </p>
    </div>
  );
}

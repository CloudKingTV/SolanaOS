import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { closeWindow, openApp, setCloseGuard, type AppProps } from '../../os/windows';
import { useWallet } from '../../os/wallet/standard';
import { refreshPortfolio, usePortfolio } from '../../os/wallet/portfolio';
import { assertCanWrite, signAndSend } from '../../os/wallet/tx';
import { createStakeInstructions, getRentExemption, getStakeMinimumDelegation, newSeed, STAKE_ACCOUNT_SPACE } from '../../os/wallet/stake';
import { formatSol, getVoteAccounts, parseAmount, shortAddress, type VoteAccount } from '../../os/solana/rpc';
import { chainFor, clusterLabel, useSettings } from '../../os/settings';
import { showBalloon } from '../../os/session';
import { Icon, SolanaLogo } from '../../shell/icons';

type Step = 'welcome' | 'validator' | 'amount' | 'review' | 'sending' | 'done' | 'error';
const FEE_BUFFER = 10_000;

export function StakeWizard({ windowId, args }: AppProps) {
  const conn = useWallet((s) => s.connection);
  const lamports = usePortfolio((s) => s.lamports) ?? 0;
  const cluster = useSettings((s) => s.cluster);
  const [step, setStep] = useState<Step>('welcome');
  const [validators, setValidators] = useState<VoteAccount[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [vote, setVote] = useState<string>(typeof args.vote === 'string' ? args.vote : '');
  const [query, setQuery] = useState('');
  const [amount, setAmount] = useState('');
  const [rent, setRent] = useState(2_282_880);
  const [minDelegation, setMinDelegation] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  useEffect(() => {
    setCloseGuard(windowId, () => step !== 'sending');
    return () => setCloseGuard(windowId, null);
  }, [step, windowId]);

  useEffect(() => {
    getVoteAccounts()
      .then((r) => setValidators(r.current.filter((v) => v.epochVoteAccount).sort((a, b) => b.activatedStake - a.activatedStake)))
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
    void getRentExemption(STAKE_ACCOUNT_SPACE).then(setRent).catch(() => {});
    void getStakeMinimumDelegation().then(setMinDelegation).catch(() => {});
  }, [cluster]);

  const shown = useMemo(
    () => (validators ?? []).filter((v) => !query || v.votePubkey.includes(query) || v.nodePubkey.includes(query)).slice(0, 200),
    [validators, query],
  );
  const total = useMemo(() => (validators ?? []).reduce((s, v) => s + v.activatedStake, 0), [validators]);
  const chosen = validators?.find((v) => v.votePubkey === vote);
  const parsed = parseAmount(amount, 9);
  const maxStake = Math.max(0, lamports - rent - FEE_BUFFER);
  const amountError = (): string | null => {
    if (parsed === null || parsed <= 0n) return 'Enter how much SOL to stake.';
    if (parsed < BigInt(minDelegation)) return `The minimum stake is ${formatSol(minDelegation, 9)} SOL.`;
    if (parsed > BigInt(maxStake)) return `You can stake up to ${formatSol(maxStake, 6)} SOL (keeping ${formatSol(rent, 6)} SOL for the stake account deposit and fees).`;
    return null;
  };

  const send = async () => {
    try {
      assertCanWrite();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep('error');
      return;
    }
    setStep('sending');
    try {
      const { ixs } = await createStakeInstructions(conn!.address, vote, parsed! + BigInt(rent), newSeed());
      const sig = await signAndSend(ixs);
      setSignature(sig);
      setStep('done');
      showBalloon({ title: 'Stake created', icon: 'stake', message: `You're staking ${amount} SOL. It starts earning at the next epoch.`, onClick: () => openApp('staking') });
      void refreshPortfolio();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep('error');
    }
  };

  const Banner = () => (
    <div className="wiz-banner">
      <SolanaLogo size={64} />
    </div>
  );
  const Header = ({ title, sub }: { title: string; sub: string }) => (
    <div className="wiz-header">
      <div>
        <b>{title}</b>
        <span>{sub}</span>
      </div>
      <Icon name="stake" size={40} />
    </div>
  );

  if (!conn) {
    return (
      <div className="wizard">
        <div className="wiz-page">
          <div className="wiz-body split">
            <Banner />
            <div className="wiz-content">
              <h2>Stake Wizard</h2>
              <p>Connect a wallet to stake SOL.</p>
              <button type="button" className="btn" onClick={() => openApp('connect')}>
                Connect Wallet...
              </button>
            </div>
          </div>
        </div>
        <div className="wiz-buttons">
          <button type="button" className="btn" onClick={() => closeWindow(windowId)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  let content: ReactNode;
  let back: Step | null = null;
  let next: { label: string; onClick: () => void; disabled?: boolean } | null = null;

  switch (step) {
    case 'welcome':
      content = (
        <div className="wiz-body split">
          <Banner />
          <div className="wiz-content">
            <h2>Welcome to the Stake Wizard</h2>
            <p>Staking lends your SOL to a validator that helps run the Solana network. In return you earn rewards every epoch (about 2 days).</p>
            <p>Your SOL stays yours. You can unstake at any time; it becomes withdrawable after the current epoch ends.</p>
            <p>
              Network: <b>{clusterLabel(cluster)}</b>
            </p>
          </div>
        </div>
      );
      next = { label: 'Next >', onClick: () => setStep('validator') };
      break;
    case 'validator':
      content = (
        <>
          <Header title="Choose a validator" sub="Lower commission means more rewards for you. Spreading stake helps decentralization." />
          <div className="wiz-inner">
            <input className="wide" placeholder="Search by vote or identity address" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="list-box wiz-validators">
              {loadError ? (
                <div className="fv-empty">Couldn't load validators: {loadError}</div>
              ) : !validators ? (
                <div className="fv-empty">Loading validators…</div>
              ) : (
                <table className="fv-table">
                  <thead>
                    <tr>
                      <th>Validator</th>
                      <th className="num">Commission</th>
                      <th className="num">Stake share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((v) => (
                      <tr key={v.votePubkey} className={`fv-item${vote === v.votePubkey ? ' selected' : ''}`} onClick={() => setVote(v.votePubkey)}>
                        <td title={v.votePubkey}>{shortAddress(v.votePubkey)}</td>
                        <td className="num">{v.commission}%</td>
                        <td className="num">{total ? ((v.activatedStake / total) * 100).toFixed(2) : '0'}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      );
      back = 'welcome';
      next = { label: 'Next >', onClick: () => setStep('amount'), disabled: !chosen };
      break;
    case 'amount': {
      const err = amount ? amountError() : null;
      content = (
        <>
          <Header title="How much SOL?" sub={`Staking with ${shortAddress(vote)} (${chosen?.commission ?? '?'}% commission).`} />
          <div className="wiz-inner">
            <label className="field col">
              <span>Amount to stake (SOL):</span>
              <span className="wiz-amount">
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoFocus />
                <button type="button" className="btn" onClick={() => setAmount(formatSol(maxStake, 9).replace(/,/g, ''))}>
                  Max
                </button>
              </span>
            </label>
            <p className="se-muted">
              Available: {formatSol(lamports, 6)} SOL. A new stake account also holds a {formatSol(rent, 6)} SOL deposit, which you get back when you withdraw.
            </p>
            {err && (
              <p className="wiz-error">
                <Icon name="warning" size={16} /> {err}
              </p>
            )}
          </div>
        </>
      );
      back = 'validator';
      next = { label: 'Next >', onClick: () => setStep('review'), disabled: !!amountError() };
      break;
    }
    case 'review':
      content = (
        <>
          <Header title="Review your stake" sub="Approve the transaction in your wallet to start staking." />
          <div className="wiz-inner">
            {chainFor(useSettings.getState()) === 'solana:mainnet' && (
              <p className="wiz-error">
                <Icon name="warning" size={16} /> You are on Mainnet. This uses real SOL.
              </p>
            )}
            <table className="se-table">
              <tbody>
                <tr>
                  <th>Stake</th>
                  <td>
                    <b>{amount} SOL</b>
                  </td>
                </tr>
                <tr>
                  <th>Validator</th>
                  <td className="mono">{vote}</td>
                </tr>
                <tr>
                  <th>Commission</th>
                  <td>{chosen?.commission}%</td>
                </tr>
                <tr>
                  <th>Account deposit</th>
                  <td>{formatSol(rent, 6)} SOL (refunded on withdraw)</td>
                </tr>
                <tr>
                  <th>Network</th>
                  <td>{clusterLabel(cluster)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      );
      back = 'amount';
      next = { label: 'Stake', onClick: () => void send() };
      break;
    case 'sending':
      content = (
        <>
          <Header title="Staking" sub="Please wait." />
          <div className="wiz-inner">
            <p>Approve the transaction in {conn.wallet.name}.</p>
            <div className="progress">
              <div className="progress-fill indeterminate" />
            </div>
          </div>
        </>
      );
      break;
    case 'done':
      content = (
        <div className="wiz-body split">
          <Banner />
          <div className="wiz-content">
            <h2>Completing the Stake Wizard</h2>
            <p>
              You're staking <b>{amount} SOL</b>. It becomes active at the start of the next epoch.
            </p>
            {signature && (
              <button type="button" className="link-btn" onClick={() => openApp('solexplorer', { url: `sol://tx/${signature}` })}>
                View the transaction
              </button>
            )}
            <p>
              <button type="button" className="link-btn" onClick={() => openApp('staking')}>
                Open Staking to see your stake accounts
              </button>
            </p>
          </div>
        </div>
      );
      break;
    case 'error':
      content = (
        <>
          <Header title="Staking didn't go through" sub="Nothing was staked." />
          <div className="wiz-inner">
            <p className="wiz-error">
              <Icon name="error" size={16} /> {error}
            </p>
          </div>
        </>
      );
      back = 'review';
      break;
  }

  return (
    <div className="wizard">
      <div className="wiz-page">{content}</div>
      <div className="wiz-buttons">
        <button type="button" className="btn" disabled={!back} onClick={() => back && setStep(back)}>
          &lt; Back
        </button>
        {step === 'done' ? (
          <button type="button" className="btn" onClick={() => closeWindow(windowId)}>
            Finish
          </button>
        ) : (
          <button type="button" className="btn" disabled={!next || next.disabled} onClick={next?.onClick}>
            {next?.label ?? 'Next >'}
          </button>
        )}
        <button type="button" className="btn" disabled={step === 'sending'} onClick={() => closeWindow(windowId)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

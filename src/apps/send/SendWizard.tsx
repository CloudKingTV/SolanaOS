import { useEffect, useState, type ReactNode } from 'react';
import { closeWindow, openApp, setCloseGuard, type AppProps } from '../../os/windows';
import { useWallet } from '../../os/wallet/standard';
import { isEmpty, refreshPortfolio, tokenLabel, usePortfolio, type Holding } from '../../os/wallet/portfolio';
import { BASE_FEE_LAMPORTS, TOKEN_ACCOUNT_RENT, checkRecipient, solTransfer, tokenTransfer, type RecipientCheck } from '../../os/wallet/send';
import { assertCanWrite, signAndSend } from '../../os/wallet/tx';
import { formatAmount, formatSol, isLikelyAddress, parseAmount } from '../../os/solana/rpc';
import { chainFor, clusterLabel, useSettings } from '../../os/settings';
import { showBalloon } from '../../os/session';
import { Icon, SolanaLogo } from '../../shell/icons';

const RENT_MIN = 890_880; // rent-exempt minimum for a 0-byte account

type Step = 'welcome' | 'asset' | 'details' | 'review' | 'sending' | 'done' | 'error';

function Banner() {
  return (
    <div className="wiz-banner">
      <SolanaLogo size={64} />
    </div>
  );
}

function Header({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="wiz-header">
      <div>
        <b>{title}</b>
        <span>{sub}</span>
      </div>
      <Icon name="send" size={40} />
    </div>
  );
}

export function SendWizard({ windowId, args }: AppProps) {
  const conn = useWallet((s) => s.connection);
  const lamports = usePortfolio((s) => s.lamports) ?? 0;
  const tokens = usePortfolio((s) => s.tokens).filter((t) => !isEmpty(t) && !t.isNative);
  const cluster = useSettings((s) => s.cluster);
  const [step, setStep] = useState<Step>(args.token || args.to ? 'details' : 'welcome');
  const [asset, setAsset] = useState<string>(typeof args.token === 'string' ? args.token : 'sol');
  const [to, setTo] = useState(typeof args.to === 'string' ? args.to : '');
  const [amount, setAmount] = useState(typeof args.amount === 'string' ? args.amount : '');
  const [check, setCheck] = useState<RecipientCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    // Don't let the window close mid-send.
    setCloseGuard(windowId, () => step !== 'sending');
    return () => setCloseGuard(windowId, null);
  }, [step, windowId]);

  if (!conn) {
    return (
      <div className="wizard">
        <div className="wiz-body split">
          <Banner />
          <div className="wiz-content">
            <h2>Send Wizard</h2>
            <p>Connect a wallet to send SOL or tokens.</p>
            <button type="button" className="btn" onClick={() => openApp('connect')}>
              Connect Wallet...
            </button>
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

  const token: Holding | undefined = asset === 'sol' ? undefined : tokens.find((t) => t.pubkey === asset);
  const decimals = token ? token.decimals : 9;
  const symbol = token ? tokenLabel(token) : 'SOL';
  const parsed = parseAmount(amount, decimals);
  const ataCost = token && check?.needsAta ? TOKEN_ACCOUNT_RENT : 0;
  const fee = BASE_FEE_LAMPORTS;

  const detailsError = (): string | null => {
    if (!isLikelyAddress(to.trim())) return 'Enter a valid Solana address for the recipient.';
    if (to.trim() === conn.address) return "That's your own address.";
    if (parsed === null || parsed <= 0n) return `Enter an amount of ${symbol} to send.`;
    if (token) {
      if (parsed > BigInt(token.amount)) return `You only have ${formatAmount(token.amount, token.decimals)} ${symbol}.`;
    } else {
      const left = BigInt(lamports) - parsed - BigInt(fee);
      if (left < 0n) return `You only have ${formatSol(lamports, 9)} SOL (and need ${formatSol(fee, 9)} SOL for the fee).`;
      if (left > 0n && left < BigInt(RENT_MIN))
        return `That would leave ${formatSol(Number(left), 9)} SOL, below the ${formatSol(RENT_MIN, 6)} SOL minimum an account must keep. Send a little less, or use Max.`;
    }
    return null;
  };

  const setMax = () => {
    if (token) setAmount(formatAmount(token.amount, token.decimals).replace(/,/g, ''));
    else setAmount(formatSol(Math.max(0, lamports - fee), 9).replace(/,/g, ''));
  };

  const toReview = async () => {
    setChecking(true);
    setError(null);
    try {
      setCheck(await checkRecipient(to.trim(), token?.mint, token?.programId));
      setStep('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
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
      const ixs = token
        ? await tokenTransfer(conn.address, token, to.trim(), parsed!, !!check?.needsAta)
        : solTransfer(conn.address, to.trim(), parsed!);
      const sig = await signAndSend(ixs);
      setSignature(sig);
      setStep('done');
      showBalloon({
        title: 'Sent',
        icon: 'send',
        message: `Sent ${amount} ${symbol}. Click to view the transaction.`,
        onClick: () => openApp('solexplorer', { url: `sol://tx/${sig}` }),
      });
      void refreshPortfolio();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep('error');
    }
  };

  let content: ReactNode;
  let back: Step | null = null;
  let next: { label: string; onClick: () => void; disabled?: boolean } | null = null;

  switch (step) {
    case 'welcome':
      content = (
        <div className="wiz-body split">
          <Banner />
          <div className="wiz-content">
            <h2>Welcome to the Send Wizard</h2>
            <p>This wizard helps you send SOL or tokens from your wallet to another Solana address.</p>
            <p>You'll pick what to send, enter the recipient and amount, and review everything before your wallet asks you to approve it.</p>
            <p>
              Network: <b>{clusterLabel(cluster)}</b>
            </p>
            <p>To continue, click Next.</p>
          </div>
        </div>
      );
      next = { label: 'Next >', onClick: () => setStep('asset') };
      break;
    case 'asset':
      content = (
        <>
          <Header title="What do you want to send?" sub="Choose SOL or one of your tokens." />
          <div className="wiz-inner">
            <div className="list-box wiz-assets">
              <label className={`wiz-asset${asset === 'sol' ? ' selected' : ''}`}>
                <input type="radio" name={`asset-${windowId}`} checked={asset === 'sol'} onChange={() => setAsset('sol')} />
                <Icon name="drive" size={24} />
                <span>SOL</span>
                <span className="num">{formatSol(lamports, 6)}</span>
              </label>
              {tokens.map((t) => (
                <label key={t.pubkey} className={`wiz-asset${asset === t.pubkey ? ' selected' : ''}`}>
                  <input type="radio" name={`asset-${windowId}`} checked={asset === t.pubkey} onChange={() => setAsset(t.pubkey)} />
                  <Icon name="coin" size={24} />
                  <span>{tokenLabel(t)}</span>
                  <span className="num">{formatAmount(t.amount, t.decimals, 6)}</span>
                </label>
              ))}
            </div>
          </div>
        </>
      );
      back = 'welcome';
      next = { label: 'Next >', onClick: () => setStep('details') };
      break;
    case 'details': {
      const err = to || amount ? detailsError() : null;
      content = (
        <>
          <Header title="Recipient and amount" sub={`Send ${symbol} to another wallet.`} />
          <div className="wiz-inner">
            <label className="field col">
              <span>Recipient's wallet address:</span>
              <input value={to} onChange={(e) => setTo(e.target.value)} spellCheck={false} className="wide mono" autoFocus />
            </label>
            <label className="field col">
              <span>Amount ({symbol}):</span>
              <span className="wiz-amount">
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.0" />
                <button type="button" className="btn" onClick={setMax}>
                  Max
                </button>
              </span>
            </label>
            <p className="se-muted">
              Available: {token ? `${formatAmount(token.amount, token.decimals)} ${symbol}` : `${formatSol(lamports, 9)} SOL`}
            </p>
            {(err || error) && (
              <p className="wiz-error">
                <Icon name="warning" size={16} /> {err ?? error}
              </p>
            )}
          </div>
        </>
      );
      back = 'asset';
      next = { label: checking ? 'Checking…' : 'Next >', onClick: () => void toReview(), disabled: !!detailsError() || checking };
      break;
    }
    case 'review': {
      const mainnet = chainFor(useSettings.getState()) === 'solana:mainnet';
      content = (
        <>
          <Header title="Review your transfer" sub="Make sure everything is right. Transfers can't be reversed." />
          <div className="wiz-inner">
            {mainnet && (
              <p className="wiz-error">
                <Icon name="warning" size={16} /> You are on Mainnet. This sends real funds.
              </p>
            )}
            <table className="se-table">
              <tbody>
                <tr>
                  <th>Send</th>
                  <td>
                    <b>
                      {amount} {symbol}
                    </b>
                  </td>
                </tr>
                <tr>
                  <th>To</th>
                  <td className="mono selectable">{to.trim()}</td>
                </tr>
                <tr>
                  <th>From</th>
                  <td className="mono">{conn.address}</td>
                </tr>
                <tr>
                  <th>Network fee</th>
                  <td>~{formatSol(fee, 9)} SOL</td>
                </tr>
                {ataCost > 0 && (
                  <tr>
                    <th>Account setup</th>
                    <td>{formatSol(ataCost, 8)} SOL to create the recipient's {symbol} account (paid by you)</td>
                  </tr>
                )}
                <tr>
                  <th>Network</th>
                  <td>{clusterLabel(cluster)}</td>
                </tr>
              </tbody>
            </table>
            {check?.warning && (
              <p className="wiz-error">
                <Icon name="warning" size={16} /> {check.warning}
              </p>
            )}
            {check && !check.exists && !token && (
              <p className="se-muted">This address has never been used on {clusterLabel(cluster)}. Double-check it.</p>
            )}
            <p>Click Send, then approve the transaction in {conn.wallet.name}.</p>
          </div>
        </>
      );
      back = 'details';
      next = { label: 'Send', onClick: () => void send() };
      break;
    }
    case 'sending':
      content = (
        <>
          <Header title="Sending" sub="Please wait." />
          <div className="wiz-inner">
            <p>Approve the transaction in {conn.wallet.name}. SolanaOS will wait for the network to confirm it.</p>
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
            <h2>Completing the Send Wizard</h2>
            <p>
              You sent{' '}
              <b>
                {amount} {symbol}
              </b>{' '}
              to {to.trim().slice(0, 6)}…{to.trim().slice(-6)}.
            </p>
            <p>The transaction is confirmed.</p>
            {signature && (
              <button type="button" className="link-btn" onClick={() => openApp('solexplorer', { url: `sol://tx/${signature}` })}>
                View it in Solana Explorer
              </button>
            )}
            <p>To close this wizard, click Finish.</p>
          </div>
        </div>
      );
      break;
    case 'error':
      content = (
        <>
          <Header title="The transfer didn't go through" sub="Nothing was sent." />
          <div className="wiz-inner">
            <p className="wiz-error">
              <Icon name="error" size={16} /> {error}
            </p>
            <p>Click Back to try again.</p>
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


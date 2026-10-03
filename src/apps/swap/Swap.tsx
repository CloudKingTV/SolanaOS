import { useEffect, useMemo, useRef, useState } from 'react';
import { openApp, type AppProps } from '../../os/windows';
import { useWallet } from '../../os/wallet/standard';
import { refreshPortfolio, tokenLabel, usePortfolio } from '../../os/wallet/portfolio';
import { signAndSendAll } from '../../os/wallet/tx';
import { POPULAR_TOKENS, getQuote, getSwapTransaction, routeLabel, type Quote, type SwapToken } from '../../os/swap/jupiter';
import { formatAmount, getAccountInfo, isLikelyAddress, parseAmount } from '../../os/solana/rpc';
import { chainFor, useSettings } from '../../os/settings';
import { messageBox } from '../../os/dialogs';
import { showBalloon } from '../../os/session';
import { Icon } from '../../shell/icons';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const FEE_RESERVE = 10_000_000n; // keep 0.01 SOL for fees and token account deposits

function TokenPicker({ value, tokens, onChange, onCustom }: { value: string; tokens: SwapToken[]; onChange: (mint: string) => void; onCustom: () => void }) {
  return (
    <select
      value={value}
      onChange={(e) => (e.target.value === '__custom' ? onCustom() : onChange(e.target.value))}
      aria-label="Token"
    >
      {tokens.map((t) => (
        <option key={t.mint} value={t.mint}>
          {t.symbol}
        </option>
      ))}
      <option value="__custom">Other (paste mint)…</option>
    </select>
  );
}

export function Swap({ windowId }: AppProps) {
  const conn = useWallet((s) => s.connection);
  const lamports = usePortfolio((s) => s.lamports);
  const holdings = usePortfolio((s) => s.tokens);
  const settings = useSettings();
  const mainnet = chainFor(settings) === 'solana:mainnet';
  const [extra, setExtra] = useState<SwapToken[]>([]);
  const [from, setFrom] = useState(SOL_MINT);
  const [to, setTo] = useState(POPULAR_TOKENS[1].mint);
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState(50);
  const [quote, setQuote] = useState<{ q: Quote; at: number } | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reqId = useRef(0);
  const [customFor, setCustomFor] = useState<'from' | 'to' | null>(null);
  const [customMint, setCustomMint] = useState('');

  const tokens = useMemo(() => {
    const map = new Map<string, SwapToken>();
    for (const t of [...POPULAR_TOKENS, ...extra]) map.set(t.mint, t);
    for (const h of holdings) if (h.amount !== '0' && !map.has(h.mint)) map.set(h.mint, { mint: h.mint, symbol: tokenLabel(h), decimals: h.decimals });
    return [...map.values()];
  }, [extra, holdings]);
  const fromTok = tokens.find((t) => t.mint === from)!;
  const toTok = tokens.find((t) => t.mint === to)!;
  const raw = fromTok ? parseAmount(amount, fromTok.decimals) : null;

  const balance = (mint: string): bigint | null => {
    if (mint === SOL_MINT) return lamports === null ? null : BigInt(lamports);
    const h = holdings.find((x) => x.mint === mint && !x.isNative);
    return h ? BigInt(h.amount) : 0n;
  };
  const fromBal = balance(from);

  // Re-quote shortly after the inputs settle.
  useEffect(() => {
    setQuote(null);
    setError(null);
    if (!mainnet || !settings.jupiterApiKey || !raw || raw <= 0n || from === to) return;
    const id = ++reqId.current;
    const t = setTimeout(() => {
      setQuoting(true);
      getQuote(from, to, raw, slippage)
        .then((q) => id === reqId.current && setQuote({ q, at: Date.now() }))
        .catch((e: unknown) => id === reqId.current && setError(e instanceof Error ? e.message : String(e)))
        .finally(() => id === reqId.current && setQuoting(false));
    }, 600);
    return () => clearTimeout(t);
  }, [from, to, raw?.toString(), slippage, mainnet, settings.jupiterApiKey]);

  const addCustom = async (side: 'from' | 'to', input: string) => {
    const mint = input.trim();
    if (!mint) return;
    if (!isLikelyAddress(mint)) {
      void messageBox({ title: 'Swap', icon: 'error', message: "That isn't a valid mint address.", owner: windowId });
      return;
    }
    try {
      const info = await getAccountInfo<{ parsed?: { type?: string; info?: { decimals?: number } } }>(mint);
      const decimals = info?.data?.parsed?.type === 'mint' ? info.data.parsed.info?.decimals : undefined;
      if (decimals === undefined) throw new Error('That address is not a token mint.');
      setExtra((x) => [...x, { mint, symbol: `${mint.slice(0, 4)}…`, decimals }]);
      if (side === 'from') setFrom(mint);
      else setTo(mint);
      setCustomFor(null);
      setCustomMint('');
    } catch (e) {
      void messageBox({ title: 'Swap', icon: 'error', message: e instanceof Error ? e.message : String(e), owner: windowId });
    }
  };

  const doSwap = async () => {
    if (!conn || !quote) return;
    let q = quote.q;
    const ok = await messageBox({
      title: 'Confirm Swap',
      icon: 'question',
      message: `Swap ${amount} ${fromTok.symbol} for about ${formatAmount(q.outAmount, toTok.decimals, 6)} ${toTok.symbol}?\n\nYou'll get at least ${formatAmount(q.otherAmountThreshold, toTok.decimals, 6)} ${toTok.symbol} or the swap fails.\n\nThis is a Mainnet transaction with real funds.`,
      buttons: ['Yes', 'No'],
      owner: windowId,
    });
    if (ok !== 'Yes') return;
    setBusy(true);
    try {
      if (Date.now() - quote.at > 20_000) q = await getQuote(from, to, raw!, slippage);
      const tx = await getSwapTransaction(q, conn.address);
      const [sig] = await signAndSendAll([tx]);
      showBalloon({ title: 'Swap complete', icon: 'swap', message: `Swapped ${amount} ${fromTok.symbol} for ${toTok.symbol}. Click to view.`, onClick: () => openApp('solexplorer', { url: `sol://tx/${sig}` }) });
      setAmount('');
      void refreshPortfolio();
    } catch (e) {
      void messageBox({ title: 'Swap', icon: 'error', message: e instanceof Error ? e.message : String(e), owner: windowId });
    } finally {
      setBusy(false);
    }
  };

  const blocker = !conn ? (
    <>
      <p>Connect a wallet to swap tokens.</p>
      <button type="button" className="btn" onClick={() => openApp('connect')}>
        Connect Wallet...
      </button>
    </>
  ) : !mainnet ? (
    <>
      <p>Swaps are routed by Jupiter, which only works on Mainnet. SolanaOS is on Devnet.</p>
      <button type="button" className="btn" onClick={() => openApp('netsettings')}>
        Network Settings...
      </button>
    </>
  ) : !settings.jupiterApiKey ? (
    <>
      <p>
        Swaps need your own free Jupiter API key from{' '}
        <a href="https://portal.jup.ag" target="_blank" rel="noreferrer noopener">
          portal.jup.ag
        </a>
        . Paste it in Network Settings.
      </p>
      <button type="button" className="btn" onClick={() => openApp('netsettings')}>
        Network Settings...
      </button>
    </>
  ) : !settings.allowMainnetTransactions ? (
    <>
      <p>Turn on "Allow transactions on Mainnet" in Network Settings to swap.</p>
      <button type="button" className="btn" onClick={() => openApp('netsettings')}>
        Network Settings...
      </button>
    </>
  ) : null;

  const insufficient = raw !== null && fromBal !== null && raw > fromBal;
  const impact = quote ? Number(quote.q.priceImpactPct) * 100 : 0;

  return (
    <div className="swap-app">
      <div className="swap-banner">
        <Icon name="swap" size={32} />
        <div>
          <b>Swap</b>
          <span>Trade tokens at the best price across Solana, powered by Jupiter.</span>
        </div>
      </div>
      {blocker ? (
        <div className="swap-blocker">{blocker}</div>
      ) : (
        <div className="swap-form">
          <fieldset className="group">
            <legend>You pay</legend>
            <div className="swap-row">
              <TokenPicker value={from} tokens={tokens} onChange={setFrom} onCustom={() => setCustomFor('from')} />
              <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" inputMode="decimal" aria-label="Amount" />
              <button
                type="button"
                className="btn"
                disabled={!fromBal}
                onClick={() => {
                  const max = from === SOL_MINT ? (fromBal! > FEE_RESERVE ? fromBal! - FEE_RESERVE : 0n) : fromBal!;
                  setAmount(formatAmount(max.toString(), fromTok.decimals).replace(/,/g, ''));
                }}
              >
                Max
              </button>
            </div>
            <small className="se-muted">Balance: {fromBal === null ? '—' : formatAmount(fromBal.toString(), fromTok.decimals, 6)} {fromTok.symbol}</small>
          </fieldset>
          <div className="swap-flip">
            <button
              type="button"
              className="btn"
              title="Swap direction"
              onClick={() => {
                setFrom(to);
                setTo(from);
              }}
            >
              ⇅
            </button>
          </div>
          <fieldset className="group">
            <legend>You receive</legend>
            <div className="swap-row">
              <TokenPicker value={to} tokens={tokens} onChange={setTo} onCustom={() => setCustomFor('to')} />
              <span className="swap-out">{quoting ? 'Getting a quote…' : quote ? `≈ ${formatAmount(quote.q.outAmount, toTok.decimals, 6)}` : '—'}</span>
            </div>
          </fieldset>
          {customFor && (
            <form
              className="swap-row"
              onSubmit={(e) => {
                e.preventDefault();
                void addCustom(customFor, customMint);
              }}
            >
              <input autoFocus value={customMint} onChange={(e) => setCustomMint(e.target.value)} placeholder={`Paste the mint to ${customFor === 'from' ? 'pay with' : 'receive'}`} className="wide mono" />
              <button type="submit" className="btn">
                Add
              </button>
              <button type="button" className="btn" onClick={() => setCustomFor(null)}>
                Cancel
              </button>
            </form>
          )}
          <div className="swap-slippage">
            Slippage:
            {[10, 50, 100].map((bps) => (
              <label key={bps} className="radio inline">
                <input type="radio" name={`slip-${windowId}`} checked={slippage === bps} onChange={() => setSlippage(bps)} />
                <span>{bps / 100}%</span>
              </label>
            ))}
          </div>
          {quote && (
            <table className="se-table swap-details">
              <tbody>
                <tr>
                  <th>Minimum received</th>
                  <td>
                    {formatAmount(quote.q.otherAmountThreshold, toTok.decimals, 6)} {toTok.symbol}
                  </td>
                </tr>
                <tr>
                  <th>Price impact</th>
                  <td className={impact > 1 ? 'bad' : ''}>{impact < 0.01 ? '< 0.01' : impact.toFixed(2)}%</td>
                </tr>
                <tr>
                  <th>Route</th>
                  <td>{routeLabel(quote.q)}</td>
                </tr>
              </tbody>
            </table>
          )}
          {(error || insufficient || from === to) && (
            <p className="wiz-error">
              <Icon name="warning" size={16} /> {from === to ? 'Pick two different tokens.' : insufficient ? `You don't have enough ${fromTok.symbol}.` : error}
            </p>
          )}
          <div className="dialog-buttons">
            <button type="button" className="btn" disabled={!quote || busy || insufficient || from === to} onClick={() => void doSwap()}>
              {busy ? 'Swapping…' : 'Swap'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

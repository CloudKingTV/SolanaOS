import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { closeWindow, openApp, setWindowTitle, type AppProps } from '../../os/windows';
import { clusterLabel, useSettings } from '../../os/settings';
import {
  formatAmount,
  formatSol,
  getAccountInfo,
  getEpochInfo,
  getSignaturesForAddress,
  getTransaction,
  type AccountInfo,
  type ParsedTransaction,
  type SignatureInfo,
} from '../../os/solana/rpc';
import { programName } from '../../os/solana/programs';
import { getTokenMetadata, type TokenMeta } from '../../os/solana/metadata';
import { solDeltas, tokenDeltas } from '../../os/solana/txSummary';
import { useWallet } from '../../os/wallet/standard';
import { copyText } from '../../os/wallet/actions';
import { Icon, SolanaLogo } from '../../shell/icons';
import { MenuBar, sep } from '../../shell/Menu';
import { parseRoute, routeUrl, type Route } from './route';

const FAV_KEY = 'solanaos.explorer.favorites.v1';

function loadFavs(): { title: string; url: string }[] {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]');
  } catch {
    return [];
  }
}

const ago = (t: number | null) => {
  if (!t) return '—';
  const s = Math.max(0, Math.round(Date.now() / 1000 - t));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(t * 1000).toLocaleDateString();
};

type Nav = (r: Route) => void;

function Link({ to, nav, children, title }: { to: Route; nav: Nav; children: ReactNode; title?: string }) {
  return (
    <a
      href={routeUrl(to)}
      title={title}
      className="se-link"
      onClick={(e) => {
        e.preventDefault();
        nav(to);
      }}
    >
      {children}
    </a>
  );
}

function Addr({ id, nav, full = false }: { id: string; nav: Nav; full?: boolean }) {
  const name = programName(id);
  return (
    <Link to={{ kind: 'address', id }} nav={nav} title={id}>
      {name ?? (full ? id : `${id.slice(0, 6)}…${id.slice(-6)}`)}
    </Link>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr>
      <th>{label}</th>
      <td>{children}</td>
    </tr>
  );
}

function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  useEffect(() => {
    let live = true;
    setState({ loading: true });
    fn()
      .then((data) => live && setState({ data, loading: false }))
      .catch((e: unknown) => live && setState({ error: e instanceof Error ? e.message : String(e), loading: false }));
    return () => {
      live = false;
    };
  }, deps);
  return state;
}

function Home({ nav }: { nav: Nav }) {
  const cluster = useSettings((s) => s.cluster);
  const me = useWallet((s) => s.connection?.address);
  const epoch = useLoad(() => getEpochInfo(), [cluster]);
  const [q, setQ] = useState('');
  return (
    <div className="se-home">
      <div className="se-home-brand">
        <SolanaLogo size={56} />
        <div>
          <h1>Solana Explorer</h1>
          <p>Look up any account, token or transaction on {clusterLabel(cluster)}.</p>
        </div>
      </div>
      <form
        className="se-search"
        onSubmit={(e) => {
          e.preventDefault();
          nav(parseRoute(q));
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Paste an address or transaction signature" aria-label="Search" />
        <button type="submit" className="btn">
          Search
        </button>
      </form>
      <div className="se-cards">
        <div className="se-card">
          <span>Slot</span>
          <b>{epoch.data?.absoluteSlot.toLocaleString('en-US') ?? '—'}</b>
        </div>
        <div className="se-card">
          <span>Epoch</span>
          <b>{epoch.data ? `${epoch.data.epoch} · ${((epoch.data.slotIndex / epoch.data.slotsInEpoch) * 100).toFixed(1)}%` : '—'}</b>
        </div>
        <div className="se-card">
          <span>Block height</span>
          <b>{epoch.data?.blockHeight.toLocaleString('en-US') ?? '—'}</b>
        </div>
      </div>
      {me && (
        <p>
          Your wallet: <Addr id={me} nav={nav} full />
        </p>
      )}
      <p className="se-muted">Tip: you can paste explorer.solana.com and Solscan links into the address bar too.</p>
    </div>
  );
}

interface ParsedAccountData {
  program?: string;
  parsed?: { type?: string; info?: Record<string, unknown> };
}

function AddressPage({ id, nav }: { id: string; nav: Nav }) {
  const cluster = useSettings((s) => s.cluster);
  const rpcUrl = useSettings((s) => s.customRpcUrl);
  const acct = useLoad(() => getAccountInfo<ParsedAccountData | [string, string]>(id), [id, cluster, rpcUrl]);
  const sigs = useLoad(() => getSignaturesForAddress(id, 20), [id, cluster, rpcUrl]);
  const [meta, setMeta] = useState<TokenMeta | null>(null);

  const a = acct.data as AccountInfo<ParsedAccountData | [string, string]> | null | undefined;
  const parsed = a && !Array.isArray(a.data) ? a.data : undefined;
  const type = parsed?.parsed?.type;
  const info = parsed?.parsed?.info ?? {};
  const mintForMeta = type === 'mint' ? id : type === 'account' ? (info.mint as string) : null;

  useEffect(() => {
    setMeta(null);
    if (!mintForMeta || !a) return;
    void getTokenMetadata([{ mint: mintForMeta, programId: a.owner }]).then((m) => setMeta(m.get(mintForMeta) ?? null));
  }, [mintForMeta, a]);

  const kind =
    type === 'mint'
      ? 'Token Mint'
      : type === 'account'
        ? 'Token Account'
        : a?.executable
          ? 'Program'
          : a?.owner === '11111111111111111111111111111111'
            ? 'Wallet'
            : (parsed?.program ?? 'Account');

  const tokenAmount = info.tokenAmount as { amount: string; decimals: number } | undefined;

  return (
    <div className="se-page">
      <h2>
        {kind === 'Wallet' ? <Icon name="wallet" size={24} /> : kind.startsWith('Token') ? <Icon name="coin" size={24} /> : <Icon name="system" size={24} />}
        {programName(id) ?? (meta?.name ? `${meta.name}${meta.symbol ? ` (${meta.symbol})` : ''}` : kind)}
      </h2>
      <table className="se-table">
        <tbody>
          <Row label="Address">
            <span className="mono selectable">{id}</span>{' '}
            <button type="button" className="link-btn" onClick={() => void copyText(id)}>
              Copy
            </button>
          </Row>
          {acct.loading ? (
            <Row label="Status">Loading…</Row>
          ) : acct.error ? (
            <Row label="Error">{acct.error}</Row>
          ) : !a ? (
            <Row label="Status">This account doesn't exist on {clusterLabel(cluster)} (it has no SOL and no data).</Row>
          ) : (
            <>
              <Row label="Type">{kind}</Row>
              <Row label="Balance">{formatSol(a.lamports, 9)} SOL</Row>
              <Row label="Owner program">
                <Addr id={a.owner} nav={nav} />
              </Row>
              <Row label="Executable">{a.executable ? 'Yes' : 'No'}</Row>
              {a.space !== undefined && <Row label="Data size">{a.space.toLocaleString()} bytes</Row>}
              {type === 'mint' && (
                <>
                  <Row label="Supply">{formatAmount(String(info.supply ?? '0'), Number(info.decimals ?? 0))}</Row>
                  <Row label="Decimals">{String(info.decimals)}</Row>
                  <Row label="Mint authority">{info.mintAuthority ? <Addr id={String(info.mintAuthority)} nav={nav} /> : 'None (fixed supply)'}</Row>
                  <Row label="Freeze authority">{info.freezeAuthority ? <Addr id={String(info.freezeAuthority)} nav={nav} /> : 'None'}</Row>
                </>
              )}
              {type === 'account' && (
                <>
                  <Row label="Mint">
                    <Addr id={String(info.mint)} nav={nav} />
                  </Row>
                  <Row label="Token owner">
                    <Addr id={String(info.owner)} nav={nav} />
                  </Row>
                  {tokenAmount && <Row label="Amount">{formatAmount(tokenAmount.amount, tokenAmount.decimals)} {meta?.symbol}</Row>}
                  <Row label="State">{String(info.state)}</Row>
                </>
              )}
              {kind === 'Wallet' && (
                <Row label="Holdings">
                  <button type="button" className="link-btn" onClick={() => openApp('mywallet', { address: id })}>
                    Open in My Wallet (read-only)
                  </button>
                </Row>
              )}
            </>
          )}
        </tbody>
      </table>

      <h3>Recent transactions</h3>
      {sigs.loading ? (
        <p className="se-muted">Loading…</p>
      ) : sigs.error ? (
        <p className="se-muted">Couldn't load history: {sigs.error}</p>
      ) : !sigs.data?.length ? (
        <p className="se-muted">No transactions found.</p>
      ) : (
        <table className="se-table list">
          <thead>
            <tr>
              <th>Signature</th>
              <th>Slot</th>
              <th>Age</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {sigs.data.map((s: SignatureInfo) => (
              <tr key={s.signature}>
                <td>
                  <Link to={{ kind: 'tx', id: s.signature }} nav={nav} title={s.signature}>
                    {s.signature.slice(0, 20)}…
                  </Link>
                </td>
                <td>{s.slot.toLocaleString('en-US')}</td>
                <td>{ago(s.blockTime)}</td>
                <td className={s.err ? 'bad' : 'good'}>{s.err ? 'Failed' : 'Success'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ixLabel(ix: ParsedTransaction['transaction']['message']['instructions'][number]): string {
  const prog = programName(ix.programId) ?? ix.program ?? `${ix.programId.slice(0, 6)}…`;
  const t = typeof ix.parsed === 'object' && ix.parsed ? (ix.parsed as { type?: string }).type : typeof ix.parsed === 'string' ? 'memo' : undefined;
  return t ? `${prog}: ${t}` : `${prog}: unknown instruction`;
}

function TxPage({ id, nav }: { id: string; nav: Nav }) {
  const cluster = useSettings((s) => s.cluster);
  const rpcUrl = useSettings((s) => s.customRpcUrl);
  const tx = useLoad(() => getTransaction(id), [id, cluster, rpcUrl]);
  const t = tx.data;
  return (
    <div className="se-page">
      <h2>
        <Icon name="file-text" size={24} /> Transaction
      </h2>
      {tx.loading ? (
        <p className="se-muted">Loading…</p>
      ) : tx.error ? (
        <p className="se-muted">Error: {tx.error}</p>
      ) : !t ? (
        <p className="se-muted">
          Transaction not found on {clusterLabel(cluster)}. It may be on a different cluster, or too old for this RPC node.
        </p>
      ) : (
        <>
          <table className="se-table">
            <tbody>
              <Row label="Signature">
                <span className="mono selectable">{id}</span>
              </Row>
              <Row label="Result">
                {t.meta?.err ? <span className="bad">Failed: {JSON.stringify(t.meta.err)}</span> : <span className="good">Success</span>}
              </Row>
              <Row label="Time">{t.blockTime ? new Date(t.blockTime * 1000).toLocaleString() : '—'}</Row>
              <Row label="Slot">{t.slot.toLocaleString('en-US')}</Row>
              <Row label="Fee">{formatSol(t.meta?.fee ?? 0, 9)} SOL</Row>
              <Row label="Fee payer">
                <Addr id={t.transaction.message.accountKeys[0].pubkey} nav={nav} />
              </Row>
              <Row label="Version">{String(t.version ?? 'legacy')}</Row>
            </tbody>
          </table>

          <h3>Account balance changes</h3>
          <table className="se-table list">
            <thead>
              <tr>
                <th>#</th>
                <th>Account</th>
                <th className="num">Change (SOL)</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {solDeltas(t).map((d, i) => {
                const k = t.transaction.message.accountKeys[i];
                return (
                  <tr key={`${d.account}-${i}`}>
                    <td>{i}</td>
                    <td>
                      <Addr id={d.account} nav={nav} />
                    </td>
                    <td className={`num ${d.lamports > 0 ? 'good' : d.lamports < 0 ? 'bad' : ''}`}>
                      {d.lamports === 0 ? '0' : `${d.lamports > 0 ? '+' : '−'}${formatSol(Math.abs(d.lamports), 9)}`}
                    </td>
                    <td>{[k.signer && 'Signer', k.writable && 'Writable'].filter(Boolean).join(', ')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {tokenDeltas(t).length > 0 && (
            <>
              <h3>Token balance changes</h3>
              <table className="se-table list">
                <thead>
                  <tr>
                    <th>Owner</th>
                    <th>Mint</th>
                    <th className="num">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {tokenDeltas(t).map((d) => (
                    <tr key={`${d.owner}-${d.mint}`}>
                      <td>{d.owner ? <Addr id={d.owner} nav={nav} /> : '—'}</td>
                      <td>
                        <Addr id={d.mint} nav={nav} />
                      </td>
                      <td className={`num ${d.delta.startsWith('-') ? 'bad' : 'good'}`}>
                        {d.delta.startsWith('-') ? '' : '+'}
                        {formatAmount(d.delta, d.decimals)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h3>Instructions</h3>
          <ol className="se-ix">
            {t.transaction.message.instructions.map((ix, i) => {
              const inner = t.meta?.innerInstructions?.find((x) => x.index === i)?.instructions ?? [];
              return (
                <li key={i}>
                  <b>{ixLabel(ix)}</b>
                  {ix.parsed !== undefined && (
                    <pre className="se-pre">{typeof ix.parsed === 'string' ? ix.parsed : JSON.stringify((ix.parsed as { info?: unknown }).info ?? ix.parsed, null, 2)}</pre>
                  )}
                  {inner.length > 0 && (
                    <ul>
                      {inner.map((x, j) => (
                        <li key={j}>{ixLabel(x)}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>

          {!!t.meta?.logMessages?.length && (
            <>
              <h3>Program logs</h3>
              <pre className="se-pre logs">{t.meta.logMessages.join('\n')}</pre>
            </>
          )}
        </>
      )}
    </div>
  );
}

export function SolExplorer({ windowId, args }: AppProps) {
  const initial = parseRoute(typeof args.url === 'string' ? args.url : 'sol://home');
  const [hist, setHist] = useState<{ stack: Route[]; i: number }>({ stack: [initial], i: 0 });
  const [address, setAddress] = useState(routeUrl(initial));
  const [favs, setFavs] = useState(loadFavs);
  const [reloadKey, setReloadKey] = useState(0);
  const cluster = useSettings((s) => s.cluster);
  const route = hist.stack[hist.i];

  const nav = useCallback((r: Route) => {
    setHist((h) => ({ stack: [...h.stack.slice(0, h.i + 1), r], i: h.i + 1 }));
  }, []);

  // Opening the app again with a URL (e.g. from My Wallet) navigates this window.
  useEffect(() => {
    if (typeof args.url === 'string') {
      const r = parseRoute(args.url);
      setHist((h) => (routeUrl(h.stack[h.i]) === routeUrl(r) ? h : { stack: [...h.stack.slice(0, h.i + 1), r], i: h.i + 1 }));
    }
  }, [args.url]);

  useEffect(() => {
    setAddress(routeUrl(route));
    const title = route.kind === 'home' ? 'Home' : route.kind === 'tx' ? `Transaction ${route.id.slice(0, 8)}…` : route.kind === 'address' ? `Account ${route.id.slice(0, 8)}…` : 'Cannot find page';
    setWindowTitle(windowId, `${title} - Solana Explorer`);
  }, [route, windowId]);

  const addFav = () => {
    const next = [...favs.filter((f) => f.url !== routeUrl(route)), { title: routeUrl(route).replace('sol://', ''), url: routeUrl(route) }].slice(-20);
    setFavs(next);
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
    } catch {
      // Non-critical.
    }
  };

  return (
    <div className="explorer sol-explorer">
      <MenuBar
        menus={[
          { label: 'File', items: [{ label: 'Close', onClick: () => closeWindow(windowId) }] },
          { label: 'View', items: [{ label: 'Refresh', shortcut: 'F5', onClick: () => setReloadKey((k) => k + 1) }] },
          {
            label: 'Favorites',
            items: [
              { label: 'Add to Favorites...', disabled: route.kind === 'invalid', onClick: addFav },
              ...(favs.length ? [sep] : []),
              ...favs.map((f) => ({ label: f.title.length > 40 ? `${f.title.slice(0, 40)}…` : f.title, onClick: () => nav(parseRoute(f.url)) })),
            ],
          },
          { label: 'Help', items: [{ label: 'About SolanaOS', onClick: () => openApp('about') }] },
        ]}
      />
      <div className="toolbar">
        <button type="button" className="tool-btn" disabled={hist.i <= 0} onClick={() => setHist((h) => ({ ...h, i: h.i - 1 }))}>
          <Icon name="back" size={22} />
          <span>Back</span>
        </button>
        <button type="button" className="tool-btn" disabled={hist.i >= hist.stack.length - 1} onClick={() => setHist((h) => ({ ...h, i: h.i + 1 }))}>
          <Icon name="forward" size={22} />
        </button>
        <button type="button" className="tool-btn" onClick={() => setReloadKey((k) => k + 1)} title="Refresh">
          <Icon name="restart" size={22} />
        </button>
        <button type="button" className="tool-btn" onClick={() => nav({ kind: 'home' })} title="Home">
          <Icon name="explorer-web" size={22} />
          <span>Home</span>
        </button>
      </div>
      <form
        className="address-bar"
        onSubmit={(e) => {
          e.preventDefault();
          nav(parseRoute(address));
        }}
      >
        <span className="address-label">Address</span>
        <span className="address-input">
          <Icon name="explorer-web" size={16} />
          <input value={address} onChange={(e) => setAddress(e.target.value)} aria-label="Address" spellCheck={false} onFocus={(e) => e.currentTarget.select()} />
        </span>
        <button type="submit" className="address-go">
          <Icon name="forward" size={16} /> Go
        </button>
      </form>
      <div className="se-viewport" key={`${reloadKey}-${hist.i}`}>
        {route.kind === 'home' && <Home nav={nav} />}
        {route.kind === 'address' && <AddressPage id={route.id} nav={nav} />}
        {route.kind === 'tx' && <TxPage id={route.id} nav={nav} />}
        {route.kind === 'invalid' && (
          <div className="se-page">
            <h2>
              <Icon name="error" size={24} /> The page cannot be displayed
            </h2>
            <p>'{route.input}' isn't a Solana address, transaction signature or explorer link.</p>
            <ul>
              <li>Check the address bar for typos.</li>
              <li>Addresses are 32–44 characters; signatures are 87–88 characters.</li>
            </ul>
          </div>
        )}
      </div>
      <div className="status-bar">
        <span>Done</span>
        <span>
          <Icon name="globe" size={12} /> {clusterLabel(cluster)}
        </span>
      </div>
    </div>
  );
}

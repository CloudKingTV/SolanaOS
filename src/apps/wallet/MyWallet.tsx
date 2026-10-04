import { useEffect, useMemo, useState } from 'react';
import { closeWindow, openApp, setWindowArgs, setWindowTitle, type AppProps } from '../../os/windows';
import { useWallet } from '../../os/wallet/standard';
import {
  fetchPortfolio,
  isCollectible,
  isEmpty,
  refreshPortfolio,
  rentLocked,
  tokenLabel,
  usePortfolio,
  type Holding,
} from '../../os/wallet/portfolio';
import { queueForBurn } from '../../os/wallet/burnQueue';
import { airdrop } from '../../os/wallet/airdrop';
import { copyText } from '../../os/wallet/actions';
import { chainFor, clusterLabel, endpointsFor, useSettings } from '../../os/settings';
import { formatAmount, formatSol, isLikelyAddress, rpcVia } from '../../os/solana/rpc';
import { getTokenImage } from '../../os/solana/metadata';
import { showBalloon, shortAddr } from '../../os/session';
import { messageBox } from '../../os/dialogs';
import { Icon } from '../../shell/icons';
import { MenuBar, openContextMenu, sep, type MenuItem } from '../../shell/Menu';

function TokenImage({ h, size }: { h: Holding; size: number }) {
  const [src, setSrc] = useState<string | undefined>();
  useEffect(() => {
    let live = true;
    if (h.meta?.uri) void getTokenImage(h.meta.uri).then((s) => live && setSrc(s));
    return () => {
      live = false;
    };
  }, [h.meta?.uri]);
  if (!src) return <Icon name="coin" size={size} />;
  return <img src={src} width={size} height={size} alt="" className="token-img" referrerPolicy="no-referrer" onError={() => setSrc(undefined)} />;
}

const driveLetter = (i: number) => `${String.fromCharCode(68 + (i % 23))}:`; // D: onward

export function MyWallet({ windowId, args }: AppProps) {
  const conn = useWallet((s) => s.connection);
  const viewAddress = typeof args.address === 'string' ? args.address : null;
  const own = !viewAddress || viewAddress === conn?.address;
  const owner = own ? (conn?.address ?? null) : viewAddress;
  const cluster = useSettings((s) => s.cluster);
  const customRpc = useSettings((s) => s.customRpcUrl);
  const isDevnet = chainFor(useSettings.getState()) === 'solana:devnet';

  const portfolio = usePortfolio();
  const [viewed, setViewed] = useState<{ lamports: number | null; tokens: Holding[]; loading: boolean; error: string | null; tokenError: string | null }>({
    lamports: null,
    tokens: [],
    loading: false,
    error: null,
    tokenError: null,
  });
  // When looking at Devnet, peek at Mainnet so a real balance isn't mistaken for missing funds.
  const [mainnetLamports, setMainnetLamports] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [addressInput, setAddressInput] = useState(owner ?? '');
  const [busy, setBusy] = useState(false);

  const loadViewed = () => {
    if (own || !viewAddress) return;
    setViewed((v) => ({ ...v, loading: true, error: null }));
    fetchPortfolio(viewAddress)
      .then((r) => setViewed({ ...r, loading: false, error: null }))
      .catch((e: unknown) => setViewed({ lamports: null, tokens: [], loading: false, error: e instanceof Error ? e.message : String(e), tokenError: null }));
  };
  useEffect(loadViewed, [own, viewAddress, cluster, customRpc]);

  useEffect(() => {
    setAddressInput(owner ?? '');
    setWindowTitle(windowId, own ? 'My Wallet' : `Wallet ${shortAddr(owner ?? '')}`);
  }, [own, owner, windowId]);

  useEffect(() => {
    setMainnetLamports(null);
    if (!owner || cluster === 'mainnet-beta') return;
    let live = true;
    rpcVia<{ value: number }>(endpointsFor({ cluster: 'mainnet-beta', customRpcUrl: '' }), 'getBalance', [owner])
      .then((r) => live && setMainnetLamports(r.value))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [owner, cluster]);

  const data = own
    ? { lamports: portfolio.lamports, tokens: portfolio.tokens, loading: portfolio.loading, error: portfolio.error, tokenError: portfolio.tokenError }
    : viewed;
  const refresh = () => (own ? void refreshPortfolio() : loadViewed());

  const fungible = data.tokens.filter((t) => !isEmpty(t) && !isCollectible(t));
  const nfts = data.tokens.filter((t) => isCollectible(t));
  const empties = data.tokens.filter((t) => isEmpty(t) && !t.isNative);
  const locked = rentLocked(data.tokens);
  const reclaimable = empties.reduce((s, t) => s + t.lamports, 0);
  const sel = data.tokens.find((t) => t.pubkey === selected) ?? null;

  const letters = useMemo(() => new Map(fungible.map((t, i) => [t.pubkey, driveLetter(i)])), [fungible]);

  const go = (input: string) => {
    const a = input.trim();
    if (!a || a === conn?.address) return setWindowArgs(windowId, {});
    if (!isLikelyAddress(a)) {
      void messageBox({ title: 'My Wallet', icon: 'error', message: `'${a}' is not a valid Solana address.`, owner: windowId });
      return;
    }
    setWindowArgs(windowId, { address: a });
  };

  const doAirdrop = async () => {
    if (!owner) return;
    setBusy(true);
    try {
      await airdrop(owner, 1);
      showBalloon({ title: 'Airdrop complete', icon: 'airdrop', message: '1 Devnet SOL is on its way to your wallet.' });
      refresh();
    } catch (e) {
      void messageBox({ title: 'Request Airdrop', icon: 'warning', message: e instanceof Error ? e.message : String(e), owner: windowId });
    } finally {
      setBusy(false);
    }
  };

  const tokenMenu = (h: Holding): MenuItem[] => [
    { label: 'View in Solana Explorer', bold: true, onClick: () => openApp('solexplorer', { url: `sol://address/${h.mint}` }) },
    ...(own
      ? [
          { label: 'Send...', disabled: isEmpty(h) || h.isNative, onClick: () => openApp('send', { token: h.pubkey }) },
          sep,
          {
            label: 'Send to Burn Bin',
            disabled: h.isNative,
            onClick: () => {
              queueForBurn(owner!, [h.pubkey]);
              showBalloon({ title: 'Burn Bin', icon: 'burn-full', message: `${tokenLabel(h)} is in the Burn Bin. Empty the Burn Bin to burn it and reclaim its rent.`, onClick: () => openApp('burnbin') });
            },
          },
        ]
      : []),
    sep,
    { label: 'Copy Mint Address', onClick: () => void copyText(h.mint, 'Mint address') },
  ];

  if (!owner) {
    return (
      <div className="explorer my-wallet">
        <div className="mw-empty">
          <Icon name="wallet" size={48} />
          <h2>No wallet connected</h2>
          <p>Connect a wallet to see your SOL and tokens, or look up any address read-only.</p>
          <button type="button" className="btn" onClick={() => openApp('connect')}>
            Connect Wallet...
          </button>
          <form
            className="mw-lookup"
            onSubmit={(e) => {
              e.preventDefault();
              go(addressInput);
            }}
          >
            <input value={addressInput} onChange={(e) => setAddressInput(e.target.value)} placeholder="Paste a Solana address" aria-label="Address to view" />
            <button type="submit" className="btn">
              View
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="explorer my-wallet">
      <MenuBar
        menus={[
          {
            label: 'File',
            items: [
              { label: 'Send SOL or Tokens...', disabled: !own, onClick: () => openApp('send') },
              { label: 'Copy Address', onClick: () => void copyText(owner) },
              sep,
              { label: 'Close', onClick: () => closeWindow(windowId) },
            ],
          },
          { label: 'View', items: [{ label: 'Refresh', shortcut: 'F5', onClick: refresh }, ...(own ? [] : [{ label: 'My Wallet', onClick: () => go('') }])] },
          { label: 'Help', items: [{ label: 'About SolanaOS', onClick: () => openApp('about') }] },
        ]}
      />
      <form
        className="address-bar"
        onSubmit={(e) => {
          e.preventDefault();
          go(addressInput);
        }}
      >
        <span className="address-label">Address</span>
        <span className="address-input">
          <Icon name="wallet" size={16} />
          <input value={addressInput} onChange={(e) => setAddressInput(e.target.value)} aria-label="Wallet address" spellCheck={false} />
        </span>
        <button type="submit" className="address-go">
          <Icon name="forward" size={16} /> Go
        </button>
      </form>
      <div className="explorer-main" onKeyDown={(e) => e.key === 'F5' && refresh()}>
        <aside className="task-pane">
          <section className="tp-section">
            <h3>Wallet Tasks</h3>
            <div className="tp-body">
              {own && (
                <button type="button" onClick={() => openApp('send')}>
                  <Icon name="send" size={16} /> Send SOL or tokens
                </button>
              )}
              <button type="button" onClick={() => void copyText(owner)}>
                <Icon name="inbox" size={16} /> {own ? 'Receive (copy my address)' : 'Copy this address'}
              </button>
              {own && isDevnet && (
                <button type="button" disabled={busy} onClick={() => void doAirdrop()}>
                  <Icon name="airdrop" size={16} /> {busy ? 'Requesting airdrop…' : 'Request 1 Devnet SOL'}
                </button>
              )}
              <button type="button" onClick={() => openApp('solexplorer', { url: `sol://address/${owner}` })}>
                <Icon name="explorer-web" size={16} /> View in Solana Explorer
              </button>
              <button type="button" onClick={refresh}>
                <Icon name="restart" size={16} /> Refresh
              </button>
            </div>
          </section>
          <section className="tp-section">
            <h3>Other Places</h3>
            <div className="tp-body">
              {!own && (
                <button type="button" onClick={() => go('')}>
                  <Icon name="wallet" size={16} /> My Wallet
                </button>
              )}
              <button type="button" onClick={() => openApp('burnbin')}>
                <Icon name="burn-full" size={16} /> Burn Bin
              </button>
              <button type="button" onClick={() => openApp('inbox')}>
                <Icon name="inbox" size={16} /> Inbox
              </button>
              <button type="button" onClick={() => openApp('collectibles')}>
                <Icon name="collectibles" size={16} /> My Collectibles
              </button>
              <button type="button" onClick={() => openApp('staking')}>
                <Icon name="stake" size={16} /> Staking
              </button>
              <button type="button" onClick={() => openApp('swap')}>
                <Icon name="swap" size={16} /> Swap
              </button>
            </div>
          </section>
          <section className="tp-section">
            <h3>Details</h3>
            <div className="tp-body tp-details selectable">
              {sel ? (
                <>
                  <b>{sel.meta?.name || tokenLabel(sel)}</b>
                  <span>
                    {formatAmount(sel.amount, sel.decimals)} {sel.meta?.symbol}
                  </span>
                  <span>Mint: {shortAddr(sel.mint)}</span>
                  <span>Account: {shortAddr(sel.pubkey)}</span>
                  <span>{sel.programId.startsWith('Tokenz') ? 'Token-2022' : 'SPL Token'}</span>
                </>
              ) : (
                <>
                  <b>{own ? (conn?.wallet.name ?? 'Wallet') : 'Viewing (read-only)'}</b>
                  <span title={owner}>{shortAddr(owner)}</span>
                  <span>{clusterLabel(cluster)}</span>
                </>
              )}
            </div>
          </section>
        </aside>
        <div className="mw-main" onClick={() => setSelected(null)}>
          <div className={`mw-cluster ${cluster}`}>
            <Icon name="globe" size={16} />
            <span>
              Showing balances on <b>{clusterLabel(cluster)}</b>
              {cluster !== 'mainnet-beta' && ' (test network; its SOL has no value)'}.
            </span>
            {cluster !== 'mainnet-beta' && mainnetLamports !== null && mainnetLamports > 0 && (
              <span className="mw-cluster-peek">
                This wallet has <b>{formatSol(mainnetLamports, 6)} SOL</b> on Mainnet.{' '}
                <button
                  type="button"
                  className="link-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    useSettings.getState().update({ cluster: 'mainnet-beta' });
                  }}
                >
                  Switch to Mainnet
                </button>
              </span>
            )}
          </div>
          {data.tokenError && !data.error && (
            <div className="nm-error">
              <Icon name="warning" size={16} /> Your SOL balance is current, but tokens couldn't be read ({data.tokenError}). The public RPC limits these
              lookups; a custom RPC in Network Settings fixes it.
            </div>
          )}
          {data.error && (
            <div className="nm-error">
              <Icon name="warning" size={16} /> Couldn't load this wallet: {data.error}
            </div>
          )}
          <h4 className="mw-group">Wallet Drives</h4>
          <div className="mw-tiles">
            <div
              className={`mw-drive${selected === 'sol' ? ' selected' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setSelected('sol');
              }}
              onDoubleClick={() => openApp('solexplorer', { url: `sol://address/${owner}` })}
            >
              <Icon name="drive" size={48} />
              <div className="mw-drive-text">
                <b>Solana (C:)</b>
                <div className="mw-bar" title={`${formatSol(locked, 6)} SOL is locked as rent in token accounts`}>
                  <div
                    className="mw-bar-fill"
                    style={{ width: `${data.lamports ? Math.min(100, (locked / (data.lamports + locked)) * 100) : 0}%` }}
                  />
                </div>
                <span className="fv-meta">
                  {data.lamports === null ? (data.loading ? 'Reading…' : '—') : `${formatSol(data.lamports, 6)} SOL free`}
                  {locked > 0 && ` · ${formatSol(locked, 6)} SOL in rent`}
                </span>
              </div>
            </div>
            {empties.length > 0 && (
              <div className="mw-drive" onDoubleClick={() => openApp('burnbin')} onClick={(e) => e.stopPropagation()}>
                <Icon name="burn-full" size={48} />
                <div className="mw-drive-text">
                  <b>Empty token accounts</b>
                  <span className="fv-meta">
                    {empties.length} account{empties.length === 1 ? '' : 's'} · {formatSol(reclaimable, 6)} SOL reclaimable
                  </span>
                  {own && (
                    <button type="button" className="link-btn" onClick={() => openApp('burnbin')}>
                      Reclaim in Burn Bin
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <h4 className="mw-group">Tokens</h4>
          <div className="mw-tiles">
            {!fungible.length && <div className="fv-empty">{data.loading ? 'Reading tokens…' : 'No tokens.'}</div>}
            {fungible.map((h) => (
              <div
                key={h.pubkey}
                className={`mw-drive${selected === h.pubkey ? ' selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(h.pubkey);
                }}
                onDoubleClick={() => openApp('solexplorer', { url: `sol://address/${h.mint}` })}
                onContextMenu={(e) => {
                  e.stopPropagation();
                  setSelected(h.pubkey);
                  openContextMenu(e, tokenMenu(h));
                }}
              >
                <TokenImage h={h} size={48} />
                <div className="mw-drive-text">
                  <b>
                    {tokenLabel(h)} ({letters.get(h.pubkey)})
                  </b>
                  <span>{formatAmount(h.amount, h.decimals, 6)}</span>
                  <span className="fv-meta">{h.meta?.name || shortAddr(h.mint)}</span>
                </div>
              </div>
            ))}
          </div>

          {nfts.length > 0 && (
            <>
              <h4 className="mw-group">Collectibles</h4>
              <div className="mw-tiles nft">
                {nfts.map((h) => (
                  <div
                    key={h.pubkey}
                    className={`mw-nft${selected === h.pubkey ? ' selected' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(h.pubkey);
                    }}
                    onDoubleClick={() => openApp('solexplorer', { url: `sol://address/${h.mint}` })}
                    onContextMenu={(e) => {
                      e.stopPropagation();
                      setSelected(h.pubkey);
                      openContextMenu(e, tokenMenu(h));
                    }}
                  >
                    <TokenImage h={h} size={72} />
                    <span>{h.meta?.name || shortAddr(h.mint)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <p className="mw-note">
            Token names come from on-chain metadata and can be set by anyone. Never trust links or offers in a token's name.
          </p>
        </div>
      </div>
      <div className="status-bar">
        <span>
          {data.tokens.length} token account(s){data.loading ? ' · refreshing…' : ''}
        </span>
        <span>{data.lamports !== null ? `${formatSol(data.lamports, 4)} SOL` : ''}</span>
        <span>{own ? 'Connected wallet' : 'Read-only view'}</span>
      </div>
    </div>
  );
}


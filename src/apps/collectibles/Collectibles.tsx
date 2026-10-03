import { useEffect, useMemo, useState } from 'react';
import { openApp, type AppProps } from '../../os/windows';
import { useWallet } from '../../os/wallet/standard';
import { isCollectible, refreshPortfolio, usePortfolio } from '../../os/wallet/portfolio';
import { queueForBurn } from '../../os/wallet/burnQueue';
import { getCoreAssets, type CoreAsset } from '../../os/nft/core';
import { getTokenImage } from '../../os/solana/metadata';
import { clusterLabel, useSettings } from '../../os/settings';
import { showBalloon, shortAddr } from '../../os/session';
import { Icon } from '../../shell/icons';
import { openContextMenu, sep } from '../../shell/Menu';
import type { PictureItem } from '../pictures/PictureViewer';

interface Collectible {
  key: string;
  name: string;
  uri: string;
  /** Mint (Token Metadata NFTs) or asset address (Core). */
  address: string;
  standard: 'Token Metadata' | 'Core';
  tokenAccount?: string;
}

function Thumb({ uri, onImage }: { uri: string; onImage: (src: string | undefined) => void }) {
  const [src, setSrc] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    void getTokenImage(uri).then((s) => {
      if (!live) return;
      setSrc(s);
      onImage(s);
    });
    return () => {
      live = false;
    };
    // onImage is stable per item for our purposes.
  }, [uri]);
  if (!src || failed) return <Icon name="collectibles" size={64} />;
  return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

export function Collectibles(_: AppProps) {
  const conn = useWallet((s) => s.connection);
  const owner = conn?.address ?? null;
  const tokens = usePortfolio((s) => s.tokens);
  const cluster = useSettings((s) => s.cluster);
  const customRpc = useSettings((s) => s.customRpcUrl);
  const [core, setCore] = useState<CoreAsset[]>([]);
  const [coreError, setCoreError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [images, setImages] = useState<Record<string, string | undefined>>({});

  const load = () => {
    if (!owner) return;
    setLoading(true);
    setCoreError(null);
    void refreshPortfolio();
    getCoreAssets(owner)
      .then(setCore)
      .catch((e: unknown) => {
        setCore([]);
        setCoreError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, [owner, cluster, customRpc]);

  const items: Collectible[] = useMemo(
    () => [
      ...core.map((a) => ({ key: a.address, name: a.name, uri: a.uri, address: a.address, standard: 'Core' as const })),
      ...tokens
        .filter(isCollectible)
        .map((t) => ({ key: t.pubkey, name: t.meta?.name || shortAddr(t.mint), uri: t.meta?.uri ?? '', address: t.mint, standard: 'Token Metadata' as const, tokenAccount: t.pubkey })),
    ],
    [core, tokens],
  );
  const sel = items.find((i) => i.key === selected) ?? null;

  const viewerItems = (): PictureItem[] =>
    items.filter((i) => images[i.key]).map((i) => ({ src: images[i.key]!, title: i.name, address: i.address }));
  const openViewer = (key?: string) => {
    const list = viewerItems();
    const idx = Math.max(0, list.findIndex((p) => p.address === items.find((i) => i.key === key)?.address));
    if (list.length) openApp('pictures', { items: list, index: idx });
  };

  if (!owner) {
    return (
      <div className="explorer">
        <div className="mw-empty">
          <Icon name="collectibles" size={48} />
          <h2>My Collectibles</h2>
          <p>Connect a wallet to see your NFTs.</p>
          <button type="button" className="btn" onClick={() => openApp('connect')}>
            Connect Wallet...
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="explorer collectibles">
      <div className="explorer-main">
        <aside className="task-pane">
          <section className="tp-section">
            <h3>Picture Tasks</h3>
            <div className="tp-body">
              <button type="button" disabled={!viewerItems().length} onClick={() => openViewer()}>
                <Icon name="display" size={16} /> View as a slide show
              </button>
              <button type="button" onClick={() => openApp('paint')}>
                <Icon name="paint" size={16} /> Paint and mint a new NFT
              </button>
              <button type="button" disabled={loading} onClick={load}>
                <Icon name="restart" size={16} /> {loading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </section>
          <section className="tp-section">
            <h3>Other Places</h3>
            <div className="tp-body">
              <button type="button" onClick={() => openApp('mywallet')}>
                <Icon name="wallet" size={16} /> My Wallet
              </button>
              <button type="button" onClick={() => openApp('explorer', { path: 'C:\\My Documents\\My Pictures' })}>
                <Icon name="my-pictures" size={16} /> My Pictures
              </button>
            </div>
          </section>
          <section className="tp-section">
            <h3>Details</h3>
            <div className="tp-body tp-details selectable">
              {sel ? (
                <>
                  <b>{sel.name}</b>
                  <span>{sel.standard} NFT</span>
                  <span title={sel.address}>{shortAddr(sel.address)}</span>
                </>
              ) : (
                <>
                  <b>{items.length} collectible(s)</b>
                  <span>{clusterLabel(cluster)}</span>
                </>
              )}
            </div>
          </section>
        </aside>
        <div className="coll-main" onClick={() => setSelected(null)}>
          {coreError && (
            <div className="nm-error">
              <Icon name="warning" size={16} /> Core NFTs couldn't be listed by this RPC ({coreError}). A custom RPC in Network Settings usually fixes this.
            </div>
          )}
          {!items.length ? (
            <div className="fv-empty">{loading ? 'Looking for collectibles…' : 'No collectibles yet. Open Paint and choose File → Mint as NFT to make one.'}</div>
          ) : (
            <div className="coll-grid">
              {items.map((i) => (
                <div
                  key={i.key}
                  className={`coll-item${selected === i.key ? ' selected' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(i.key);
                  }}
                  onDoubleClick={() => openViewer(i.key)}
                  onContextMenu={(e) => {
                    e.stopPropagation();
                    setSelected(i.key);
                    openContextMenu(e, [
                      { label: 'Preview', bold: true, disabled: !images[i.key], onClick: () => openViewer(i.key) },
                      { label: 'View in Solana Explorer', onClick: () => openApp('solexplorer', { url: `sol://address/${i.address}` }) },
                      ...(i.tokenAccount
                        ? [
                            sep,
                            {
                              label: 'Send to Burn Bin',
                              onClick: () => {
                                queueForBurn(owner, [i.tokenAccount!]);
                                showBalloon({ title: 'Burn Bin', icon: 'burn-full', message: `${i.name} is in the Burn Bin.`, onClick: () => openApp('burnbin') });
                              },
                            },
                          ]
                        : []),
                    ]);
                  }}
                >
                  <div className="coll-thumb">
                    <Thumb uri={i.uri} onImage={(src) => setImages((m) => (m[i.key] === src ? m : { ...m, [i.key]: src }))} />
                  </div>
                  <span>{i.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="status-bar">
        <span>{items.length} object(s)</span>
        <span>{shortAddr(owner)}</span>
      </div>
    </div>
  );
}

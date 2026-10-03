import { useCallback, useEffect, useMemo, useState } from 'react';
import { openApp, setWindowTitle, type AppProps } from '../../os/windows';
import { useWallet } from '../../os/wallet/standard';
import { tokenLabel, usePortfolio } from '../../os/wallet/portfolio';
import { getSignaturesForAddress, getTransaction, formatSol, formatAmount, type ParsedTransaction, type SignatureInfo } from '../../os/solana/rpc';
import { getTokenMetadata } from '../../os/solana/metadata';
import { summarize, type Summary } from '../../os/solana/txSummary';
import { clusterLabel, useSettings } from '../../os/settings';
import { shortAddr } from '../../os/session';
import { Icon } from '../../shell/icons';
import { MenuBar } from '../../shell/Menu';

interface Message {
  sig: SignatureInfo;
  tx: ParsedTransaction | null;
  summary: Summary | null;
}

type Folder = 'inbox' | 'sent' | 'all';

const READ_KEY = 'solanaos.inbox.read.v1';

function loadRead(): Record<string, true> {
  try {
    return JSON.parse(localStorage.getItem(READ_KEY) ?? '{}');
  } catch {
    return {};
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

export function Inbox({ windowId }: AppProps) {
  const conn = useWallet((s) => s.connection);
  const owner = conn?.address ?? null;
  const tokens = usePortfolio((s) => s.tokens);
  const cluster = useSettings((s) => s.cluster);
  const rpcUrl = useSettings((s) => s.customRpcUrl);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folder, setFolder] = useState<Folder>('inbox');
  const [selected, setSelected] = useState<string | null>(null);
  const [read, setRead] = useState(loadRead);
  const [labels, setLabels] = useState<Map<string, string>>(new Map());

  const label = useCallback(
    (mint: string) => {
      const t = tokens.find((x) => x.mint === mint);
      return t ? tokenLabel(t) : (labels.get(mint) ?? `${mint.slice(0, 4)}…`);
    },
    [tokens, labels],
  );

  const load = useCallback(async () => {
    if (!owner) return;
    setLoading(true);
    setError(null);
    try {
      const sigs = await getSignaturesForAddress(owner, 25);
      const txs = await mapLimit(sigs, 4, (s) => getTransaction(s.signature).catch(() => null));
      // Look up names for tokens that aren't in the wallet anymore.
      const mints = new Map<string, string>();
      for (const tx of txs) for (const b of tx?.meta?.postTokenBalances ?? []) mints.set(b.mint, b.programId ?? '');
      const meta = await getTokenMetadata([...mints].map(([mint, programId]) => ({ mint, programId }))).catch(() => new Map());
      setLabels(new Map([...meta].filter(([, m]) => m?.symbol || m?.name).map(([k, m]) => [k, m!.symbol || m!.name])));
      setMessages(sigs.map((sig, i) => ({ sig, tx: txs[i], summary: null })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [owner]);

  useEffect(() => {
    setMessages([]);
    setSelected(null);
    void load();
  }, [load, cluster, rpcUrl]);

  const withSummaries = useMemo(
    () => messages.map((m) => ({ ...m, summary: m.tx && owner ? summarize(m.tx, owner, label) : null })),
    [messages, owner, label],
  );

  const inFolder = withSummaries.filter((m) => {
    if (folder === 'all') return true;
    const d = m.summary?.direction ?? 'other';
    return folder === 'sent' ? d === 'out' || d === 'self' : d === 'in' || d === 'other';
  });
  const unread = withSummaries.filter((m) => !read[m.sig.signature] && (m.summary?.direction === 'in' || m.summary?.direction === 'other')).length;
  const current = withSummaries.find((m) => m.sig.signature === selected) ?? null;

  useEffect(() => {
    setWindowTitle(windowId, unread ? `Inbox (${unread}) - Solana Mail` : 'Inbox - Solana Mail');
  }, [unread, windowId]);

  const open = (sig: string) => {
    setSelected(sig);
    if (!read[sig]) {
      const next = { ...read, [sig]: true as const };
      setRead(next);
      try {
        localStorage.setItem(READ_KEY, JSON.stringify(next));
      } catch {
        // Non-critical.
      }
    }
  };

  if (!owner) {
    return (
      <div className="explorer">
        <div className="mw-empty">
          <Icon name="inbox" size={48} />
          <h2>Solana Mail</h2>
          <p>Connect a wallet to see its transactions as messages.</p>
          <button type="button" className="btn" onClick={() => openApp('connect')}>
            Connect Wallet...
          </button>
        </div>
      </div>
    );
  }

  const folders: { id: Folder; label: string; icon: 'inbox' | 'send' | 'folder' }[] = [
    { id: 'inbox', label: unread ? `Inbox (${unread})` : 'Inbox', icon: 'inbox' },
    { id: 'sent', label: 'Sent Items', icon: 'send' },
    { id: 'all', label: 'All Activity', icon: 'folder' },
  ];

  return (
    <div className="explorer inbox">
      <MenuBar
        menus={[
          { label: 'File', items: [{ label: 'New Message (Send...)', onClick: () => openApp('send') }] },
          { label: 'Tools', items: [{ label: 'Send/Recv', shortcut: 'F5', onClick: () => void load() }] },
          { label: 'Help', items: [{ label: 'About SolanaOS', onClick: () => openApp('about') }] },
        ]}
      />
      <div className="toolbar">
        <button type="button" className="tool-btn" onClick={() => openApp('send')}>
          <Icon name="send" size={22} />
          <span>Create</span>
        </button>
        <button type="button" className="tool-btn" disabled={loading} onClick={() => void load()}>
          <Icon name="restart" size={22} />
          <span>{loading ? 'Receiving…' : 'Send/Recv'}</span>
        </button>
        <button
          type="button"
          className="tool-btn"
          disabled={!current}
          onClick={() => current && openApp('solexplorer', { url: `sol://tx/${current.sig.signature}` })}
        >
          <Icon name="explorer-web" size={22} />
          <span>Open in Explorer</span>
        </button>
      </div>
      <div className="explorer-main">
        <aside className="ib-folders">
          <div className="ib-folders-head">Folders</div>
          {folders.map((f) => (
            <button key={f.id} type="button" className={folder === f.id ? 'selected' : ''} onClick={() => setFolder(f.id)}>
              <Icon name={f.icon} size={16} /> {f.label}
            </button>
          ))}
        </aside>
        <div className="ib-main">
          <div className="list-box ib-list">
            {error ? (
              <div className="fv-empty">Couldn't read your history: {error}</div>
            ) : !inFolder.length ? (
              <div className="fv-empty">{loading ? 'Receiving messages…' : 'There are no messages in this folder.'}</div>
            ) : (
              <table className="fv-table">
                <thead>
                  <tr>
                    <th />
                    <th>From</th>
                    <th>Subject</th>
                    <th>Received</th>
                  </tr>
                </thead>
                <tbody>
                  {inFolder.map((m) => (
                    <tr
                      key={m.sig.signature}
                      className={`fv-item${selected === m.sig.signature ? ' selected' : ''}${!read[m.sig.signature] && m.summary?.direction !== 'out' ? ' unread' : ''}`}
                      onClick={() => open(m.sig.signature)}
                      onDoubleClick={() => openApp('solexplorer', { url: `sol://tx/${m.sig.signature}` })}
                    >
                      <td>{m.summary?.failed ? <Icon name="error" size={14} /> : <Icon name={m.summary?.direction === 'out' ? 'send' : 'inbox'} size={14} />}</td>
                      <td>{m.summary?.counterparty ? shortAddr(m.summary.counterparty) : m.summary?.direction === 'out' || m.summary?.direction === 'self' ? 'Me' : '—'}</td>
                      <td>{m.summary?.subject ?? 'Transaction'}</td>
                      <td>{m.sig.blockTime ? new Date(m.sig.blockTime * 1000).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="ib-preview selectable">
            {current ? (
              <>
                <div className="ib-preview-head">
                  <div>
                    <b>From:</b> {current.summary?.counterparty ?? (current.summary?.direction === 'out' ? shortAddr(owner) : 'Unknown')}
                  </div>
                  <div>
                    <b>Date:</b> {current.sig.blockTime ? new Date(current.sig.blockTime * 1000).toLocaleString() : '—'}
                  </div>
                  <div>
                    <b>Subject:</b> {current.summary?.subject}
                  </div>
                </div>
                <div className="ib-preview-body">
                  {current.summary?.memo && <p className="ib-memo">“{current.summary.memo}”</p>}
                  {current.summary && current.summary.solChange !== 0 && (
                    <p>
                      SOL: {current.summary.solChange > 0 ? '+' : '−'}
                      {formatSol(Math.abs(current.summary.solChange), 9)}
                    </p>
                  )}
                  {current.summary?.tokenChanges.map((t) => (
                    <p key={t.mint}>
                      {label(t.mint)}: {t.delta.startsWith('-') ? '' : '+'}
                      {formatAmount(t.delta, t.decimals)}
                    </p>
                  ))}
                  <p>
                    Network fee: {formatSol(current.tx?.meta?.fee ?? 0, 9)} SOL · Slot {current.sig.slot.toLocaleString('en-US')} ·{' '}
                    {current.summary?.failed ? 'Failed' : 'Confirmed'}
                  </p>
                  <button type="button" className="link-btn" onClick={() => openApp('solexplorer', { url: `sol://tx/${current.sig.signature}` })}>
                    Open the full transaction in Solana Explorer
                  </button>
                </div>
              </>
            ) : (
              <div className="fv-empty">Select a message to read it.</div>
            )}
          </div>
        </div>
      </div>
      <div className="status-bar">
        <span>
          {inFolder.length} message(s), {unread} unread
        </span>
        <span>{clusterLabel(cluster)}</span>
      </div>
    </div>
  );
}

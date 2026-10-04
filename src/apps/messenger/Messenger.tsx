import { useEffect, useMemo, useState } from 'react';
import { closeWindow, focusWindow, openApp, useWindows, type AppProps } from '../../os/windows';
import { useWallet } from '../../os/wallet/standard';
import { clusterLabel, useSettings } from '../../os/settings';
import { copyText } from '../../os/wallet/actions';
import { messageBox } from '../../os/dialogs';
import {
  addContact,
  checkMessages,
  contactName,
  peerOf,
  removeContact,
  setIncomingHandler,
  unreadCount,
  useMessenger,
  watchMessages,
  type ChatMessage,
} from '../../os/messenger/messenger';
import { Icon } from '../../shell/icons';
import { MenuBar, openContextMenu, sep } from '../../shell/Menu';
import { WalletIcon } from '../../shell/WalletPicker';

/** Open (or focus) the conversation window with `peer`. */
export function openChat(peer: string) {
  const existing = useWindows.getState().windows.find((w) => w.appId === 'chat' && w.args.peer === peer);
  if (existing) focusWindow(existing.id);
  else openApp('chat', { peer });
}

interface Buddy {
  address: string;
  name: string;
  last: ChatMessage | null;
  unread: number;
  saved: boolean;
}

export function Messenger({ windowId }: AppProps) {
  const conn = useWallet((s) => s.connection);
  const owner = conn?.address ?? null;
  const cluster = useSettings((s) => s.cluster);
  const { messages, contacts, read, loading, error, lastChecked } = useMessenger();
  const [adding, setAdding] = useState(false);
  const [addr, setAddr] = useState('');
  const [nick, setNick] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => watchMessages(), []);
  useEffect(() => {
    setIncomingHandler(openChat);
    return () => setIncomingHandler(null);
  }, []);

  const buddies = useMemo(() => {
    if (!owner) return { saved: [] as Buddy[], others: [] as Buddy[] };
    const lastBy = new Map<string, ChatMessage>();
    for (const m of messages) lastBy.set(peerOf(m, owner), m);
    const make = (address: string, saved: boolean): Buddy => ({
      address,
      name: contactName(address, contacts),
      last: lastBy.get(address) ?? null,
      unread: unreadCount(messages, read, owner, address),
      saved,
    });
    const saved = contacts.filter((c) => c.address !== owner).map((c) => make(c.address, true));
    const others = [...lastBy.keys()]
      .filter((a) => !contacts.some((c) => c.address === a))
      .map((a) => make(a, false))
      .sort((x, y) => (y.last?.time ?? 0) - (x.last?.time ?? 0));
    return { saved, others };
  }, [owner, messages, contacts, read]);

  const submitAdd = () => {
    try {
      addContact(addr, nick);
      setAdding(false);
      setAddr('');
      setNick('');
      setAddError(null);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    }
  };

  const rename = (b: Buddy) => {
    setAddr(b.address);
    setNick(b.saved ? b.name : '');
    setAddError(null);
    setAdding(true);
  };

  const buddyMenu = (e: React.MouseEvent, b: Buddy) => {
    e.preventDefault();
    openContextMenu(e, [
      { label: 'Send a Message', bold: true, onClick: () => openChat(b.address) },
      sep,
      b.saved ? { label: 'Rename...', onClick: () => rename(b) } : { label: 'Add to Contacts...', onClick: () => rename(b) },
      { label: 'Copy Address', onClick: () => void copyText(b.address) },
      { label: 'View in Solana Explorer', onClick: () => openApp('solexplorer', { url: `sol://address/${b.address}` }) },
      ...(b.saved ? [sep, { label: 'Delete Contact', onClick: () => removeContact(b.address) }] : []),
    ]);
  };

  const group = (key: string, title: string, list: Buddy[], empty: string) => (
    <div className="ms-group">
      <button type="button" className="ms-group-head" onClick={() => setCollapsed((c) => ({ ...c, [key]: !c[key] }))}>
        {collapsed[key] ? '▸' : '▾'} {title} ({list.length})
      </button>
      {!collapsed[key] && (
        <ul>
          {list.length === 0 && <li className="ms-empty">{empty}</li>}
          {list.map((b) => (
            <li
              key={b.address}
              className={b.unread ? 'unread' : ''}
              tabIndex={0}
              onDoubleClick={() => openChat(b.address)}
              onKeyDown={(e) => e.key === 'Enter' && openChat(b.address)}
              onContextMenu={(e) => buddyMenu(e, b)}
              title={`${b.address}\nDouble-click to chat`}
            >
              <span className={`ms-dot${b.last ? ' on' : ''}`} />
              <span className="ms-name">
                {b.name}
                {b.unread > 0 && <b> ({b.unread})</b>}
              </span>
              {b.last && <span className="ms-preview">{b.last.nudge ? '— nudge —' : b.last.text}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="messenger">
      <MenuBar
        menus={[
          {
            label: 'File',
            items: [
              { label: 'Add a Contact...', disabled: !owner, onClick: () => setAdding(true) },
              { label: 'Check for Messages', disabled: !owner, onClick: () => void checkMessages() },
              sep,
              { label: 'Close', onClick: () => closeWindow(windowId) },
            ],
          },
          {
            label: 'Help',
            items: [
              {
                label: 'How SolMessenger Works',
                onClick: () =>
                  void messageBox({
                    title: 'SolMessenger',
                    icon: 'info',
                    owner: windowId,
                    message:
                      'Each message is a Solana transaction: a memo with your text plus a 0 SOL transfer to your buddy, so it shows up in both wallets. You pay the network fee (about 0.000005 SOL) and sign every message in your wallet.\n\nMessages are public and permanent — anyone can read them on-chain. Never send anything private, and treat links from strangers as scams.\n\nSolMessenger checks for new messages every 20 seconds while it is open. Type /nudge to shake your buddy\'s window.',
                  }),
              },
            ],
          },
        ]}
      />
      <div className="ms-banner">
        <Icon name="messenger" size={32} />
        <div>
          <b>SolMessenger</b>
          <small>{clusterLabel(cluster)}</small>
        </div>
      </div>
      {!owner ? (
        <div className="ms-signin">
          <p>Sign in with a wallet to chat with other wallets.</p>
          <button type="button" className="btn" onClick={() => openApp('connect')}>
            Connect Wallet...
          </button>
        </div>
      ) : (
        <>
          <div className="ms-me">
            <WalletIcon src={conn?.wallet.icon} size={28} />
            <div>
              <b>{contactName(owner, contacts)}</b> <span className="ms-online">(Online)</span>
              <small>{loading ? 'Checking for messages…' : lastChecked ? `Checked ${new Date(lastChecked).toLocaleTimeString()}` : ''}</small>
            </div>
          </div>
          <div className="ms-warning">⚠ Messages are public and permanent on-chain. Each one costs a network fee.</div>
          {error && <div className="ms-error">Couldn't check messages: {error}</div>}
          <div className="ms-list">
            {group('saved', 'Contacts', buddies.saved, 'No contacts yet — add a wallet address.')}
            {group('others', 'Other wallets that messaged you', buddies.others, 'Nobody else yet.')}
          </div>
          {adding ? (
            <form
              className="ms-add"
              onSubmit={(e) => {
                e.preventDefault();
                submitAdd();
              }}
            >
              <label>
                Wallet address
                <input type="text" value={addr} onChange={(e) => setAddr(e.target.value)} autoFocus spellCheck={false} />
              </label>
              <label>
                Nickname (optional)
                <input type="text" value={nick} onChange={(e) => setNick(e.target.value)} maxLength={40} />
              </label>
              {addError && <div className="ms-error">{addError}</div>}
              <div className="ms-add-buttons">
                <button type="submit" className="btn">
                  Add
                </button>
                <button type="button" className="btn" onClick={() => (setAdding(false), setAddError(null))}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="ms-actions">
              <button type="button" className="btn" onClick={() => setAdding(true)}>
                + Add a Contact
              </button>
              <button type="button" className="btn" disabled={loading} onClick={() => void checkMessages()}>
                Refresh
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

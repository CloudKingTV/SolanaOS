import { useEffect, useMemo, useRef, useState } from 'react';
import { openApp, setWindowTitle, type AppProps } from '../../os/windows';
import { useWallet } from '../../os/wallet/standard';
import { messageBox } from '../../os/dialogs';
import { isLikelyAddress } from '../../os/solana/rpc';
import {
  MAX_MESSAGE_BYTES,
  NUDGE,
  contactName,
  markRead,
  messageBytes,
  peerOf,
  sendMessage,
  useMessenger,
  watchMessages,
  type ChatMessage,
} from '../../os/messenger/messenger';
import { Icon } from '../../shell/icons';

function when(t: number | null): string {
  if (t == null) return 'sending…';
  const d = new Date(t * 1000);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}

export function Chat({ windowId, args }: AppProps) {
  const peer = typeof args.peer === 'string' ? args.peer : '';
  const owner = useWallet((s) => s.connection?.address ?? null);
  const { messages, pending, contacts, nudges } = useMessenger();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const name = contactName(peer, contacts);

  useEffect(() => watchMessages(), []);
  useEffect(() => setWindowTitle(windowId, `${name} - Conversation`), [windowId, name]);

  const thread = useMemo(() => {
    if (!owner) return [] as ChatMessage[];
    return [...messages, ...pending].filter((m) => peerOf(m, owner) === peer);
  }, [messages, pending, owner, peer]);

  // Mark read and keep the log scrolled to the newest message.
  useEffect(() => {
    if (owner) markRead(peer);
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.length, owner, peer]);

  // Shake the window when this buddy nudges us.
  const nudgeCount = nudges[peer] ?? 0;
  useEffect(() => {
    if (!nudgeCount) return;
    const el = document.querySelector<HTMLElement>(`[data-window-id="${windowId}"]`);
    if (!el) return;
    el.classList.remove('nudge');
    void el.offsetWidth;
    el.classList.add('nudge');
    const t = window.setTimeout(() => el.classList.remove('nudge'), 800);
    return () => window.clearTimeout(t);
  }, [nudgeCount, windowId]);

  const bytes = messageBytes(draft.trim());
  const tooLong = bytes > MAX_MESSAGE_BYTES;

  const send = async (text: string) => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await sendMessage(peer, text);
      if (text === draft) setDraft('');
    } catch (e) {
      void messageBox({ title: 'Message not sent', icon: 'error', message: e instanceof Error ? e.message : String(e), owner: windowId });
    } finally {
      setSending(false);
    }
  };

  if (!isLikelyAddress(peer)) {
    return <div className="chat chat-empty">No buddy selected.</div>;
  }

  return (
    <div className="chat">
      <div className="chat-to">
        <Icon name="messenger" size={22} />
        <span>
          To: <b>{name}</b> <small>&lt;{peer}&gt;</small>
        </span>
      </div>
      <div className="chat-warning">Messages are public on-chain forever. Never share secrets, and don&apos;t trust links from strangers.</div>
      <div className="chat-log" ref={logRef} aria-live="polite">
        {!owner && <p className="chat-note">Connect a wallet to see this conversation.</p>}
        {owner && thread.length === 0 && <p className="chat-note">No messages yet. Say hi!</p>}
        {thread.map((m) =>
          m.nudge ? (
            <p key={m.signature} className="chat-nudge">
              {m.from === owner ? 'You have just sent a nudge.' : `${name} has just sent you a nudge.`}
            </p>
          ) : (
            <div key={m.signature} className={`chat-msg${m.time == null ? ' pending' : ''}${m.from === owner ? ' mine' : ''}`}>
              <div className="chat-who">
                {m.from === owner ? 'You say' : `${name} says`}: <span className="chat-time">{when(m.time)}</span>
                {m.time != null && (
                  <button type="button" className="chat-tx" title="View transaction" onClick={() => openApp('solexplorer', { url: `sol://tx/${m.signature}` })}>
                    ↗
                  </button>
                )}
              </div>
              <div className="chat-text">{m.text}</div>
            </div>
          ),
        )}
      </div>
      <form
        className="chat-compose"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <div className="chat-tools">
          <button type="button" className="btn" disabled={!owner || sending} onClick={() => void send(NUDGE)} title="Shake your buddy's window">
            Nudge
          </button>
          <span className={`chat-count${tooLong ? ' over' : ''}`}>
            {bytes}/{MAX_MESSAGE_BYTES}
          </span>
        </div>
        <div className="chat-input">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
            disabled={!owner}
            placeholder={owner ? 'Type a message. Enter sends, Shift+Enter for a new line.' : ''}
            aria-label="Message"
          />
          <button type="submit" className="btn chat-send" disabled={!owner || sending || !draft.trim() || tooLong}>
            {sending ? 'Signing…' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}

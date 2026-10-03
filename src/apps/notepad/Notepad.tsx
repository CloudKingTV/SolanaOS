import { useCallback, useEffect, useRef, useState } from 'react';
import { readFile, writeFile, MY_DOCUMENTS, VfsError } from '../../os/vfs';
import { basename, dirname } from '../../os/path';
import { openApp, requestClose, setCloseGuard, setWindowTitle, type AppProps } from '../../os/windows';
import { fileDialog, messageBox } from '../../os/dialogs';
import { MenuBar, sep } from '../../shell/Menu';
import { useWallet } from '../../os/wallet/standard';
import { signMessage } from '../../os/wallet/tx';
import { formatSigned, parseSigned, verifySigned } from '../../os/wallet/signedMessage';

export function Notepad({ windowId, args }: AppProps) {
  const [path, setPath] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [saved, setSaved] = useState('');
  const [wrap, setWrap] = useState(true);
  const [statusBar, setStatusBar] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const ta = useRef<HTMLTextAreaElement>(null);
  const dirty = text !== saved;

  const load = useCallback(
    (p: string) => {
      try {
        const content = readFile(p);
        setPath(p);
        setText(content);
        setSaved(content);
      } catch (e) {
        void messageBox({ title: 'Notepad', icon: 'error', message: e instanceof Error ? e.message : String(e), owner: windowId });
      }
    },
    [windowId],
  );

  useEffect(() => {
    if (typeof args.path === 'string') load(args.path);
  }, [args.path, load]);

  useEffect(() => {
    setWindowTitle(windowId, `${path ? basename(path) : 'Untitled'} - Notepad`);
  }, [path, windowId]);

  const saveTo = (p: string): boolean => {
    try {
      writeFile(p, text);
      setPath(p);
      setSaved(text);
      return true;
    } catch (e) {
      void messageBox({ title: 'Notepad', icon: 'error', message: e instanceof VfsError ? e.message : String(e), owner: windowId });
      return false;
    }
  };

  const saveAs = async (): Promise<boolean> => {
    const p = await fileDialog({
      mode: 'save',
      owner: windowId,
      initialDir: path ? dirname(path) : MY_DOCUMENTS,
      initialName: path ? basename(path) : '*.txt',
      extension: 'txt',
    });
    return p ? saveTo(p) : false;
  };

  const save = async (): Promise<boolean> => (path ? saveTo(path) : saveAs());

  /** Returns true if it's OK to discard the current text. */
  const confirmDiscard = useCallback(async (): Promise<boolean> => {
    if (!dirty) return true;
    const a = await messageBox({
      title: 'Notepad',
      icon: 'warning',
      message: `The text in the ${path ? basename(path) : 'Untitled'} file has changed.\n\nDo you want to save the changes?`,
      buttons: ['Yes', 'No', 'Cancel'],
      owner: windowId,
    });
    if (a === 'Cancel') return false;
    if (a === 'Yes') return save();
    return true;
  }, [dirty, path, text, windowId]);

  useEffect(() => {
    setCloseGuard(windowId, confirmDiscard);
  }, [windowId, confirmDiscard]);

  const newDoc = async () => {
    if (!(await confirmDiscard())) return;
    setPath(null);
    setText('');
    setSaved('');
  };

  const open = async () => {
    if (!(await confirmDiscard())) return;
    const p = await fileDialog({ mode: 'open', owner: windowId, initialDir: path ? dirname(path) : MY_DOCUMENTS, extension: 'txt' });
    if (p) load(p);
  };

  const insert = (s: string) => {
    const el = ta.current;
    if (!el) return;
    el.focus();
    el.setRangeText(s, el.selectionStart, el.selectionEnd, 'end');
    setText(el.value);
  };

  const exec = (cmd: 'undo' | 'cut' | 'copy' | 'delete') => {
    ta.current?.focus();
    document.execCommand(cmd);
    if (ta.current) setText(ta.current.value);
  };

  const paste = async () => {
    try {
      insert(await navigator.clipboard.readText());
    } catch {
      void messageBox({ title: 'Notepad', icon: 'info', message: 'Use Ctrl+V to paste. Your browser blocked clipboard access from the menu.', owner: windowId });
    }
  };

  const updateCursor = () => {
    const el = ta.current;
    if (!el) return;
    const before = el.value.slice(0, el.selectionStart);
    const lines = before.split('\n');
    setCursor({ line: lines.length, col: lines[lines.length - 1].length + 1 });
  };

  const walletConnected = useWallet((s) => !!s.connection);

  const signText = async () => {
    const message = text.replace(/\r\n/g, '\n');
    if (!message.trim()) {
      void messageBox({ title: 'Sign Message', icon: 'info', message: 'Type the message you want to sign first.', owner: windowId });
      return;
    }
    try {
      const { address, signature } = await signMessage(message);
      setText(formatSigned(message, address, signature));
    } catch (e) {
      void messageBox({ title: 'Sign Message', icon: 'error', message: e instanceof Error ? e.message : String(e), owner: windowId });
    }
  };

  const verifyText = async () => {
    const block = parseSigned(text);
    if (!block) {
      void messageBox({
        title: 'Verify Signature',
        icon: 'info',
        message: 'No signed message found. Paste a block that starts with -----BEGIN SOLANA SIGNED MESSAGE-----.',
        owner: windowId,
      });
      return;
    }
    const ok = await verifySigned(block);
    void messageBox({
      title: 'Verify Signature',
      icon: ok ? 'info' : 'error',
      message: ok
        ? `Good signature.\n\nThis message was signed by:\n${block.address}`
        : `BAD signature.\n\nThis message was NOT signed by ${block.address}, or it was changed after signing.`,
      owner: windowId,
    });
  };

  const timeDate = () => {
    const d = new Date();
    insert(`${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} ${d.toLocaleDateString('en-US')}`);
  };

  return (
    <div className="notepad">
      <MenuBar
        menus={[
          {
            label: 'File',
            items: [
              { label: 'New', shortcut: 'Ctrl+N', onClick: () => void newDoc() },
              { label: 'Open...', shortcut: 'Ctrl+O', onClick: () => void open() },
              { label: 'Save', shortcut: 'Ctrl+S', onClick: () => void save() },
              { label: 'Save As...', onClick: () => void saveAs() },
              sep,
              { label: 'Sign Message with Wallet...', disabled: !walletConnected, onClick: () => void signText() },
              { label: 'Verify Signature', onClick: () => void verifyText() },
              sep,
              { label: 'Exit', onClick: () => void requestClose(windowId) },
            ],
          },
          {
            label: 'Edit',
            items: [
              { label: 'Undo', shortcut: 'Ctrl+Z', onClick: () => exec('undo') },
              sep,
              { label: 'Cut', shortcut: 'Ctrl+X', onClick: () => exec('cut') },
              { label: 'Copy', shortcut: 'Ctrl+C', onClick: () => exec('copy') },
              { label: 'Paste', shortcut: 'Ctrl+V', onClick: () => void paste() },
              { label: 'Delete', shortcut: 'Del', onClick: () => exec('delete') },
              sep,
              {
                label: 'Select All',
                shortcut: 'Ctrl+A',
                onClick: () => {
                  ta.current?.focus();
                  ta.current?.select();
                },
              },
              { label: 'Time/Date', shortcut: 'F5', onClick: timeDate },
            ],
          },
          {
            label: 'Format',
            items: [{ label: 'Word Wrap', checked: wrap, onClick: () => setWrap(!wrap) }],
          },
          {
            label: 'View',
            items: [{ label: 'Status Bar', checked: statusBar, onClick: () => setStatusBar(!statusBar) }],
          },
          {
            label: 'Help',
            items: [{ label: 'About SolanaOS', onClick: () => openApp('about') }],
          },
        ]}
      />
      <textarea
        ref={ta}
        className="notepad-text"
        value={text}
        spellCheck={false}
        wrap={wrap ? 'soft' : 'off'}
        style={{ whiteSpace: wrap ? 'pre-wrap' : 'pre' }}
        autoFocus
        onChange={(e) => {
          setText(e.target.value);
          updateCursor();
        }}
        onKeyUp={updateCursor}
        onClick={updateCursor}
        onKeyDown={(e) => {
          const k = e.key.toLowerCase();
          if (e.ctrlKey && k === 's') {
            e.preventDefault();
            void save();
          } else if (e.ctrlKey && k === 'o') {
            e.preventDefault();
            void open();
          } else if (e.ctrlKey && k === 'n') {
            e.preventDefault();
            void newDoc();
          } else if (e.key === 'F5') {
            e.preventDefault();
            timeDate();
          } else if (e.key === 'Tab') {
            e.preventDefault();
            insert('\t');
          }
        }}
      />
      {statusBar && (
        <div className="status-bar">
          <span />
          <span>
            Ln {cursor.line}, Col {cursor.col}
          </span>
        </div>
      )}
    </div>
  );
}

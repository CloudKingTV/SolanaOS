import { useEffect, useRef, useState } from 'react';
import { BANNER, execute, type Shell } from './interpreter';
import { MY_DOCUMENTS, list } from '../../os/vfs';
import { basename, dirname, resolve } from '../../os/path';
import { closeWindow, setWindowTitle, type AppProps } from '../../os/windows';

export function Cmd({ windowId }: AppProps) {
  const [lines, setLines] = useState<string[]>(() => BANNER.split('\n'));
  const [cwd, setCwd] = useState(MY_DOCUMENTS);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [colors, setColors] = useState({ fg: '#c0c0c0', bg: '#000000' });
  const history = useRef<string[]>([]);
  const hIndex = useRef(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Each command gets a token; Ctrl+C bumps it so a cancelled command's late output is dropped.
  const runToken = useRef(0);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [lines, busy]);

  const append = (text: string) => setLines((ls) => [...ls, ...text.split('\n')].slice(-2000));

  const run = async (line: string) => {
    const prompt = `${cwd}>`;
    setLines((ls) => [...ls, `${prompt}${line}`]);
    if (line.trim()) {
      history.current = [line, ...history.current.filter((h) => h !== line)].slice(0, 50);
    }
    hIndex.current = -1;
    const token = ++runToken.current;
    const live = () => token === runToken.current;
    setBusy(true);
    scrollRef.current?.focus();
    const sh: Shell = {
      cwd,
      print: (text) => live() && append(text),
      setCwd,
      clear: () => setLines([]),
      exit: () => closeWindow(windowId),
      setTitle: (t) => setWindowTitle(windowId, t),
      setColor: (fg, bg) => setColors({ fg, bg }),
    };
    await execute(line, sh);
    if (!live()) return;
    setBusy(false);
    setLines((ls) => [...ls, '']);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const complete = () => {
    // Tab completes the last word against files in the current folder.
    const m = input.match(/^(.*?)(\S*)$/);
    if (!m) return;
    const [, head, word] = m;
    const base = word.includes('\\') ? resolve(cwd, dirname(word)) : cwd;
    const prefix = word.includes('\\') ? basename(word) : word;
    const match = list(base).find((n) => basename(n.path).toLowerCase().startsWith(prefix.toLowerCase()));
    if (!match) return;
    const name = basename(match.path);
    const completed = word.includes('\\') ? `${word.slice(0, word.lastIndexOf('\\') + 1)}${name}` : name;
    setInput(head + (completed.includes(' ') ? `"${completed}"` : completed));
  };

  return (
    <div
      className="cmd"
      ref={scrollRef}
      style={{ color: colors.fg, background: colors.bg }}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (busy && e.ctrlKey && e.key.toLowerCase() === 'c') {
          runToken.current++;
          append('^C\n');
          setBusy(false);
          requestAnimationFrame(() => inputRef.current?.focus());
        }
      }}
      onClick={() => {
        if (!window.getSelection()?.toString()) inputRef.current?.focus();
      }}
    >
      {lines.map((l, i) => (
        <div key={i} className="cmd-line">
          {l || ' '}
        </div>
      ))}
      {busy ? (
        <div className="cmd-line">
          <span className="cmd-cursor">_</span>
        </div>
      ) : (
        <div className="cmd-input-line">
          <span>{cwd}&gt;</span>
          <input
            ref={inputRef}
            autoFocus
            spellCheck={false}
            autoComplete="off"
            value={input}
            style={{ color: colors.fg }}
            aria-label="Command input"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const line = input;
                setInput('');
                void run(line);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const i = Math.min(history.current.length - 1, hIndex.current + 1);
                if (i >= 0) {
                  hIndex.current = i;
                  setInput(history.current[i]);
                }
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                const i = hIndex.current - 1;
                hIndex.current = Math.max(-1, i);
                setInput(i >= 0 ? history.current[i] : '');
              } else if (e.key === 'Tab') {
                e.preventDefault();
                complete();
              } else if (e.key === 'Escape') {
                setInput('');
              }
            }}
          />
        </div>
      )}
    </div>
  );
}

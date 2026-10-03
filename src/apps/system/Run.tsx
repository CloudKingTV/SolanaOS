import { useState } from 'react';
import { closeWindow, type AppProps } from '../../os/windows';
import { runCommand } from '../../os/shellActions';
import { Icon } from '../../shell/icons';

const HISTORY_KEY = 'solanaos.run.history';

export function Run({ windowId }: AppProps) {
  const [value, setValue] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')[0] ?? '';
    } catch {
      return '';
    }
  });
  const submit = () => {
    if (!value.trim()) return;
    if (runCommand(value, windowId)) {
      try {
        const hist: string[] = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
        localStorage.setItem(HISTORY_KEY, JSON.stringify([value, ...hist.filter((h) => h !== value)].slice(0, 10)));
      } catch {
        // Non-critical.
      }
      closeWindow(windowId);
    }
  };
  return (
    <form
      className="run-dialog"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="run-top">
        <Icon name="run" size={32} />
        <p>Type the name of a program, folder or document, and SolanaOS will open it for you.</p>
      </div>
      <label className="run-field">
        <span>
          <u>O</u>pen:
        </span>
        <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} onFocus={(e) => e.currentTarget.select()} />
      </label>
      <p className="run-hint">Try: notepad, calc, cmd, taskmgr, rugsweeper, control, C:\My Documents</p>
      <div className="dialog-buttons">
        <button type="submit" className="btn">
          OK
        </button>
        <button type="button" className="btn" onClick={() => closeWindow(windowId)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

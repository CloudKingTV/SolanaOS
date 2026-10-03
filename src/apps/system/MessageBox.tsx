import { useEffect } from 'react';
import { closeWindow, setCloseGuard, type AppProps } from '../../os/windows';
import { Icon } from '../../shell/icons';
import type { MsgIcon } from '../../os/dialogs';

export function MessageBox({ windowId, args }: AppProps) {
  const message = String(args.message ?? '');
  const icon = args.icon as MsgIcon | undefined;
  const buttons = (args.buttons as string[]) ?? ['OK'];
  const resolve = args.resolve as ((v: string) => void) | undefined;

  const answer = (b: string) => {
    setCloseGuard(windowId, null);
    resolve?.(b);
    closeWindow(windowId);
  };

  useEffect(() => {
    // Closing via the title bar counts as the "cancel" answer.
    const cancel = buttons.includes('Cancel') ? 'Cancel' : buttons.includes('No') ? 'No' : buttons[buttons.length - 1];
    setCloseGuard(windowId, () => {
      resolve?.(cancel);
      return true;
    });
  }, [windowId, buttons, resolve]);

  return (
    <div className="msgbox">
      <div className="msgbox-body">
        {icon && <Icon name={icon} size={32} />}
        <div className="msgbox-text">{message}</div>
      </div>
      <div className="msgbox-buttons">
        {buttons.map((b, i) => (
          <button key={b} type="button" className="btn" autoFocus={i === 0} onClick={() => answer(b)}>
            {b}
          </button>
        ))}
      </div>
    </div>
  );
}

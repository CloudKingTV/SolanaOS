import { openApp } from './windows';
import { sounds } from './sound';

export type MsgIcon = 'info' | 'warning' | 'error' | 'question';

export interface MessageOptions {
  title: string;
  message: string;
  icon?: MsgIcon;
  buttons?: string[];
  owner?: string;
}

export function messageBox(opts: MessageOptions): Promise<string> {
  return new Promise((resolve) => {
    if (opts.icon === 'error') sounds.error();
    else sounds.ding();
    const buttons = opts.buttons ?? ['OK'];
    const id = openApp(
      'msgbox',
      { ...opts, buttons, resolve },
      { modalFor: opts.owner },
    );
    if (!id) resolve(buttons[buttons.length - 1]);
  });
}

export interface FileDialogOptions {
  mode: 'open' | 'save';
  owner?: string;
  title?: string;
  initialDir?: string;
  initialName?: string;
  /** Only show files with this extension (without dot). */
  extension?: string;
}

/** Resolves to the chosen path, or null if cancelled. */
export function fileDialog(opts: FileDialogOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const id = openApp('filedialog', { ...opts, resolve }, { modalFor: opts.owner });
    if (!id) resolve(null);
  });
}

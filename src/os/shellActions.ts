import { extname, keyOf, normalize, resolve } from './path';
import { stat, MY_DOCUMENTS, RECYCLER, DESKTOP_DIR } from './vfs';
import { findAppByAlias, openApp } from './windows';
import { messageBox } from './dialogs';

/** Open a file or folder with its default program. */
export function openPath(path: string, owner?: string): boolean {
  const n = stat(path);
  if (!n) {
    void messageBox({
      title: 'SolanaOS',
      icon: 'error',
      message: `SolanaOS cannot find '${normalize(path)}'. Make sure you typed the name correctly, and then try again.`,
      owner,
    });
    return false;
  }
  if (n.type === 'dir') {
    openFolder(n.path);
    return true;
  }
  // Pictures open in Picture Viewer; everything else is plain text.
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extname(n.path))) openApp('pictures', { path: n.path });
  else openApp('notepad', { path: n.path });
  return true;
}

export function openFolder(path: string) {
  if (keyOf(path) === keyOf(RECYCLER)) openApp('burnbin');
  else openApp('explorer', { path: normalize(path) });
}

export const openMyDocuments = () => openFolder(MY_DOCUMENTS);
export const openDesktopFolder = () => openFolder(DESKTOP_DIR);

/** Handle a Run-dialog / Start-search style command. Returns false if nothing matched. */
export function runCommand(input: string, owner?: string): boolean {
  const text = input.trim();
  if (!text) return false;
  const [head, ...rest] = text.split(/\s+/);
  const app = findAppByAlias(head);
  if (app) {
    const arg = rest.join(' ');
    const args: Record<string, unknown> = {};
    if (arg) args.path = resolve(MY_DOCUMENTS, arg);
    openApp(app.id, app.id === 'notepad' || app.id === 'explorer' ? args : {});
    return true;
  }
  if (/^[a-z]:/i.test(text) || text.startsWith('\\')) {
    return openPath(resolve('C:\\', text), owner);
  }
  if (stat(resolve(MY_DOCUMENTS, text))) return openPath(resolve(MY_DOCUMENTS, text), owner);
  void messageBox({
    title: text,
    icon: 'error',
    message: `SolanaOS cannot find '${text}'. Make sure you typed the name correctly, and then try again.`,
    owner,
  });
  return false;
}

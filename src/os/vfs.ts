import { create } from 'zustand';
import { ROOT, basename, dirname, isValidName, isWithin, join, keyOf, normalize } from './path';

export type NodeType = 'file' | 'dir';

export interface VNode {
  path: string;
  type: NodeType;
  content?: string;
  mtime: number;
  /** For items in the Burn Bin: where they were deleted from. */
  origPath?: string;
  deletedAt?: number;
}

export const RECYCLER = 'C:\\RECYCLER';
export const MY_DOCUMENTS = 'C:\\My Documents';
export const DESKTOP_DIR = 'C:\\Desktop';

export class VfsError extends Error {}

const WELCOME = `Welcome to SolanaOS!

This is your My Documents folder. Anything you save here stays in this
browser, even after you restart.

Things to try:
  * Press Ctrl+Shift+Esc (or right-click the taskbar) to open Network
    Monitor and watch the Solana cluster live.
  * Open Command Prompt and type "solana slot" or "help".
  * Play a round of Rugsweeper. Don't click the rugs.
  * Change the theme in Control Panel > Display.

SolanaOS starts on Devnet, Solana's test network. Wallet sign-in,
My Wallet and the Burn Bin's rent reclaim arrive in the next update.
`;

function seed(): VNode[] {
  const t = Date.now();
  const dir = (path: string): VNode => ({ path, type: 'dir', mtime: t });
  const file = (path: string, content: string): VNode => ({ path, type: 'file', content, mtime: t });
  return [
    dir(ROOT),
    dir(MY_DOCUMENTS),
    dir(`${MY_DOCUMENTS}\\My Pictures`),
    dir(DESKTOP_DIR),
    dir('C:\\Program Files'),
    dir('C:\\SolanaOS'),
    dir(RECYCLER),
    file(`${MY_DOCUMENTS}\\Welcome.txt`, WELCOME),
    file(
      'C:\\SolanaOS\\license.txt',
      'SolanaOS is an independent community project.\r\nNot affiliated with the Solana Foundation or Microsoft.\r\n',
    ),
  ];
}

// ---- IndexedDB persistence (write-through; failures are non-fatal) ----

const DB_NAME = 'solanaos-vfs';
const STORE = 'nodes';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
const db = () => (dbPromise ??= openDb());

async function persist(puts: VNode[], deletes: string[]): Promise<void> {
  const d = await db();
  if (!d) return;
  try {
    const tx = d.transaction(STORE, 'readwrite');
    const os = tx.objectStore(STORE);
    for (const k of deletes) os.delete(k);
    for (const n of puts) os.put(n, keyOf(n.path));
  } catch {
    // Ignore: in-memory state remains authoritative for this session.
  }
}

async function loadAll(): Promise<VNode[] | null> {
  const d = await db();
  if (!d) return null;
  return new Promise((resolve) => {
    try {
      const req = d.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as VNode[]);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

// ---- Store ----

interface VfsState {
  nodes: Record<string, VNode>;
  ready: boolean;
}

export const useVfs = create<VfsState>(() => ({ nodes: {}, ready: false }));

const get = () => useVfs.getState().nodes;

function commit(puts: VNode[], deletes: string[]) {
  const next = { ...get() };
  for (const k of deletes) delete next[k];
  for (const n of puts) next[keyOf(n.path)] = n;
  useVfs.setState({ nodes: next });
  void persist(puts, deletes);
}

export async function initVfs(): Promise<void> {
  const stored = await loadAll();
  const list = stored && stored.length ? stored : seed();
  const nodes: Record<string, VNode> = {};
  for (const n of list) nodes[keyOf(n.path)] = n;
  // Make sure system folders exist even for older saved file systems.
  for (const n of seed()) if (n.type === 'dir' && !nodes[keyOf(n.path)]) nodes[keyOf(n.path)] = n;
  useVfs.setState({ nodes, ready: true });
  if (!stored || !stored.length) void persist(Object.values(nodes), []);
}

/** Reset to factory contents (used by tests and the "format" easter egg). */
export function resetVfs(): void {
  const nodes: Record<string, VNode> = {};
  for (const n of seed()) nodes[keyOf(n.path)] = n;
  const old = Object.keys(get());
  useVfs.setState({ nodes, ready: true });
  void persist(Object.values(nodes), old);
}

export function stat(path: string): VNode | undefined {
  return get()[keyOf(path)];
}

export function exists(path: string): boolean {
  return !!stat(path);
}

export function list(dir: string, nodes = get()): VNode[] {
  const parent = keyOf(dir);
  return Object.values(nodes)
    .filter((n) => keyOf(n.path) !== parent && keyOf(dirname(n.path)) === parent)
    .sort((a, b) => (a.type === b.type ? basename(a.path).localeCompare(basename(b.path)) : a.type === 'dir' ? -1 : 1));
}

export function readFile(path: string): string {
  const n = stat(path);
  if (!n) throw new VfsError(`Cannot find '${normalize(path)}'.`);
  if (n.type !== 'file') throw new VfsError(`'${normalize(path)}' is a folder.`);
  return n.content ?? '';
}

function requireParent(path: string) {
  const parent = stat(dirname(path));
  if (!parent || parent.type !== 'dir') throw new VfsError(`The folder '${dirname(path)}' does not exist.`);
}

export function writeFile(path: string, content: string): VNode {
  const p = normalize(path);
  if (!isValidName(basename(p))) throw new VfsError('A file name cannot contain any of the following characters: \\ / : * ? " < > |');
  const existing = stat(p);
  if (existing?.type === 'dir') throw new VfsError(`'${p}' is a folder.`);
  requireParent(p);
  const node: VNode = { path: existing?.path ?? p, type: 'file', content, mtime: Date.now() };
  commit([node], []);
  return node;
}

export function mkdir(path: string): VNode {
  const p = normalize(path);
  if (!isValidName(basename(p))) throw new VfsError('A folder name cannot contain any of the following characters: \\ / : * ? " < > |');
  if (exists(p)) throw new VfsError(`'${basename(p)}' already exists.`);
  requireParent(p);
  const node: VNode = { path: p, type: 'dir', mtime: Date.now() };
  commit([node], []);
  return node;
}

/** Returns a name like "New Folder (2)" that doesn't exist in dir yet. */
export function uniqueName(dir: string, base: string, ext = ''): string {
  const suffix = ext ? `.${ext}` : '';
  let name = `${base}${suffix}`;
  for (let i = 2; exists(join(dir, name)); i++) name = `${base} (${i})${suffix}`;
  return name;
}

function subtree(path: string): VNode[] {
  return Object.values(get()).filter((n) => isWithin(n.path, path));
}

/** Move (or rename) a file or folder, including everything inside it. */
export function move(src: string, dest: string, extra: Partial<VNode> = {}): VNode {
  const from = stat(src);
  if (!from) throw new VfsError(`Cannot find '${normalize(src)}'.`);
  const to = normalize(dest);
  if (from.path.length <= 3) throw new VfsError('You cannot move the root folder.');
  if (keyOf(to) !== keyOf(from.path) && exists(to)) throw new VfsError(`'${basename(to)}' already exists.`);
  if (from.type === 'dir' && isWithin(to, from.path) && keyOf(to) !== keyOf(from.path))
    throw new VfsError('The destination folder is inside the source folder.');
  requireParent(to);
  const items = subtree(from.path);
  const puts = items.map((n) => {
    const moved = { ...n, path: to + n.path.slice(from.path.length) };
    return keyOf(n.path) === keyOf(from.path) ? { ...moved, ...extra } : moved;
  });
  const deletes = items.map((n) => keyOf(n.path));
  commit(puts, deletes);
  return puts.find((n) => keyOf(n.path) === keyOf(to))!;
}

export function rename(path: string, newName: string): VNode {
  if (!isValidName(newName)) throw new VfsError('A file name cannot contain any of the following characters: \\ / : * ? " < > |');
  return move(path, join(dirname(path), newName.trim()));
}

/** Send an item to the Burn Bin. */
export function recycle(path: string): VNode {
  const n = stat(path);
  if (!n) throw new VfsError(`Cannot find '${normalize(path)}'.`);
  if (isWithin(n.path, RECYCLER)) throw new VfsError('This item is already in the Burn Bin.');
  if (isProtected(n.path)) throw new VfsError(`'${basename(n.path)}' is a system folder and cannot be deleted.`);
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return move(n.path, join(RECYCLER, `${id}_${basename(n.path)}`), { origPath: n.path, deletedAt: Date.now() });
}

export function recycled(nodes = get()): VNode[] {
  return list(RECYCLER, nodes);
}

export function displayName(n: VNode): string {
  if (n.origPath) return basename(n.origPath);
  return basename(n.path);
}

export function restore(path: string): VNode {
  const n = stat(path);
  if (!n?.origPath) throw new VfsError('This item cannot be restored.');
  const parent = dirname(n.origPath);
  if (!exists(parent)) mkdirp(parent);
  let target = n.origPath;
  if (exists(target)) {
    const name = basename(n.origPath);
    const dot = n.type === 'file' ? name.lastIndexOf('.') : -1;
    target = join(parent, dot > 0 ? uniqueName(parent, name.slice(0, dot), name.slice(dot + 1)) : uniqueName(parent, name));
  }
  return move(n.path, target, { origPath: undefined, deletedAt: undefined });
}

/** Permanently delete. */
export function removeForever(path: string): void {
  const n = stat(path);
  if (!n) return;
  if (isProtected(n.path)) throw new VfsError(`'${basename(n.path)}' is a system folder and cannot be deleted.`);
  commit([], subtree(n.path).map((x) => keyOf(x.path)));
}

export function emptyRecycler(): number {
  const items = recycled();
  for (const n of items) removeForever(n.path);
  return items.length;
}

export function mkdirp(path: string): void {
  const p = normalize(path);
  if (exists(p)) return;
  mkdirp(dirname(p));
  mkdir(p);
}

const PROTECTED = [ROOT, MY_DOCUMENTS, DESKTOP_DIR, RECYCLER, 'C:\\SolanaOS', 'C:\\Program Files'].map(keyOf);
export function isProtected(path: string): boolean {
  return PROTECTED.includes(keyOf(path));
}

export function sizeOf(n: VNode): number {
  if (n.type === 'file') return new Blob([n.content ?? '']).size;
  return subtree(n.path)
    .filter((x) => x.type === 'file')
    .reduce((s, x) => s + new Blob([x.content ?? '']).size, 0);
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  return `${Math.ceil(bytes / 1024).toLocaleString()} KB`;
}

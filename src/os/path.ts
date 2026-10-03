// Windows-style paths: "C:\My Documents\notes.txt". Lookups are case-insensitive.
export const ROOT = 'C:\\';

export function normalize(p: string): string {
  let s = p.trim().replace(/\//g, '\\');
  if (/^[a-z]:$/i.test(s)) s += '\\';
  s = s.replace(/\\+/g, '\\');
  if (s.length > 3 && s.endsWith('\\')) s = s.slice(0, -1);
  if (/^[a-z]:\\/i.test(s)) s = s[0].toUpperCase() + s.slice(1);
  return s;
}

export function keyOf(p: string): string {
  return normalize(p).toLowerCase();
}

export function join(dir: string, name: string): string {
  const d = normalize(dir);
  return normalize(d.endsWith('\\') ? d + name : `${d}\\${name}`);
}

export function dirname(p: string): string {
  const n = normalize(p);
  if (n.length <= 3) return n;
  const i = n.lastIndexOf('\\');
  return i <= 2 ? n.slice(0, 3) : n.slice(0, i);
}

export function basename(p: string): string {
  const n = normalize(p);
  if (n.length <= 3) return n;
  return n.slice(n.lastIndexOf('\\') + 1);
}

export function extname(p: string): string {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i + 1).toLowerCase() : '';
}

export function isWithin(child: string, parent: string): boolean {
  const c = keyOf(child);
  const p = keyOf(parent);
  if (c === p) return true;
  return c.startsWith(p.endsWith('\\') ? p : `${p}\\`);
}

/** Resolve a cmd-style path ("..", ".", relative names) against a working directory. */
export function resolve(cwd: string, input: string): string {
  const raw = input.trim().replace(/\//g, '\\');
  const start = /^[a-z]:/i.test(raw) ? raw.slice(0, 2) + '\\' : raw.startsWith('\\') ? ROOT : normalize(cwd);
  const rest = /^[a-z]:/i.test(raw) ? raw.slice(2) : raw;
  const parts = normalize(start).slice(3).split('\\').filter(Boolean);
  for (const seg of rest.split('\\')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return normalize(ROOT + parts.join('\\'));
}

const INVALID = /[\\/:*?"<>|]/;
export function isValidName(name: string): boolean {
  const n = name.trim();
  return n.length > 0 && n.length <= 255 && !INVALID.test(n) && n !== '.' && n !== '..';
}

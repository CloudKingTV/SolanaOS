import { describe, expect, it } from 'vitest';
import { basename, dirname, isValidName, isWithin, join, normalize, resolve } from './path';

describe('path', () => {
  it('normalizes separators, drive case and trailing slashes', () => {
    expect(normalize('c:/My Documents/')).toBe('C:\\My Documents');
    expect(normalize('C:')).toBe('C:\\');
    expect(normalize('C:\\\\a\\\\b')).toBe('C:\\a\\b');
  });

  it('splits paths', () => {
    expect(dirname('C:\\a\\b.txt')).toBe('C:\\a');
    expect(dirname('C:\\a')).toBe('C:\\');
    expect(basename('C:\\a\\b.txt')).toBe('b.txt');
    expect(join('C:\\', 'x')).toBe('C:\\x');
  });

  it('resolves cmd-style relative paths', () => {
    expect(resolve('C:\\My Documents', '..')).toBe('C:\\');
    expect(resolve('C:\\My Documents', '.\\notes.txt')).toBe('C:\\My Documents\\notes.txt');
    expect(resolve('C:\\My Documents', '\\SolanaOS')).toBe('C:\\SolanaOS');
    expect(resolve('C:\\a\\b', '..\\..\\..')).toBe('C:\\');
  });

  it('checks containment case-insensitively', () => {
    expect(isWithin('c:\\my documents\\x', 'C:\\My Documents')).toBe(true);
    expect(isWithin('C:\\My Documents2', 'C:\\My Documents')).toBe(false);
  });

  it('rejects reserved characters in names', () => {
    expect(isValidName('ok.txt')).toBe(true);
    expect(isValidName('bad:name')).toBe(false);
    expect(isValidName('  ')).toBe(false);
  });
});

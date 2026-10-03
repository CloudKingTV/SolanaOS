import { beforeEach, describe, expect, it } from 'vitest';
import {
  MY_DOCUMENTS,
  emptyRecycler,
  exists,
  list,
  mkdir,
  move,
  readFile,
  recycle,
  recycled,
  rename,
  resetVfs,
  restore,
  uniqueName,
  writeFile,
  VfsError,
} from './vfs';

beforeEach(() => resetVfs());

describe('vfs', () => {
  it('seeds a welcome document', () => {
    expect(readFile(`${MY_DOCUMENTS}\\Welcome.txt`)).toContain('Welcome to SolanaOS');
  });

  it('writes, reads and lists files case-insensitively', () => {
    writeFile(`${MY_DOCUMENTS}\\gm.txt`, 'gm');
    expect(readFile('c:\\my documents\\GM.TXT')).toBe('gm');
    expect(list(MY_DOCUMENTS).map((n) => n.path)).toContain(`${MY_DOCUMENTS}\\gm.txt`);
  });

  it('refuses to write into a missing folder', () => {
    expect(() => writeFile('C:\\Nope\\a.txt', 'x')).toThrow(VfsError);
  });

  it('moves folders with their contents', () => {
    mkdir(`${MY_DOCUMENTS}\\A`);
    writeFile(`${MY_DOCUMENTS}\\A\\x.txt`, '1');
    rename(`${MY_DOCUMENTS}\\A`, 'B');
    expect(exists(`${MY_DOCUMENTS}\\A\\x.txt`)).toBe(false);
    expect(readFile(`${MY_DOCUMENTS}\\B\\x.txt`)).toBe('1');
  });

  it('will not move a folder into itself', () => {
    mkdir(`${MY_DOCUMENTS}\\A`);
    expect(() => move(`${MY_DOCUMENTS}\\A`, `${MY_DOCUMENTS}\\A\\inner`)).toThrow(VfsError);
  });

  it('sends items to the Burn Bin and restores them', () => {
    writeFile(`${MY_DOCUMENTS}\\gm.txt`, 'gm');
    recycle(`${MY_DOCUMENTS}\\gm.txt`);
    expect(exists(`${MY_DOCUMENTS}\\gm.txt`)).toBe(false);
    const [item] = recycled();
    expect(item.origPath).toBe(`${MY_DOCUMENTS}\\gm.txt`);
    restore(item.path);
    expect(readFile(`${MY_DOCUMENTS}\\gm.txt`)).toBe('gm');
    expect(recycled()).toHaveLength(0);
  });

  it('restores next to a same-named file instead of overwriting it', () => {
    writeFile(`${MY_DOCUMENTS}\\a.txt`, 'old');
    recycle(`${MY_DOCUMENTS}\\a.txt`);
    writeFile(`${MY_DOCUMENTS}\\a.txt`, 'new');
    restore(recycled()[0].path);
    expect(readFile(`${MY_DOCUMENTS}\\a.txt`)).toBe('new');
    expect(readFile(`${MY_DOCUMENTS}\\a (2).txt`)).toBe('old');
  });

  it('empties the Burn Bin permanently', () => {
    writeFile(`${MY_DOCUMENTS}\\a.txt`, '1');
    recycle(`${MY_DOCUMENTS}\\a.txt`);
    expect(emptyRecycler()).toBe(1);
    expect(recycled()).toHaveLength(0);
  });

  it('protects system folders', () => {
    expect(() => recycle(MY_DOCUMENTS)).toThrow(VfsError);
  });

  it('generates unique names', () => {
    expect(uniqueName(MY_DOCUMENTS, 'Welcome', 'txt')).toBe('Welcome (2).txt');
    expect(uniqueName(MY_DOCUMENTS, 'New Folder')).toBe('New Folder');
  });
});

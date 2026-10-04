import { beforeEach, describe, expect, it, vi } from 'vitest';
import { execute, tokenize, type Shell } from './interpreter';
import { MY_DOCUMENTS, exists, readFile, resetVfs, writeFile } from '../../os/vfs';
import { useSettings } from '../../os/settings';

function shell(cwd = MY_DOCUMENTS) {
  const out: string[] = [];
  const sh: Shell & { out: string[] } = {
    cwd,
    out,
    print: (t) => out.push(t),
    setCwd: (c) => (sh.cwd = c),
    clear: () => out.splice(0),
    exit: () => {},
    setTitle: () => {},
    setColor: () => {},
  };
  return sh;
}

function mockRpc(results: Record<string, unknown>) {
  const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
    const { method, id } = JSON.parse(init.body);
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: results[method] }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  resetVfs();
  vi.unstubAllGlobals();
  useSettings.getState().update({ cluster: 'devnet', customRpcUrl: '' });
});

describe('command prompt', () => {
  it('tokenizes quoted arguments', () => {
    expect(tokenize('ren "my file.txt" b.txt')).toEqual(['ren', 'my file.txt', 'b.txt']);
  });

  it('navigates and lists folders', async () => {
    const sh = shell();
    await execute('cd..', sh);
    expect(sh.cwd).toBe('C:\\');
    await execute('dir', sh);
    expect(sh.out.join('\n')).toContain('<DIR>          My Documents');
    expect(sh.out.join('\n')).not.toContain('RECYCLER');
  });

  it('makes, types and deletes files', async () => {
    const sh = shell();
    writeFile(`${MY_DOCUMENTS}\\a.txt`, 'hello');
    await execute('type a.txt', sh);
    expect(sh.out.at(-1)).toBe('hello');
    await execute('md Stuff', sh);
    expect(exists(`${MY_DOCUMENTS}\\Stuff`)).toBe(true);
    await execute('del a.txt', sh);
    expect(exists(`${MY_DOCUMENTS}\\a.txt`)).toBe(false);
  });

  it('reports unknown commands', async () => {
    const sh = shell();
    await execute('frobnicate', sh);
    expect(sh.out[0]).toContain("'frobnicate' is not recognized");
  });

  it('queries the cluster for solana slot and epoch-info', async () => {
    const fetchMock = mockRpc({
      getSlot: 1234,
      getEpochInfo: { absoluteSlot: 1000, blockHeight: 900, epoch: 5, slotIndex: 100, slotsInEpoch: 400 },
    });
    const sh = shell();
    await execute('solana slot', sh);
    expect(sh.out.at(-1)).toBe('1234');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.devnet.solana.com');
    await execute('solana epoch-info', sh);
    expect(sh.out.at(-1)).toContain('Epoch Completed Percent: 25.000%');
  });

  it('formats balances and validates addresses', async () => {
    mockRpc({ getBalance: { value: 1_500_000_000 } });
    const sh = shell();
    await execute('solana balance 9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin', sh);
    expect(sh.out.at(-1)).toBe('1.5 SOL');
    await execute('solana balance not-an-address', sh);
    expect(sh.out.at(-1)).toContain('Invalid address');
  });

  it('switches clusters with config set', async () => {
    const sh = shell();
    await execute('solana config set --url mainnet-beta', sh);
    expect(useSettings.getState().cluster).toBe('mainnet-beta');
    await execute('solana config set --url https://rpc.example.com/?key=1', sh);
    expect(useSettings.getState().cluster).toBe('custom');
    expect(useSettings.getState().customRpcUrl).toBe('https://rpc.example.com/?key=1');
  });

  it('surfaces RPC errors instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 429 })));
    const sh = shell();
    await execute('solana slot', sh);
    expect(sh.out.at(-1)).toBe('Error: HTTP 429: api.devnet.solana.com is rate-limiting requests');
  });

  it('keeps file contents intact when typing them', async () => {
    const sh = shell();
    await execute('type Welcome.txt', sh);
    expect(sh.out.at(-1)).toBe(readFile(`${MY_DOCUMENTS}\\Welcome.txt`));
  });
});

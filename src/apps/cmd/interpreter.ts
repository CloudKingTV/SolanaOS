import { basename, keyOf, resolve } from '../../os/path';
import { list, mkdir, readFile, recycle, rename, stat, displayName, sizeOf, VfsError, RECYCLER } from '../../os/vfs';
import { findAppByAlias, openApp } from '../../os/windows';
import { clusterLabel, rpcUrlFor, useSettings, endpointHost, type Cluster } from '../../os/settings';
import {
  formatSol,
  getBalance,
  getBlockHeight,
  getEpochInfo,
  getSlot,
  getVersion,
  getVoteAccounts,
  isLikelyAddress,
  rpc,
  shortAddress,
} from '../../os/solana/rpc';
import { OS_VERSION } from '../system/version';
import { useWallet } from '../../os/wallet/standard';
import { airdrop } from '../../os/wallet/airdrop';
import { getTokenAccounts, formatAmount } from '../../os/solana/rpc';
import { getTokenMetadata } from '../../os/solana/metadata';

export interface Shell {
  cwd: string;
  print: (text: string) => void;
  setCwd: (cwd: string) => void;
  clear: () => void;
  exit: () => void;
  setTitle: (t: string) => void;
  setColor: (fg: string, bg: string) => void;
}

const COLORS = ['#000000', '#000080', '#008000', '#008080', '#800000', '#800080', '#808000', '#c0c0c0', '#808080', '#0000ff', '#00ff00', '#00ffff', '#ff0000', '#ff00ff', '#ffff00', '#ffffff'];

export const BANNER = `SolanaOS [Version ${OS_VERSION}]\n(C) Copyright 2026 SolanaOS contributors.\n`;

const HELP = `For more information on a specific command, type HELP command-name
CD       Displays the name of or changes the current directory.
CLS      Clears the screen.
COLOR    Sets the default console foreground and background colors.
DATE     Displays the date.
DEL      Burns one or more files (sends them to the Burn Bin).
DIR      Displays a list of files and subdirectories in a directory.
ECHO     Displays messages.
EXIT     Quits the Command Prompt.
MD       Creates a directory.
PING     Measures round-trip time to the Solana RPC endpoint.
REN      Renames a file or files.
SOLANA   Solana CLI. Type "solana help" for commands.
SPL-TOKEN  Token commands: "spl-token accounts".
START    Starts a program, e.g. START notepad.
TIME     Displays the time.
TITLE    Sets the window title.
TYPE     Displays the contents of a text file.
VER      Displays the SolanaOS version.
WHOAMI   Displays the current user.`;

const SOLANA_HELP = `solana-cli (SolanaOS emulated, read-only)

USAGE:
    solana <SUBCOMMAND>

SUBCOMMANDS:
    address                 Show your connected wallet's address
    airdrop <SOL> [ADDRESS] Request Devnet SOL (rate-limited faucet)
    balance [ADDRESS]       Get the balance of an account (default: your wallet)
    block-height            Get the current block height
    cluster-version         Get the version of the cluster entrypoint
    config get              Show the current RPC configuration
    config set --url <URL>  Set the cluster: devnet, mainnet-beta, or an RPC URL
    epoch                   Get the current epoch
    epoch-info              Get information about the current epoch
    slot                    Get the current slot
    transaction-count       Get the current transaction count
    transfer <TO> <SOL>     Open the Send Wizard to send SOL
    validators              Show summary information about the current validators

Also: spl-token accounts [ADDRESS]   List token balances`;

/** Split a command line into words, honoring double quotes. */
export function tokenize(line: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2]);
  return out;
}

const pad = (s: string, n: number) => s.padEnd(n);
const fmtDate = (t: number) => {
  const d = new Date(t);
  const date = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return `${date}  ${time}`;
};

function urlForMoniker(arg: string): { cluster: Cluster; custom: string } | null {
  const a = arg.toLowerCase();
  if (['d', 'devnet', 'https://api.devnet.solana.com'].includes(a)) return { cluster: 'devnet', custom: '' };
  if (['m', 'mainnet', 'mainnet-beta', 'https://api.mainnet-beta.solana.com'].includes(a)) return { cluster: 'mainnet-beta', custom: '' };
  if (/^https?:\/\//i.test(arg)) return { cluster: 'custom', custom: arg };
  return null;
}

async function solana(args: string[], sh: Shell) {
  const [sub, ...rest] = args;
  const s = useSettings.getState();
  switch ((sub ?? '').toLowerCase()) {
    case '':
    case 'help':
    case '--help':
    case '-h':
      sh.print(SOLANA_HELP);
      return;
    case '--version':
    case '-v':
      sh.print(`solana-cli ${OS_VERSION} (SolanaOS emulated)`);
      return;
    case 'config': {
      const action = (rest[0] ?? '').toLowerCase();
      if (action === 'get') {
        sh.print(`Config File: C:\\SolanaOS\\config.yml\nRPC URL: ${rpcUrlFor(s)}\nCluster: ${clusterLabel(s.cluster)}\nWallet: ${useWallet.getState().connection ? `${useWallet.getState().connection!.wallet.name} (${useWallet.getState().connection!.address})` : '(none connected)'}\nCommitment: confirmed`);
        return;
      }
      if (action === 'set') {
        const i = rest.findIndex((r) => r === '--url' || r === '-u');
        const target = i >= 0 ? rest[i + 1] : undefined;
        const parsed = target ? urlForMoniker(target) : null;
        if (!parsed) {
          sh.print('error: expected --url <devnet|mainnet-beta|URL>');
          return;
        }
        s.update({ cluster: parsed.cluster, customRpcUrl: parsed.custom || s.customRpcUrl });
        sh.print(`Config File: C:\\SolanaOS\\config.yml\nRPC URL: ${rpcUrlFor(useSettings.getState())}\nCluster: ${clusterLabel(parsed.cluster)}`);
        return;
      }
      sh.print('error: expected "config get" or "config set --url <URL>"');
      return;
    }
    case 'slot':
      sh.print(String(await getSlot()));
      return;
    case 'block-height':
      sh.print(String(await getBlockHeight()));
      return;
    case 'epoch':
      sh.print(String((await getEpochInfo()).epoch));
      return;
    case 'epoch-info': {
      const e = await getEpochInfo();
      const pct = ((e.slotIndex / e.slotsInEpoch) * 100).toFixed(3);
      sh.print(
        [
          `Block height: ${e.blockHeight}`,
          `Slot: ${e.absoluteSlot}`,
          `Epoch: ${e.epoch}`,
          e.transactionCount !== undefined ? `Transaction Count: ${e.transactionCount}` : null,
          `Epoch Slot Range: [${e.absoluteSlot - e.slotIndex}..${e.absoluteSlot - e.slotIndex + e.slotsInEpoch})`,
          `Epoch Completed Percent: ${pct}%`,
          `Epoch Completed Slots: ${e.slotIndex}/${e.slotsInEpoch} (${e.slotsInEpoch - e.slotIndex} remaining)`,
        ]
          .filter(Boolean)
          .join('\n'),
      );
      return;
    }
    case 'cluster-version':
      sh.print((await getVersion())['solana-core']);
      return;
    case 'transaction-count':
      sh.print(String(await rpc<number>('getTransactionCount')));
      return;
    case 'balance': {
      const addr = rest[0] ?? myAddress();
      if (!addr) {
        sh.print('error: no wallet connected. Pass an address: solana balance <ADDRESS>');
        return;
      }
      if (!isLikelyAddress(addr)) {
        sh.print(`error: Invalid address: ${addr}`);
        return;
      }
      sh.print(`${formatSol(await getBalance(addr), 9)} SOL`);
      return;
    }
    case 'address': {
      const addr = myAddress();
      sh.print(addr ?? 'error: no wallet connected. Log on with a wallet, or click the wallet icon in the tray.');
      return;
    }
    case 'airdrop': {
      const sol = Number(rest[0]);
      const addr = rest[1] ?? myAddress();
      if (!Number.isFinite(sol) || sol <= 0 || sol > 5) {
        sh.print('error: usage: solana airdrop <SOL (max 5)> [ADDRESS]');
        return;
      }
      if (!addr || !isLikelyAddress(addr)) {
        sh.print('error: no wallet connected. Pass an address: solana airdrop 1 <ADDRESS>');
        return;
      }
      sh.print(`Requesting airdrop of ${sol} SOL`);
      const sig = await airdrop(addr, sol);
      sh.print(`\nSignature: ${sig}\n\n${formatSol(await getBalance(addr), 9)} SOL`);
      return;
    }
    case 'transfer': {
      const [to, amount] = rest;
      if (!to || !amount) {
        sh.print('error: usage: solana transfer <RECIPIENT> <SOL>');
        return;
      }
      if (!myAddress()) {
        sh.print('error: no wallet connected.');
        return;
      }
      openApp('send', { to, amount });
      sh.print('Opened the Send Wizard. Review the transfer there and approve it in your wallet.');
      return;
    }
    case 'validators': {
      sh.print('Fetching validators...');
      const { current, delinquent } = await getVoteAccounts();
      const all = [...current, ...delinquent];
      const total = all.reduce((t, v) => t + v.activatedStake, 0);
      const top = current.slice().sort((a, b) => b.activatedStake - a.activatedStake).slice(0, 10);
      const lines = top.map(
        (v) =>
          `  ${pad(shortAddress(v.nodePubkey), 12)} ${pad(shortAddress(v.votePubkey), 12)} ${String(v.commission).padStart(3)}%  ${String(v.lastVote).padStart(11)}  ${formatSol(v.activatedStake, 0).padStart(14)} SOL (${((v.activatedStake / total) * 100).toFixed(2)}%)`,
      );
      sh.print(
        [
          `  Identity     Vote Account Comm.    Last Vote          Active Stake`,
          ...lines,
          '',
          `Active Stake: ${formatSol(total, 2)} SOL`,
          `Validators: ${current.length} current, ${delinquent.length} delinquent`,
        ].join('\n'),
      );
      return;
    }
    default:
      sh.print(`error: Found argument '${sub}' which wasn't expected. Type "solana help".`);
  }
}

const myAddress = () => useWallet.getState().connection?.address ?? null;

async function splToken(args: string[], sh: Shell) {
  const [sub, addrArg] = args;
  if ((sub ?? '').toLowerCase() !== 'accounts') {
    sh.print('usage: spl-token accounts [ADDRESS]');
    return;
  }
  const addr = addrArg ?? myAddress();
  if (!addr || !isLikelyAddress(addr)) {
    sh.print('error: no wallet connected. Pass an address: spl-token accounts <ADDRESS>');
    return;
  }
  const accounts = await getTokenAccounts(addr);
  if (!accounts.length) {
    sh.print('None');
    return;
  }
  const meta = await getTokenMetadata(accounts.map((a) => ({ mint: a.mint, programId: a.programId })));
  sh.print(['Token                                         Balance', '-'.repeat(62)].join('\n'));
  for (const a of accounts) {
    const m = meta.get(a.mint);
    const name = m?.symbol ? `${m.symbol} (${shortAddress(a.mint)})` : a.mint;
    sh.print(`${pad(name, 45)} ${formatAmount(a.amount, a.decimals)}`);
  }
}

async function ping(args: string[], sh: Shell) {
  const url = rpcUrlFor(useSettings.getState());
  const host = endpointHost(url);
  const count = Math.min(10, Math.max(1, Number(args[args.indexOf('-n') + 1]) || 4));
  sh.print(`\nPinging ${host} with getHealth:\n`);
  const times: number[] = [];
  for (let i = 0; i < count; i++) {
    const t0 = performance.now();
    try {
      await rpc<string>('getHealth', [], url);
      const ms = Math.round(performance.now() - t0);
      times.push(ms);
      sh.print(`Reply from ${host}: time=${ms}ms`);
    } catch (e) {
      sh.print(`Request failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (i < count - 1) await new Promise((r) => setTimeout(r, 500));
  }
  const lost = count - times.length;
  sh.print(`\nPing statistics for ${host}:\n    Requests: Sent = ${count}, Received = ${times.length}, Lost = ${lost} (${Math.round((lost / count) * 100)}% loss)`);
  if (times.length)
    sh.print(
      `Approximate round trip times in milli-seconds:\n    Minimum = ${Math.min(...times)}ms, Maximum = ${Math.max(...times)}ms, Average = ${Math.round(times.reduce((a, b) => a + b, 0) / times.length)}ms`,
    );
}

function dir(args: string[], sh: Shell) {
  const target = resolve(sh.cwd, args.find((a) => !a.startsWith('/')) ?? '.');
  const n = stat(target);
  if (!n) {
    sh.print('File Not Found');
    return;
  }
  if (n.type === 'file') {
    sh.print(` Directory of ${target}\n\n${fmtDate(n.mtime)}    ${String(sizeOf(n)).padStart(14)} ${basename(n.path)}`);
    return;
  }
  const items = list(target).filter((x) => keyOf(x.path) !== keyOf(RECYCLER));
  const files = items.filter((x) => x.type === 'file');
  const dirs = items.filter((x) => x.type === 'dir');
  const bytes = files.reduce((t, f) => t + sizeOf(f), 0);
  const rows = items.map((x) =>
    x.type === 'dir'
      ? `${fmtDate(x.mtime)}    <DIR>          ${displayName(x)}`
      : `${fmtDate(x.mtime)}    ${String(sizeOf(x)).padStart(14)} ${displayName(x)}`,
  );
  sh.print(
    [
      ' Volume in drive C is SOLANAOS',
      ' Volume Serial Number is 50L4-0005',
      '',
      ` Directory of ${target}`,
      '',
      ...rows,
      `${String(files.length).padStart(16)} File(s) ${bytes.toLocaleString('en-US').padStart(14)} bytes`,
      `${String(dirs.length).padStart(16)} Dir(s)`,
    ].join('\n'),
  );
}

export async function execute(line: string, sh: Shell): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) return;
  // "cd.." and "cd\" work without a space, as on the original.
  const normalized = trimmed.replace(/^(cd|chdir)(?=[.\\])/i, '$1 ');
  const [cmdRaw, ...args] = tokenize(normalized);
  const cmd = cmdRaw.toLowerCase();
  const rest = normalized.slice(cmdRaw.length).trim();

  try {
    switch (cmd) {
      case 'help':
        sh.print(args[0]?.toLowerCase() === 'solana' ? SOLANA_HELP : HELP);
        return;
      case 'cls':
        sh.clear();
        return;
      case 'ver':
        sh.print(`\nSolanaOS [Version ${OS_VERSION}]`);
        return;
      case 'echo':
        sh.print(rest || 'ECHO is on.');
        return;
      case 'whoami':
        sh.print('solanaos\\guest');
        return;
      case 'date':
        sh.print(`The current date is: ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: '2-digit', day: '2-digit', year: 'numeric' })}`);
        return;
      case 'time':
        sh.print(`The current time is: ${new Date().toLocaleTimeString('en-US')}`);
        return;
      case 'title':
        sh.setTitle(rest || 'Command Prompt');
        return;
      case 'color': {
        const code = (args[0] ?? '07').toLowerCase();
        if (!/^[0-9a-f]{2}$/.test(code) || code[0] === code[1]) {
          sh.print('Sets the default console foreground and background colors.\n\nCOLOR [attr]  e.g. "COLOR 0A" for green on black.');
          return;
        }
        sh.setColor(COLORS[parseInt(code[1], 16)], COLORS[parseInt(code[0], 16)]);
        return;
      }
      case 'exit':
        sh.exit();
        return;
      case 'cd':
      case 'chdir': {
        if (!rest) {
          sh.print(sh.cwd);
          return;
        }
        const target = resolve(sh.cwd, rest);
        const n = stat(target);
        if (!n || n.type !== 'dir') sh.print('The system cannot find the path specified.');
        else sh.setCwd(n.path);
        return;
      }
      case 'dir':
        dir(args, sh);
        return;
      case 'type': {
        if (!rest) {
          sh.print('The syntax of the command is incorrect.');
          return;
        }
        sh.print(readFile(resolve(sh.cwd, rest)).replace(/\r\n/g, '\n'));
        return;
      }
      case 'md':
      case 'mkdir':
        if (!rest) sh.print('The syntax of the command is incorrect.');
        else mkdir(resolve(sh.cwd, rest));
        return;
      case 'del':
      case 'erase':
      case 'rd':
      case 'rmdir': {
        if (!rest) {
          sh.print('The syntax of the command is incorrect.');
          return;
        }
        const target = resolve(sh.cwd, rest);
        const n = stat(target);
        if (!n) sh.print(`Could Not Find ${target}`);
        else if ((cmd === 'del' || cmd === 'erase') && n.type === 'dir') sh.print('Access is denied. Use RD for folders.');
        else recycle(target);
        return;
      }
      case 'ren':
      case 'rename': {
        if (args.length < 2) {
          sh.print('The syntax of the command is incorrect.');
          return;
        }
        rename(resolve(sh.cwd, args[0]), args[1]);
        return;
      }
      case 'start': {
        const app = findAppByAlias(args[0] ?? 'cmd');
        if (app) openApp(app.id);
        else sh.print(`The system cannot find the file ${args[0]}.`);
        return;
      }
      case 'solana':
        await solana(args, sh);
        return;
      case 'ping':
        await ping(args, sh);
        return;
      case 'spl-token':
        await splToken(args, sh);
        return;
      default: {
        const app = findAppByAlias(cmd);
        if (app) {
          const path = args[0] ? resolve(sh.cwd, rest) : undefined;
          openApp(app.id, path && (app.id === 'notepad' || app.id === 'explorer') ? { path } : {});
          return;
        }
        sh.print(`'${cmdRaw}' is not recognized as an internal or external command,\noperable program or batch file.`);
      }
    }
  } catch (e) {
    if (e instanceof VfsError) sh.print(e.message);
    else sh.print(`Error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

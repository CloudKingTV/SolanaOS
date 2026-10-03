# SolanaOS

A Windows XP–inspired desktop operating system for the Solana network, running in your browser.

SolanaOS recreates the look and feel of an early-2000s desktop: a BIOS boot screen, the logon screen, a draggable window manager, Start menu, taskbar, system tray and classic apps. Everything is themed to Solana and connected to the live cluster. Every icon, wallpaper and sound is original; no Microsoft assets are used.

> SolanaOS is an independent community project. It is not affiliated with or endorsed by the Solana Foundation or Microsoft.

## What's in Phase 2 (wallet)

Log on with your own wallet. SolanaOS uses the [Wallet Standard](https://github.com/wallet-standard/wallet-standard), so Phantom, Solflare, Backpack and other Solana wallets show up on the logon screen automatically. SolanaOS never sees private keys; every transaction is shown and approved in your wallet.

| App | What it does |
| --- | --- |
| **My Wallet** (My Computer) | SOL as `Solana (C:)` with a bar showing SOL locked as rent; each token as a drive (`BONK (D:)`); collectibles with images; devnet airdrops. Can also view any address read-only. |
| **Burn Bin** (Recycle Bin) | Lists empty token accounts and anything you "Send to Burn Bin" from My Wallet. Emptying it burns the tokens and closes the accounts, returning about 0.002 SOL rent each. Wrapped SOL is unwrapped, never burned; frozen accounts are skipped. |
| **Send Wizard** | Step-by-step SOL and token transfers with a review page. Creates the recipient's token account when needed and warns when the recipient looks like a token account or program. |
| **Solana Explorer** (Internet Explorer) | `sol://` addresses for accounts, tokens and transactions: balances, token info, balance changes, instructions and program logs. Accepts explorer.solana.com and Solscan links. Favorites menu. |
| **Inbox** (Outlook Express) | Your transaction history as email: "You received 1.5 SOL", memos as the message body, Sent Items, unread tracking. |
| **Notepad** | File → Sign Message with Wallet, and Verify Signature for signed message blocks. |
| **Command Prompt** | `solana address`, `solana balance`, `solana airdrop 1`, `solana transfer <to> <amount>`, `spl-token accounts`. |
| **System tray** | Wallet icon with balance, Copy Address, and Safely Remove Wallet. Balloons announce incoming SOL and new tokens. |

### Safety

- Devnet is the default. Transactions on Mainnet are blocked until you turn on **Allow transactions on Mainnet** in Control Panel → Network Settings.
- Signed transactions are sent through the RPC endpoint SolanaOS is showing, so they land on the cluster you're looking at.
- Token names come from on-chain metadata that anyone can set; SolanaOS shows them as plain text and never opens links from them.

## What's in Phase 1 (the shell)

| Area | What you get |
| --- | --- |
| Boot | BIOS POST screen that reports the real cluster, `solana-core` version, slot and epoch, then a logo screen with the three-block loading bar |
| Logon | "To begin, click your user name" screen with a read-only Guest account |
| Desktop | Wallpapers (Mainnet Hills, Validator Night, Gradient), draggable icons, rubber-band selection, right-click menus, new files and folders |
| Window manager | Drag, resize from any edge, minimize, maximize, taskbar buttons, modal dialogs, system menu |
| Taskbar | Start menu with All Programs flyout, quick launch, cluster badge, network and volume tray icons, clock, balloon notifications |
| Themes | Luna Mainnet (purple), Mint (green) and Silver, plus Validator Starfield and Solana Blocks screensavers |
| Shut down | Log off, switch user, stand by, turn off (with the grayscale fade), restart |

### Apps

- **Network Monitor** (Task Manager, `Ctrl+Shift+Esc`): live TPS and slot-time graphs, epoch progress, validator list, running applications.
- **Command Prompt**: `dir`, `cd`, `type`, `md`, `del`, `ping` and a read-only `solana` CLI (`slot`, `epoch-info`, `balance <ADDRESS>`, `validators`, `config set --url ...`).
- **Explorer**: folder windows with the task pane, tiles/icons/details views, back/forward/up and address bar.
- **Burn Bin**: the Recycle Bin. Delete files, restore them, empty the bin.
- **Notepad**: open/save to the virtual disk, save prompts, word wrap, status bar.
- **Calculator**: standard mode plus a Solana mode (SOL ↔ lamports and rent-exempt minimums).
- **Rugsweeper**: Minesweeper with rugs. Beginner, Intermediate and Expert, plus best times.
- **Control Panel**: Display Properties, Network Settings (devnet / mainnet-beta / custom RPC), Sounds, About.

Files live in a virtual `C:\` drive stored in the browser's IndexedDB, so they survive a reload. Settings are kept in `localStorage`.

SolanaOS starts on **devnet**. To use your own RPC provider (for example Helius or Triton), open Control Panel → Network Settings → Custom RPC.

## Roadmap

1. **Shell**: done.
2. **Chain integration**: this release.
3. **Power apps**: Mint Paint (draw and mint compressed NFTs), swaps, Stake Wizard, My Collectibles, Solamp, SolMessenger, Solitaire, Program Files (sandboxed dApps).
4. **Ship as an OS**: installable web app, Tauri desktop build, and a bootable Linux image that starts straight into SolanaOS.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run typecheck
npm run build      # static site in dist/
```

The app is a static Vite + React + TypeScript site with no backend.

```
src/
  os/        window manager, virtual file system, settings, sounds, Solana RPC
  os/wallet/ Wallet Standard connection, signing, holdings, burn and send builders
  shell/     boot, logon, desktop, windows, taskbar, Start menu, icons, wallpapers
  apps/      one folder per app; registered in apps/registry.ts
  styles/    theme tokens and XP-style chrome
```

To add an app, create a component that takes `AppProps`, then add an entry to `src/apps/registry.ts`.

## Deployment

`.github/workflows/deploy.yml` type-checks, tests and builds every push and pull request. Pushes to `main` deploy to GitHub Pages. To turn this on once, go to **Settings → Pages** and set **Source** to **GitHub Actions**. The site is then served at `https://<owner>.github.io/SolanaOS/`.

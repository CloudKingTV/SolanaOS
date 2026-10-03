# SolanaOS

A Windows XP–inspired desktop operating system for the Solana network, running in your browser.

SolanaOS recreates the look and feel of an early-2000s desktop: a BIOS boot screen, the logon screen, a draggable window manager, Start menu, taskbar, system tray and classic apps. Everything is themed to Solana and connected to the live cluster. Every icon, wallpaper and sound is original; no Microsoft assets are used.

> SolanaOS is an independent community project. It is not affiliated with or endorsed by the Solana Foundation or Microsoft.

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

SolanaOS starts on **devnet**, and everything in this release is read-only. To use your own RPC provider (for example Helius or Triton), open Control Panel → Network Settings → Custom RPC.

## Roadmap

1. **Shell**: this release.
2. **Chain integration**: wallet sign-in through Wallet Standard (Phantom, Solflare, Backpack), My Wallet, Solana Explorer, Burn Bin rent reclaim (close empty token accounts), Send Wizard, transaction Inbox, `solana airdrop` on devnet.
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
  shell/     boot, logon, desktop, windows, taskbar, Start menu, icons, wallpapers
  apps/      one folder per app; registered in apps/registry.ts
  styles/    theme tokens and XP-style chrome
```

To add an app, create a component that takes `AppProps`, then add an entry to `src/apps/registry.ts`.

## Deployment

`.github/workflows/deploy.yml` type-checks, tests and builds every push and pull request. Pushes to `main` deploy to GitHub Pages. To turn this on once, go to **Settings → Pages** and set **Source** to **GitHub Actions**. The site is then served at `https://<owner>.github.io/SolanaOS/`.

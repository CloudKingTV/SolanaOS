import { GUEST, setUser, showBalloon } from '../session';
import { disconnectWallet } from './standard';
import { refreshPortfolio } from './portfolio';
import { messageBox } from '../dialogs';

/** "Safely Remove Hardware", for wallets. */
export async function safelyRemoveWallet() {
  await disconnectWallet();
  setUser(GUEST);
  void refreshPortfolio();
  showBalloon({ title: 'Safe To Remove Wallet', icon: 'wallet', message: 'Your wallet has been disconnected. You are now browsing as Guest.' });
}

export function handleExternalDisconnect() {
  setUser(GUEST);
  void refreshPortfolio();
  showBalloon({ title: 'Wallet disconnected', icon: 'wallet', message: 'Your wallet ended the connection. You are now browsing as Guest.' });
}

export async function copyText(text: string, what = 'Address') {
  try {
    await navigator.clipboard.writeText(text);
    showBalloon({ title: `${what} copied`, icon: 'wallet', message: text });
  } catch {
    void messageBox({ title: what, icon: 'info', message: `Copy this ${what.toLowerCase()}:\n\n${text}` });
  }
}

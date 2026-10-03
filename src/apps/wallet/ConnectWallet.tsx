import { closeWindow, type AppProps } from '../../os/windows';
import { setUser, walletUser, showBalloon } from '../../os/session';
import { refreshPortfolio } from '../../os/wallet/portfolio';
import { WalletPicker } from '../../shell/WalletPicker';
import { Icon } from '../../shell/icons';

export function ConnectWallet({ windowId }: AppProps) {
  return (
    <div className="connect-wallet">
      <div className="ns-head">
        <Icon name="wallet" size={32} />
        <p>
          Choose a wallet to connect. SolanaOS never sees your private keys; every transaction is approved in your
          wallet.
        </p>
      </div>
      <WalletPicker
        variant="dialog"
        onConnected={(c) => {
          setUser(walletUser(c));
          void refreshPortfolio();
          showBalloon({ title: 'Wallet connected', icon: 'wallet', message: `${c.wallet.name} is connected as ${c.address}.` });
          closeWindow(windowId);
        }}
      />
      <div className="dialog-buttons">
        <button type="button" className="btn" onClick={() => closeWindow(windowId)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

import { closeWindow, type AppProps } from '../../os/windows';
import { SolanaLogo } from '../../shell/icons';
import { clusterLabel, useSettings } from '../../os/settings';
import { OS_VERSION } from './version';


export function About({ windowId }: AppProps) {
  const cluster = useSettings((s) => s.cluster);
  return (
    <div className="about">
      <div className="about-banner">
        <SolanaLogo size={52} />
        <div>
          <div className="about-name">
            Solana<span>OS</span>
          </div>
          <div className="about-edition">Proof of History Edition</div>
        </div>
      </div>
      <div className="about-body">
        <p>
          SolanaOS
          <br />
          Version {OS_VERSION} (Phase 2: Wallet)
          <br />
          Connected cluster: {clusterLabel(cluster)}
        </p>
        <p>
          A desktop inspired by early-2000s operating systems, built for the Solana network. Every icon,
          wallpaper and sound is original.
        </p>
        <p className="about-legal">
          SolanaOS is an independent community project. It is not affiliated with, or endorsed by, the Solana
          Foundation or Microsoft. Windows XP is a trademark of Microsoft Corporation.
        </p>
        <div className="dialog-buttons">
          <button type="button" className="btn" autoFocus onClick={() => closeWindow(windowId)}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

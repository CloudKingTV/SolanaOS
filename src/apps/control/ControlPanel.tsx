import { openApp, type AppProps } from '../../os/windows';
import { Icon, type IconName } from '../../shell/icons';

const applets: { id: string; label: string; icon: IconName; desc: string }[] = [
  { id: 'display', label: 'Display', icon: 'display', desc: 'Change the theme, wallpaper and screen saver.' },
  { id: 'netsettings', label: 'Network Settings', icon: 'globe', desc: 'Choose the Solana cluster and RPC endpoint.' },
  { id: 'programs', label: 'Add or Remove Programs', icon: 'add-remove', desc: 'Install or remove other Solana apps.' },
  { id: 'sounds', label: 'Sounds', icon: 'sound', desc: 'Turn system sounds on or off and preview them.' },
  { id: 'netmon', label: 'Network Monitor', icon: 'network-monitor', desc: 'Watch live cluster performance and validators.' },
  { id: 'about', label: 'System', icon: 'system', desc: 'See which version of SolanaOS you are running.' },
];

export function ControlPanel(_: AppProps) {
  return (
    <div className="explorer control-panel">
      <div className="explorer-main">
        <aside className="task-pane">
          <section className="tp-section">
            <h3>Control Panel</h3>
            <div className="tp-body tp-details">
              <span>Pick a setting to change. Settings are saved in this browser.</span>
            </div>
          </section>
          <section className="tp-section">
            <h3>See Also</h3>
            <div className="tp-body">
              <button type="button" onClick={() => openApp('about')}>
                <Icon name="help" size={16} /> About SolanaOS
              </button>
            </div>
          </section>
        </aside>
        <div className="cp-grid">
          <h2>Pick a Control Panel icon</h2>
          <div className="cp-items">
            {applets.map((a) => (
              <button key={a.id} type="button" className="cp-item" onClick={() => openApp(a.id)} title={a.desc}>
                <Icon name={a.icon} size={48} />
                <span>
                  <b>{a.label}</b>
                  <small>{a.desc}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

import { closeWindow, type AppProps } from '../../os/windows';
import { useSettings } from '../../os/settings';
import { sounds } from '../../os/sound';
import { Icon } from '../../shell/icons';

const EVENTS: { label: string; play: () => void }[] = [
  { label: 'Start SolanaOS', play: sounds.startup },
  { label: 'Exit SolanaOS', play: sounds.shutdown },
  { label: 'Default Beep', play: sounds.ding },
  { label: 'Critical Stop', play: sounds.error },
  { label: 'Notification', play: sounds.notify },
  { label: 'Empty Burn Bin', play: sounds.boom },
];

export function Sounds({ windowId }: AppProps) {
  const muted = useSettings((s) => s.muted);
  const update = useSettings((s) => s.update);
  return (
    <div className="sounds-applet">
      <div className="ns-head">
        <Icon name="sound" size={32} />
        <p>Every SolanaOS sound is synthesized live in your browser.</p>
      </div>
      <label className="check">
        <input type="checkbox" checked={!muted} onChange={(e) => update({ muted: !e.target.checked })} />
        <span>Play system sounds</span>
      </label>
      <fieldset className="group">
        <legend>Program events</legend>
        <div className="sound-events">
          {EVENTS.map((e) => (
            <div key={e.label} className="sound-event">
              <span>{e.label}</span>
              <button type="button" className="btn" disabled={muted} onClick={e.play} aria-label={`Play ${e.label}`}>
                ▶ Play
              </button>
            </div>
          ))}
        </div>
      </fieldset>
      <div className="dialog-buttons">
        <button type="button" className="btn" onClick={() => closeWindow(windowId)}>
          OK
        </button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { closeWindow, type AppProps } from '../../os/windows';
import { useSettings, type ScreensaverId, type Settings, type ThemeId } from '../../os/settings';
import { Tabs } from '../../shell/Tabs';
import { WALLPAPERS, WallpaperView } from '../../shell/Wallpaper';
import { ScreensaverCanvas } from '../../shell/Screensaver';

const THEMES: { id: ThemeId; name: string }[] = [
  { id: 'luna-mainnet', name: 'Luna Mainnet (purple)' },
  { id: 'mint', name: 'Mint (green)' },
  { id: 'silver', name: 'Silver' },
];

const SCREENSAVERS: { id: ScreensaverId; name: string }[] = [
  { id: 'none', name: '(None)' },
  { id: 'starfield', name: 'Validator Starfield' },
  { id: 'blocks', name: 'Solana Blocks' },
];

function Preview({ draft }: { draft: Settings }) {
  return (
    <div className="dp-monitor">
      <div className="dp-screen" data-theme={draft.theme}>
        <WallpaperView id={draft.wallpaper} color={draft.backgroundColor} />
        <div className="dp-mini-window">
          <div className="dp-mini-title">Active Window</div>
          <div className="dp-mini-body" />
        </div>
        <div className="dp-mini-taskbar">
          <span className="dp-mini-start">start</span>
        </div>
      </div>
      <div className="dp-stand" />
    </div>
  );
}

export function DisplayProperties({ windowId }: AppProps) {
  const settings = useSettings();
  const [draft, setDraft] = useState<Settings>(() => ({ ...settings }));
  const set = (patch: Partial<Settings>) => setDraft((d) => ({ ...d, ...patch }));
  const dirty =
    draft.theme !== settings.theme ||
    draft.wallpaper !== settings.wallpaper ||
    draft.backgroundColor !== settings.backgroundColor ||
    draft.screensaver !== settings.screensaver ||
    draft.screensaverMinutes !== settings.screensaverMinutes;

  const apply = () =>
    settings.update({
      theme: draft.theme,
      wallpaper: draft.wallpaper,
      backgroundColor: draft.backgroundColor,
      screensaver: draft.screensaver,
      screensaverMinutes: draft.screensaverMinutes,
    });

  return (
    <div className="display-props">
      <Tabs
        initial={1}
        tabs={[
          {
            label: 'Themes',
            content: (
              <div className="dp-tab">
                <p>A theme is a background plus a set of colors and window styles to help you personalize your computer.</p>
                <label className="field">
                  <span>Theme:</span>
                  <select
                    value={draft.theme}
                    onChange={(e) => set({ theme: e.target.value as ThemeId })}
                  >
                    {THEMES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Preview draft={draft} />
              </div>
            ),
          },
          {
            label: 'Desktop',
            content: (
              <div className="dp-tab">
                <Preview draft={draft} />
                <div className="dp-row">
                  <label className="field col">
                    <span>Background:</span>
                    <select size={5} value={draft.wallpaper} onChange={(e) => set({ wallpaper: e.target.value as Settings['wallpaper'] })}>
                      {WALLPAPERS.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field col">
                    <span>Color:</span>
                    <input type="color" value={draft.backgroundColor} onChange={(e) => set({ backgroundColor: e.target.value })} />
                  </label>
                </div>
              </div>
            ),
          },
          {
            label: 'Screen Saver',
            content: (
              <div className="dp-tab">
                <div className="dp-monitor">
                  <div className="dp-screen ss">
                    {draft.screensaver === 'none' ? <WallpaperView id={draft.wallpaper} color={draft.backgroundColor} /> : <ScreensaverCanvas kind={draft.screensaver} preview />}
                  </div>
                  <div className="dp-stand" />
                </div>
                <fieldset className="group">
                  <legend>Screen saver</legend>
                  <div className="dp-row">
                    <select value={draft.screensaver} onChange={(e) => set({ screensaver: e.target.value as ScreensaverId })}>
                      {SCREENSAVERS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <label className="field">
                      <span>Wait:</span>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={draft.screensaverMinutes}
                        onChange={(e) => set({ screensaverMinutes: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })}
                        style={{ width: 48 }}
                      />
                      <span>minutes</span>
                    </label>
                  </div>
                </fieldset>
              </div>
            ),
          },
          {
            label: 'Appearance',
            content: (
              <div className="dp-tab">
                <Preview draft={draft} />
                <label className="field">
                  <span>Windows and buttons:</span>
                  <select disabled>
                    <option>SolanaOS style</option>
                  </select>
                </label>
                <label className="field">
                  <span>Color scheme:</span>
                  <select value={draft.theme} onChange={(e) => set({ theme: e.target.value as ThemeId })}>
                    {THEMES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name.replace(/ \(.*\)/, '')}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ),
          },
        ]}
      />
      <div className="dialog-buttons">
        <button
          type="button"
          className="btn"
          onClick={() => {
            apply();
            closeWindow(windowId);
          }}
        >
          OK
        </button>
        <button type="button" className="btn" onClick={() => closeWindow(windowId)}>
          Cancel
        </button>
        <button type="button" className="btn" disabled={!dirty} onClick={apply}>
          Apply
        </button>
      </div>
    </div>
  );
}

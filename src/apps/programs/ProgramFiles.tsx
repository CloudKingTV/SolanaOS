import { useMemo, useState } from 'react';
import { openApp, type AppProps } from '../../os/windows';
import { useVfs } from '../../os/vfs';
import {
  CATALOG,
  colorFor,
  hasDesktopShortcut,
  install,
  installedPrograms,
  isInstalled,
  normalizeUrlInput,
  setDesktopShortcut,
  uninstall,
  type Category,
  type Program,
} from '../../os/programs/programs';
import { messageBox } from '../../os/dialogs';
import { Icon } from '../../shell/icons';
import { ProgramAvatar, openExternal } from './ProgramHost';

type Tab = 'installed' | 'add';

export function runProgram(p: { name: string; url: string }) {
  openApp('program', { url: p.url, name: p.name });
}

const CATEGORIES: Category[] = ['Trading', 'Lending & Yield', 'Staking', 'NFTs', 'Explorers & Data', 'DAOs & Teams', 'Developer'];

export function ProgramFiles({ windowId, args }: AppProps) {
  const nodes = useVfs((s) => s.nodes);
  const [tab, setTab] = useState<Tab>(args.tab === 'add' ? 'add' : 'installed');
  const [selected, setSelected] = useState<string | null>(null);
  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const programs = useMemo(() => installedPrograms(nodes), [nodes]);

  const remove = async (p: Program) => {
    const answer = await messageBox({
      title: 'Add or Remove Programs',
      icon: 'question',
      message: `Are you sure you want to remove ${p.name} from SolanaOS?\n\nThis only removes the shortcut. Nothing changes in your wallet.`,
      buttons: ['Yes', 'No'],
      owner: windowId,
    });
    if (answer === 'Yes') {
      uninstall(p);
      setSelected(null);
    }
  };

  const addCustom = () => {
    const url = normalizeUrlInput(customUrl);
    const name = customName.trim() || (url ? new URL(url).hostname.replace(/^www\./, '') : '');
    if (!url) {
      setCustomError('Enter an https:// website address.');
      return;
    }
    try {
      install(name, url);
      setCustomName('');
      setCustomUrl('');
      setCustomError(null);
      setTab('installed');
      setSelected(name);
    } catch (e) {
      setCustomError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="pf">
      <nav className="pf-side">
        <button type="button" className={tab === 'installed' ? 'active' : ''} onClick={() => setTab('installed')}>
          <Icon name="program-files" size={32} />
          <span>Change or Remove Programs</span>
        </button>
        <button type="button" className={tab === 'add' ? 'active' : ''} onClick={() => setTab('add')}>
          <Icon name="add-remove" size={32} />
          <span>Add New Programs</span>
        </button>
      </nav>
      <div className="pf-main">
        {tab === 'installed' ? (
          <>
            <div className="pf-head">Currently installed programs: {programs.length}</div>
            <ul className="pf-list">
              {programs.length === 0 && <li className="pf-empty">No programs installed. Click Add New Programs.</li>}
              {programs.map((p) => {
                const open = selected === p.name;
                return (
                  <li key={p.path} className={open ? 'selected' : ''} onClick={() => setSelected(p.name)} onDoubleClick={() => runProgram(p)}>
                    <div className="pf-row">
                      <ProgramAvatar name={p.name} color={colorFor(p)} size={24} />
                      <b>{p.name}</b>
                      <span className="pf-cat">{p.entry?.category ?? 'My Programs'}</span>
                    </div>
                    {open && (
                      <div className="pf-detail">
                        <p>{p.entry?.description ?? p.url}</p>
                        <label className="check">
                          <input type="checkbox" checked={hasDesktopShortcut(p)} onChange={(e) => setDesktopShortcut(p, e.target.checked)} />
                          <span>Show on Desktop</span>
                        </label>
                        <div className="pf-buttons">
                          <button type="button" className="btn" onClick={() => runProgram(p)}>
                            Open
                          </button>
                          <button type="button" className="btn" onClick={() => openExternal(p.url)}>
                            New Tab
                          </button>
                          <button type="button" className="btn" onClick={() => void remove(p)}>
                            Remove
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <>
            <div className="pf-head">Add a Solana program</div>
            <div className="pf-catalog">
              {CATEGORIES.map((cat) => (
                <section key={cat}>
                  <h4>{cat}</h4>
                  {CATALOG.filter((c) => c.category === cat).map((c) => {
                    const has = isInstalled(c, nodes);
                    return (
                      <div key={c.name} className="pf-entry">
                        <ProgramAvatar name={c.name} color={c.color} size={28} />
                        <div className="pf-entry-text">
                          <b>{c.name}</b>
                          <small>
                            {c.description} {c.network === 'mainnet' ? '· Mainnet' : c.network === 'devnet' ? '· Devnet' : ''}
                          </small>
                        </div>
                        <button
                          type="button"
                          className="btn"
                          disabled={has}
                          onClick={() => {
                            install(c.name, c.url);
                          }}
                        >
                          {has ? 'Installed' : 'Add'}
                        </button>
                      </div>
                    );
                  })}
                </section>
              ))}
              <section>
                <h4>Add any website</h4>
                <form
                  className="pf-custom"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addCustom();
                  }}
                >
                  <label>
                    Address
                    <input type="text" value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="https://" spellCheck={false} />
                  </label>
                  <label>
                    Name
                    <input type="text" value={customName} onChange={(e) => setCustomName(e.target.value)} maxLength={40} />
                  </label>
                  {customError && <div className="pf-error">{customError}</div>}
                  <button type="submit" className="btn">
                    Add
                  </button>
                </form>
              </section>
              <p className="pf-fine">Programs are links to independent websites, not reviewed or endorsed by SolanaOS. Check the address before connecting your wallet.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

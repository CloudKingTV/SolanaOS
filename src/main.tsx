import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { registerApps } from './os/windows';
import { APPS } from './apps/registry';
import { initVfs } from './os/vfs';
import { initWallets } from './os/wallet/standard';
import { seedPrograms } from './os/programs/programs';
import './styles/base.css';
import './styles/shell.css';
import './styles/apps.css';
import './styles/wallet.css';
import './styles/phase3.css';
import './styles/phase3b.css';

registerApps(APPS);
initWallets();

void initVfs().then(() => {
  seedPrograms();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});

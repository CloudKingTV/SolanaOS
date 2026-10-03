import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { registerApps } from './os/windows';
import { APPS } from './apps/registry';
import { initVfs } from './os/vfs';
import './styles/base.css';
import './styles/shell.css';
import './styles/apps.css';

registerApps(APPS);

void initVfs().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});

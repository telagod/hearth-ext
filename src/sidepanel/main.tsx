import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadLangFromSettings } from '@shared/i18n';
import './styles/components.css';

void loadLangFromSettings();

const el = document.getElementById('root');
if (!el) throw new Error('#root missing');
createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

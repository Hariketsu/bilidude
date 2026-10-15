import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { applyUiLanguage } from '@/lib/i18n';
import { loadSettings } from '@/lib/settings';
import { applyTheme } from '@/lib/theme';
import './style.css';

// Apply the saved theme and language before the first paint to avoid a flash of the wrong ones.
loadSettings().then((settings) => {
  applyTheme(settings.theme);
  applyUiLanguage(settings.uiLanguage);
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});

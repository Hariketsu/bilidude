import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { loadSettings } from '@/lib/settings';
import { applyTheme } from '@/lib/theme';
import './style.css';

// Apply the saved theme before the first paint to avoid a flash of the wrong one.
loadSettings().then((settings) => {
  applyTheme(settings.theme);
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});

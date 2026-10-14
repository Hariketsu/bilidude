import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { applyTheme } from '@/lib/theme';
import './style.css';

// Settings UI will supply the preference later; follow the system until then.
applyTheme('system');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

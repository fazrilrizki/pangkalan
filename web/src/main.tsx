import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { captureTokenFromUrl } from './lib/auth';
import { initTheme } from './lib/theme';
import './index.css';

captureTokenFromUrl();
initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

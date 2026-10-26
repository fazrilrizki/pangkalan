import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { captureTokenFromUrl } from './lib/auth';
import './index.css';

captureTokenFromUrl();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './tokens.css';
import './vendor.css';
import './styles.css';
import './ui/ui.css';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

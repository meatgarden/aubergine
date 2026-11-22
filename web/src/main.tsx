import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './tokens.css';
import './vendor.css';
import './styles.css';
import './ui/ui.css';
import { App } from './App';
import { takeCodeFromAddress } from './devices/pair-address';

// Before anything is asked of the server: a sign-in code after `#pair=` is taken out of the address, so that it is not kept in the history.
takeCodeFromAddress();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

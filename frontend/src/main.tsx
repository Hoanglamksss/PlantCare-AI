import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing root container');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

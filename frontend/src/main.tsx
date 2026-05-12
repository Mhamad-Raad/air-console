import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { buildSynthPack, loadSoundPack } from './shared/feel';
import './i18n';
import './index.css';

// Render the procedural sound pack at boot so every game inherits a
// working audio layer with zero binary assets. Swap for real samples
// later by replacing buildSynthPack() with a static URL map.
buildSynthPack()
  .then((pack) => loadSoundPack(pack, { format: ['wav'] }))
  .catch((err) => console.warn('[feel] sound pack failed to load:', err));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

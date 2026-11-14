import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/michroma/400.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './styles/tokens.css';
import './styles/app.css';
import App from './App.jsx';
import { applyTheme, readTheme } from './lib/theme.js';

applyTheme(readTheme()); // antes del primer render: sin parpadeo de tema
import { RegionProvider, StoreProvider } from './state/store.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <StoreProvider>
      <RegionProvider>
        <App />
      </RegionProvider>
    </StoreProvider>
  </StrictMode>,
);

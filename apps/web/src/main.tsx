import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App.js';
import './index.css';

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);

// Fade out the index.html splash once the app has mounted (min ~500ms so it
// doesn't just flash on fast loads).
const SPLASH_MIN_MS = 500;
const start = performance.now();
requestAnimationFrame(() => {
  const splash = document.getElementById('splash');
  if (!splash) return;
  const wait = Math.max(0, SPLASH_MIN_MS - (performance.now() - start));
  setTimeout(() => {
    splash.style.opacity = '0';
    setTimeout(() => splash.remove(), 400);
  }, wait);
});

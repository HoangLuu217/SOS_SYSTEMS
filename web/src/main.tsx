import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './index.css';
import App from './App.tsx';
import './styles/chronicle-system.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

const dismissBootLoader = () => {
  const el = document.getElementById('app-boot-loader');
  if (!el) return;
  const elapsed = typeof performance !== 'undefined' ? performance.now() : 0;
  const remaining = Math.max(0, 950 - elapsed);
  window.setTimeout(() => {
    el.classList.add('is-hidden');
    window.setTimeout(() => {
      el.remove();
    }, 380);
  }, remaining);
};

if (document.readyState === 'complete') {
  dismissBootLoader();
} else {
  window.addEventListener('load', dismissBootLoader, { once: true });
  window.setTimeout(dismissBootLoader, 2400);
}

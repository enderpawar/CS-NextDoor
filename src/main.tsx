import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const container = document.getElementById('root');
if (!container) throw new Error('root element not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service Worker 등록 — PWA 오프라인 캐시 + 설치 지원
// Electron(file://)에서는 SW 불필요하므로 electronAPI 존재 여부로 분기
if ('serviceWorker' in navigator && !window.electronAPI) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('[SW] 등록 실패:', err);
    });
  });
}

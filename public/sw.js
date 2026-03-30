// Service Worker — nextdoor-cs
// ⚠️ 배포마다 버전 올릴 것 (구버전 캐시와 새 API 충돌 방지)
const CACHE = 'nextdoorcs-v3';

// opencv.js는 PRECACHE 제외 — 9.9MB 대용량 파일은 install 단계에서 캐시 실패 위험
// useOpenCV.ts의 script 태그가 on-demand로 로드 (SW 캐시 우선 → 네트워크 폴백)
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // 이전 버전 캐시 모두 삭제
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  // /api/* 요청은 캐시 사용 안 함 — 항상 네트워크
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).catch(() =>
        // 네트워크 장애 폴백: index.html 반환 (SPA 라우팅 유지)
        caches.match('/index.html')
      );
    })
  );
});

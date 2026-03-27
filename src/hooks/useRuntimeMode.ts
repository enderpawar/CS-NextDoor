import { RuntimeMode } from '../types';

// URL에 ?session= 파라미터 없으면 pwa-standalone (PC 부팅 불가 직접 진입)
// pwa-standalone: WS 연결 없음, QR UI 숨김, HTTP 응답만으로 결과 수신
export function useRuntimeMode(): RuntimeMode {
  if (window.electronAPI) return 'electron';
  const hasSession = new URLSearchParams(location.search).has('session');
  return hasSession ? 'pwa-session' : 'pwa-standalone';
}

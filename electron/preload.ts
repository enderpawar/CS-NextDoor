import { contextBridge, ipcRenderer } from 'electron';
import type { SystemSnapshot } from './modules/systemMonitor';

// renderer(React)에서 window.electronAPI.* 로 접근
// src/types/electron.d.ts의 ElectronAPI interface와 반드시 일치 유지
contextBridge.exposeInMainWorld('electronAPI', {
  // Phase 3 — 시스템 정보 1회 조회
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),

  // Phase 3 — 실시간 업데이트 구독
  // React Strict Mode에서 useEffect 2회 실행 → on() 이중 등록 방지
  // removeSystemListener()를 on() 직전에 반드시 호출
  onSystemUpdate: (cb: (data: SystemSnapshot) => void) =>
    ipcRenderer.on('system-update', (_, data) => cb(data as SystemSnapshot)),
  removeSystemListener: () =>
    ipcRenderer.removeAllListeners('system-update'),

  // Phase 4 — Windows 이벤트 로그 조회
  getEventLogs: () => ipcRenderer.invoke('get-event-logs'),

  // Phase 4 — 상위 프로세스 목록 조회
  getTopProcesses: () => ipcRenderer.invoke('get-top-processes'),

  // Phase 11 — 세션 ID 조회 (스텁)
  getSessionId: () => ipcRenderer.invoke('get-session-id'),
});

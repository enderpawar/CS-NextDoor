import { useState, useEffect } from 'react';
import type { SystemSnapshot } from '../types/electron';

// Phase 3: Electron IPC에서 시스템 스냅샷 구독
// — Strict Mode에서 useEffect 2회 실행 → removeSystemListener() 선행 필수
export function useSystemInfo(): SystemSnapshot | null {
  const [sysInfo, setSysInfo] = useState<SystemSnapshot | null>(null);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    // 이중 등록 방지 (React 18 Strict Mode)
    api.removeSystemListener();
    api.getSystemInfo().then(setSysInfo);
    api.onSystemUpdate(setSysInfo);

    return () => api.removeSystemListener();
  }, []);

  return sysInfo;
}

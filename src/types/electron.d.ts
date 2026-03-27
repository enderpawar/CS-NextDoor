// ElectronAPI — preload.ts의 contextBridge.exposeInMainWorld('electronAPI', {...})와 반드시 일치
// window.electronAPI가 undefined이면 PWA 환경 → useRuntimeMode에서 분기 처리

// ── 시스템 데이터 타입 (Phase 3) ──────────────────────────────────────────────

export interface CpuInfo {
  usage: number;           // 0~100 %
  temperature: number | null; // AMD/일부 OEM에서 null 가능 — UI에서 "측정 불가" 처리
}

export interface MemoryInfo {
  used: number;            // bytes
  total: number;           // bytes
}

export interface GpuInfo {
  model: string;
  vram: number;            // MB. 사용률·온도는 수집 불가 (systeminformation 한계)
}

export interface DiskInfo {
  read: number;            // bytes/s
  write: number;           // bytes/s
}

export interface SystemSnapshot {
  cpu: CpuInfo;
  memory: MemoryInfo;
  gpu: GpuInfo | null;
  disk: DiskInfo | null;
  biosType?: string;       // systeminformation.bios().vendor 매핑값 (Phase 8)
}

// ── 이벤트 로그 타입 (Phase 4) ────────────────────────────────────────────────

export interface EventLog {
  timeCreated: string;     // ISO 8601
  id: number;
  levelDisplayName: string;
  message: string;
}

// ── IPC 브리지 인터페이스 ────────────────────────────────────────────────────

export interface ElectronAPI {
  // Phase 3 — 시스템 정보 (1회성 조회)
  getSystemInfo: () => Promise<SystemSnapshot>;

  // Phase 3 — 실시간 업데이트 구독 (isSendingRef와 같이 사용)
  // removeSystemListener()를 on() 직전에 호출 — Strict Mode 이중 등록 방지
  onSystemUpdate: (callback: (data: SystemSnapshot) => void) => void;
  removeSystemListener: () => void;

  // Phase 4 — Windows 이벤트 로그
  getEventLogs: () => Promise<EventLog[]>;

  // Phase 11 — 세션 관리
  getSessionId: () => Promise<string | null>;
}

// ── window 전역 타입 확장 ─────────────────────────────────────────────────────

declare global {
  interface Window {
    electronAPI?: ElectronAPI; // optional — undefined이면 PWA 환경
  }
}

// ── 공유 타입 정의 ──────────────────────────────────────────────────────────
// API 응답 타입은 반드시 이 파일에서 중앙 관리. 컴포넌트 파일에 직접 정의 금지.
// Phase 진행에 따라 타입 추가. any 사용 금지 (OpenCV cv.* API 제외).

// ── 런타임 모드 ──────────────────────────────────────────────────────────────

export type RuntimeMode = 'electron' | 'pwa-session' | 'pwa-standalone';

// ── 진단 도메인 ──────────────────────────────────────────────────────────────

export interface DiagnosisResponse {
  cause: string;
  solution: string;
  confidence: number;    // 0.0 ~ 1.0. 0.6 미만 → 수리기사 권장 배너
  parts?: string[];      // ["RAM", "GPU"] — PartCategory enum 값
}

export interface Hypothesis {
  id: string;
  title: string;
  description: string;
  priority: 'A' | 'B' | 'C'; // A: 직접 시도 가능, C: 전문 개입 필요
  confidence: number;
  status: 'pending' | 'trying' | 'resolved' | 'failed';
}

export interface HypothesesResponse {
  diagnosisId: string;
  hypotheses: Hypothesis[];
  immediateAction?: string;
}

export interface FeedbackRequest {
  status: 'RESOLVED' | 'UNRESOLVED';
  note?: string;
}

// ── 세션 ─────────────────────────────────────────────────────────────────────

export type SessionType =
  | 'PWA_ONLY'  // PWA 앱 시작 시 자동 생성. QR 스캔 전까지 SW 데이터 없음
  | 'LINKED';   // Electron QR 스캔으로 합류. PWA_ONLY 세션은 이 시점에 폐기됨

export interface SessionInfo {
  sessionId: string;
  sessionType: SessionType;
  authToken: string;
  shortCode: string;     // 6자리 수동 입력 폴백용
  expiresAt: string;     // ISO 8601
}

// ── Live Camera Guide Mode ────────────────────────────────────────────────────

export type GuideContext =
  | 'BIOS_ENTRY'         // BIOS 진입 키 안내 (F2 / Del / F10 / F12)
  | 'BOOT_MENU'          // USB·SSD 부팅 우선순위 설정
  | 'WINDOWS_INSTALL'    // 파티션 설정 → 드라이버 설치
  | 'BIOS_RESET'         // Load Defaults 위치 찾기
  | 'SECURE_BOOT';       // CSM / Secure Boot 변경

export interface GuideMessage {
  role: 'user' | 'model';
  text: string;
}

export interface GuideSession {
  sessionId: string;
  context: GuideContext;
  status: 'ACTIVE' | 'DONE';
}

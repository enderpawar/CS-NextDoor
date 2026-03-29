// ── 공유 타입 정의 ──────────────────────────────────────────────────────────
// API 응답 타입은 반드시 이 파일에서 중앙 관리. 컴포넌트 파일에 직접 정의 금지.
// Phase 진행에 따라 타입 추가. any 사용 금지 (OpenCV cv.* API 제외).

// ── 런타임 모드 ──────────────────────────────────────────────────────────────

export type RuntimeMode = 'electron' | 'pwa-session' | 'pwa-standalone';

// ── UI 공통 ───────────────────────────────────────────────────────────────────

// 클립보드 이미지 붙여넣기 (App.tsx paste 이벤트, diagnosisApi 전송 시 재사용)
export interface ClipboardImage {
  dataUrl: string; // FileReader 결과 — Gemini 전송 시 base64 부분만 추출
  file: File;
}

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

// ── Phase 5: SW 진단 풀 플로우 ────────────────────────────────────────────────

export interface SystemMetrics {
  cpuUsage: number;       // 0~100 %
  memoryUsed: number;     // bytes
  memoryTotal: number;    // bytes
  cpuDeltaPct?: number;   // 재현 후 상대 변화율 %
  memoryDeltaMB?: number; // 재현 후 변화량 MB
}

export interface SoftwareDiagnosisRequest {
  diagnosisId: string;
  hypothesisId: string;
  hypothesisTitle: string;
  symptom: string;
  baseline: SystemMetrics;
  delta: SystemMetrics;
  previousDiagnosisId?: string; // "이게 전부가 아닐 수 있어요" 재진단 시
}

export interface SoftwareDiagnosisResponse {
  diagnosisId: string;
  confirmedHypothesis: string;
  cause: string;
  solution: string;
  confidence: number;        // 0.0~1.0
  requiresRepairShop: boolean;
  isComplex: boolean;        // SW+HW 복합 원인 의심
}

export interface PatternSuggestion {
  id: string;
  title: string;
  description: string;
  matchReason: string;
  relevanceScore: number;
}

export interface PatternsResponse {
  patterns: PatternSuggestion[];
  summary: string; // 빈 패턴 시 "간헐적 증상이라 지금 당장 파악이 어려워요"
}

// ── Phase 6: HW 진단 (PWA) ───────────────────────────────────────────────────

export interface HardwareDiagnosisRequest {
  symptom: string;            // 사용자 증상 텍스트
  frames: string[];           // Base64 JPEG 배열 (1~2초 간격 핵심 프레임, Phase 7에서 채워짐)
  sessionId?: string;         // LINKED 세션 시 포함
  biosType?: string;          // AMI / Award / Phoenix / 기타 (Phase 8에서 채워짐)
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

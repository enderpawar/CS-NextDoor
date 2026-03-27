// API 호출 레이어 — 백엔드 /api/diagnosis/* 엔드포인트 래핑
// Electron 환경에서는 file:// 프로토콜이므로 절대 URL 필수

import type {
  HypothesesResponse,
  SoftwareDiagnosisRequest,
  SoftwareDiagnosisResponse,
  PatternsResponse,
} from '../types';
import type { EventLog } from '../types/electron';

const API_BASE = 'http://localhost:8080';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }

  return res.json() as Promise<T>;
}

// ── Phase 1/5: SW 가설 생성 ──────────────────────────────────────────────────

export interface HypothesisRequestPayload {
  symptom: string;
  clipboardImage?: string;      // Base64 (data: prefix 제거)
  systemSnapshot?: Record<string, unknown>;
}

export function generateHypotheses(payload: HypothesisRequestPayload): Promise<HypothesesResponse> {
  return post<HypothesesResponse>('/api/diagnosis/hypotheses', payload);
}

// ── Phase 5: SW 가설 확정 ────────────────────────────────────────────────────

export function confirmSoftwareDiagnosis(
  req: SoftwareDiagnosisRequest,
): Promise<SoftwareDiagnosisResponse> {
  return post<SoftwareDiagnosisResponse>('/api/diagnosis/software', req);
}

// ── Phase 5: 이벤트 로그 기반 패턴 제안 ─────────────────────────────────────

export function suggestPatterns(
  eventLog: EventLog[],
  symptom?: string,
): Promise<PatternsResponse> {
  return post<PatternsResponse>('/api/diagnosis/patterns', { eventLog, symptom });
}

// ── 공통: 피드백 ─────────────────────────────────────────────────────────────

export function sendFeedback(
  diagnosisId: string,
  status: 'RESOLVED' | 'UNRESOLVED',
): Promise<void> {
  return post<void>(`/api/diagnosis/${diagnosisId}/feedback`, { status });
}

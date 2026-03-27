// HypothesisTracker — SW 진단 풀 플로우
// 가설 A/B/C 카드 → 순차 시도 → 재현 모드 → PatternSelector 또는 확정 결과
// Phase 5 핵심 컴포넌트

import { useState, useCallback } from 'react';
import type { Hypothesis, HypothesesResponse, SoftwareDiagnosisResponse, PatternSuggestion, PatternsResponse } from '../../types';
import type { SystemSnapshot } from '../../types/electron';
import DiagnosisConfidence from '../shared/DiagnosisConfidence';
import PatternSelector from './PatternSelector';
import { useReproductionMonitor } from '../../hooks/useReproductionMonitor';
import { confirmSoftwareDiagnosis, suggestPatterns, generateHypotheses } from '../../api/diagnosisApi';
import { useSystemInfo } from '../../hooks/useSystemInfo';

interface Props {
  response: HypothesesResponse;
  symptom: string;
  eventLogs?: { timeCreated: string; id: number; levelDisplayName: string; message: string }[];
  onHwEscalate: () => void;
  onReset: () => void;
}

type TrackerPhase =
  | 'hypotheses'        // 가설 카드 표시
  | 'reproduction'      // 재현 모드
  | 'reproducing'       // 재현 진행 중
  | 'pattern-loading'   // 패턴 API 호출 중 (패턴 뷰에 포함)
  | 'patterns'          // PatternSelector 표시
  | 'sw-loading'        // SW 확정 API 호출 중
  | 'sw-result'         // 확정 결과 표시
  | 'hw-escalation';    // HW 에스컬레이션 준비

function priorityColor(priority: Hypothesis['priority']): string {
  if (priority === 'A') return 'var(--color-success)';
  if (priority === 'B') return 'var(--color-warning)';
  return 'var(--color-error)';
}

function priorityLabel(priority: Hypothesis['priority']): string {
  if (priority === 'A') return '직접 시도 가능';
  if (priority === 'B') return '중간 위험도';
  return '전문 개입 필요';
}

export default function HypothesisTracker({ response, symptom, eventLogs = [], onHwEscalate, onReset }: Props) {
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>(response.hypotheses);
  const [trackerPhase, setTrackerPhase] = useState<TrackerPhase>('hypotheses');
  const [activeHypothesisId, setActiveHypothesisId] = useState<string | null>(null);
  const [swResult, setSwResult] = useState<SoftwareDiagnosisResponse | null>(null);
  const [patternsData, setPatternsData] = useState<PatternsResponse | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const sysInfo = useSystemInfo();
  const repro = useReproductionMonitor();

  // 가설 상태 업데이트
  const updateStatus = useCallback(
    (id: string, status: Hypothesis['status']) => {
      setHypotheses(prev => prev.map(h => (h.id === id ? { ...h, status } : h)));
    },
    [],
  );

  // 가설 "시도 중" 설정
  const handleTry = useCallback((id: string) => {
    setActiveHypothesisId(id);
    updateStatus(id, 'trying');
  }, [updateStatus]);

  // 가설 해결 / 실패 처리
  const handleStatusChange = useCallback(
    (id: string, newStatus: 'resolved' | 'failed') => {
      updateStatus(id, newStatus);
      setActiveHypothesisId(null);
    },
    [updateStatus],
  );

  // 모든 가설 소진 여부 확인 → 재현 모드 전환
  const handleAllExhausted = useCallback(() => {
    setTrackerPhase('reproduction');
    repro.reset();
  }, [repro]);

  // 베이스라인 수집
  const handleCollectBaseline = useCallback(() => {
    if (!sysInfo) return;
    repro.collectBaseline(sysInfo);
  }, [sysInfo, repro]);

  // 재현 후 delta 수집
  const handleCollectDelta = useCallback(async () => {
    if (!sysInfo) return;
    repro.collectDelta(sysInfo);
    setTrackerPhase('reproducing');
  }, [sysInfo, repro]);

  // 재현 완료 처리 — 성공: SW 확정 / 실패: 패턴 제안
  const handleReproductionComplete = useCallback(async () => {
    if (!repro.result) return;

    const tryingHypothesis = hypotheses.find(h => h.status === 'trying') ?? hypotheses[0];

    if (repro.result.success) {
      // 재현 성공 → SW 가설 확정
      setTrackerPhase('sw-loading');
      setApiError(null);
      try {
        const result = await confirmSoftwareDiagnosis({
          diagnosisId: response.diagnosisId,
          hypothesisId: tryingHypothesis?.id ?? 'h1',
          hypothesisTitle: tryingHypothesis?.title ?? '가설',
          symptom,
          baseline: repro.result.baseline,
          delta: repro.result.delta,
        });
        setSwResult(result);
        setTrackerPhase('sw-result');
      } catch (e) {
        setApiError((e as Error).message);
        setTrackerPhase('reproduction');
      }
    } else {
      // 재현 실패 → 패턴 제안
      setTrackerPhase('pattern-loading');
      setApiError(null);
      try {
        const patterns = await suggestPatterns(
          eventLogs.map(l => ({ ...l })) as Parameters<typeof suggestPatterns>[0],
          symptom,
        );
        setPatternsData(patterns);
        setTrackerPhase('patterns');
      } catch (e) {
        setApiError((e as Error).message);
        setTrackerPhase('reproduction');
      }
    }
  }, [repro.result, hypotheses, response.diagnosisId, symptom, eventLogs]);

  // 패턴 선택 후 재진단
  const handlePatternSelect = useCallback(
    async (pattern: PatternSuggestion) => {
      setTrackerPhase('sw-loading');
      setApiError(null);
      try {
        const newResponse = await generateHypotheses({
          symptom: `${symptom}\n\n[이전 패턴 분석] ${pattern.title}: ${pattern.description}`,
          systemSnapshot: {},
        });
        setHypotheses(newResponse.hypotheses);
        setTrackerPhase('hypotheses');
      } catch (e) {
        setApiError((e as Error).message);
        setTrackerPhase('patterns');
      }
    },
    [symptom],
  );

  // 복합 원인 재진단 — "이게 전부가 아닐 수 있어요"
  const handleContinueDiagnosis = useCallback(async () => {
    if (!swResult) return;
    setTrackerPhase('sw-loading');
    setApiError(null);
    try {
      const tryingHypothesis = hypotheses.find(h => h.status === 'trying') ?? hypotheses[0];
      const result = await confirmSoftwareDiagnosis({
        diagnosisId: response.diagnosisId,
        hypothesisId: tryingHypothesis?.id ?? 'h1',
        hypothesisTitle: tryingHypothesis?.title ?? '가설',
        symptom,
        baseline: repro.result?.baseline ?? { cpuUsage: 0, memoryUsed: 0, memoryTotal: 1 },
        delta: repro.result?.delta ?? { cpuUsage: 0, memoryUsed: 0, memoryTotal: 1 },
        previousDiagnosisId: swResult.diagnosisId,
      });
      setSwResult(result);
      setTrackerPhase('sw-result');
    } catch (e) {
      setApiError((e as Error).message);
      setTrackerPhase('sw-result');
    }
  }, [swResult, hypotheses, response.diagnosisId, symptom, repro.result]);

  const allExhausted =
    hypotheses.length > 0 &&
    hypotheses.every(h => h.status === 'resolved' || h.status === 'failed');

  // ── 렌더링 ─────────────────────────────────────────────────────────────────

  if (trackerPhase === 'sw-loading' || trackerPhase === 'pattern-loading') {
    return (
      <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
        <div className="dot-loading" />
        <p className="text-sm" style={{ marginTop: 'var(--space-3)', color: 'var(--color-text-secondary)' }}>
          {trackerPhase === 'sw-loading' ? '진단 결과를 분석하고 있어요...' : '이벤트 로그 패턴을 분석하고 있어요...'}
        </p>
      </div>
    );
  }

  if (trackerPhase === 'sw-result' && swResult) {
    return <SwResultView result={swResult} onContinue={handleContinueDiagnosis} onHwEscalate={onHwEscalate} onReset={onReset} />;
  }

  if (trackerPhase === 'patterns' && patternsData) {
    return (
      <PatternSelector
        patterns={patternsData.patterns}
        summary={patternsData.summary}
        onSelect={handlePatternSelect}
        onRetryDiagnosis={onReset}
      />
    );
  }

  if (trackerPhase === 'reproduction' || trackerPhase === 'reproducing') {
    return (
      <ReproductionView
        phase={repro.phase}
        baselineWarning={repro.baselineWarning}
        reproResult={repro.result}
        hasSysInfo={!!sysInfo}
        apiError={apiError}
        onCollectBaseline={handleCollectBaseline}
        onCollectDelta={handleCollectDelta}
        onComplete={handleReproductionComplete}
        onBack={() => setTrackerPhase('hypotheses')}
      />
    );
  }

  return (
    <section className="animate-fade-in-up" style={{ marginTop: 'var(--space-4)' }}>
      {response.immediateAction && (
        <div
          style={{
            background: 'var(--color-brand-light)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3) var(--space-4)',
            marginBottom: 'var(--space-4)',
          }}
        >
          <span className="text-label" style={{ color: 'var(--color-brand)' }}>지금 당장 해볼 수 있는 조치</span>
          <p className="text-sm" style={{ marginTop: 'var(--space-1)', color: 'var(--color-text-primary)' }}>
            {response.immediateAction}
          </p>
        </div>
      )}

      <p className="text-label" style={{ marginBottom: 'var(--space-3)' }}>가설 목록</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {hypotheses.map((h) => (
          <HypothesisCard
            key={h.id}
            hypothesis={h}
            isActive={activeHypothesisId === h.id}
            onTry={handleTry}
            onResolve={(id) => handleStatusChange(id, 'resolved')}
            onFail={(id) => handleStatusChange(id, 'failed')}
          />
        ))}
      </div>

      {apiError && (
        <p className="text-sm" style={{ color: 'var(--color-error)', marginTop: 'var(--space-3)' }}>
          오류: {apiError}
        </p>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-5)' }}>
        {allExhausted ? (
          <button
            type="button"
            onClick={handleAllExhausted}
            style={{
              flex: 1,
              padding: 'var(--space-3)',
              background: 'var(--color-brand)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            재현 모드로 계속 진단
          </button>
        ) : (
          <p className="text-sm" style={{ color: 'var(--color-text-hint)', padding: 'var(--space-2) 0' }}>
            각 가설을 시도해보고 완료/실패를 표시해주세요
          </p>
        )}

        <button
          type="button"
          onClick={onHwEscalate}
          style={{
            padding: 'var(--space-3) var(--space-4)',
            background: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            fontSize: '13px',
            whiteSpace: 'nowrap',
          }}
        >
          하드웨어 점검 필요
        </button>
      </div>
    </section>
  );
}

// ── 가설 카드 ────────────────────────────────────────────────────────────────

interface HypothesisCardProps {
  hypothesis: Hypothesis;
  isActive: boolean;
  onTry: (id: string) => void;
  onResolve: (id: string) => void;
  onFail: (id: string) => void;
}

function HypothesisCard({ hypothesis: h, isActive, onTry, onResolve, onFail }: HypothesisCardProps) {
  const isDone = h.status === 'resolved' || h.status === 'failed';

  return (
    <div
      className="animate-fade-in-up"
      style={{
        background: 'var(--color-bg-card)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-4)',
        boxShadow: 'var(--shadow-card)',
        borderLeft: `4px solid ${priorityColor(h.priority)}`,
        opacity: isDone ? 0.65 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
            <span
              className="text-badge badge"
              style={{ background: priorityColor(h.priority), color: '#fff', borderColor: 'transparent' }}
            >
              {h.priority}
            </span>
            <span className="text-sm" style={{ color: 'var(--color-text-hint)' }}>
              {priorityLabel(h.priority)}
            </span>
          </div>
          <p className="text-sub" style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {h.title}
          </p>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)' }}>
            {h.description}
          </p>
          <DiagnosisConfidence confidence={h.confidence} compact />
        </div>

        {/* 상태 표시 */}
        {h.status === 'resolved' && (
          <span className="badge-success text-badge">완료</span>
        )}
        {h.status === 'failed' && (
          <span className="badge-error text-badge">실패</span>
        )}
        {h.status === 'trying' && (
          <span className="badge text-badge" style={{ background: 'var(--color-brand)', color: '#fff', borderColor: 'transparent' }}>
            시도 중
          </span>
        )}
      </div>

      {/* 액션 버튼 */}
      {!isDone && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
          {!isActive ? (
            <button
              type="button"
              onClick={() => onTry(h.id)}
              style={{
                padding: 'var(--space-2) var(--space-3)',
                background: 'var(--color-brand)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              시도 중
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onResolve(h.id)}
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  background: 'var(--color-success)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                ✓ 해결됨
              </button>
              <button
                type="button"
                onClick={() => onFail(h.id)}
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  background: 'transparent',
                  border: '1px solid var(--color-error)',
                  color: 'var(--color-error)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                ✗ 실패
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── 재현 모드 뷰 ─────────────────────────────────────────────────────────────

interface ReproductionViewProps {
  phase: ReturnType<typeof useReproductionMonitor>['phase'];
  baselineWarning: boolean;
  reproResult: ReturnType<typeof useReproductionMonitor>['result'];
  hasSysInfo: boolean;
  apiError: string | null;
  onCollectBaseline: () => void;
  onCollectDelta: () => void;
  onComplete: () => void;
  onBack: () => void;
}

function ReproductionView({
  phase,
  baselineWarning,
  reproResult,
  hasSysInfo,
  apiError,
  onCollectBaseline,
  onCollectDelta,
  onComplete,
  onBack,
}: ReproductionViewProps) {
  return (
    <section
      className="animate-fade-in-up"
      style={{
        background: 'var(--color-bg-card)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-6)',
        boxShadow: 'var(--shadow-card)',
        marginTop: 'var(--space-4)',
      }}
    >
      {/* 브레드크럼 */}
      <p className="text-label" style={{ color: 'var(--color-text-hint)', marginBottom: 'var(--space-2)' }}>
        SYSTEM STATUS / 재현 모드
      </p>

      <p className="text-sub" style={{ fontWeight: 700, marginBottom: 'var(--space-4)' }}>
        증상을 직접 재현해보세요
      </p>

      <p className="text-sm" style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-5)' }}>
        베이스라인을 먼저 수집하고, 문제 증상을 재현한 뒤 다시 수집하면 delta를 비교해드려요.
      </p>

      {/* 단계 1: 베이스라인 */}
      <StepItem
        number={1}
        title="베이스라인 수집"
        done={phase !== 'idle' && phase !== 'collecting-baseline'}
        active={phase === 'idle'}
      >
        <button
          type="button"
          disabled={!hasSysInfo || phase !== 'idle'}
          onClick={onCollectBaseline}
          style={stepBtnStyle(phase === 'idle' && hasSysInfo)}
        >
          지금 베이스라인 수집
        </button>

        {baselineWarning && (
          <div
            style={{
              marginTop: 'var(--space-2)',
              padding: 'var(--space-2) var(--space-3)',
              background: 'rgba(158, 63, 78, 0.08)',
              border: '1px solid var(--color-error-dark)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <p className="text-sm" style={{ color: 'var(--color-error-dark)' }}>
              ⚠️ 베이스라인이 이미 비정상 상태예요 (CPU 90%+ 또는 메모리 95%+). 계속 진행할 수 있지만 delta 비교의 정확도가 낮아질 수 있어요.
            </p>
          </div>
        )}
      </StepItem>

      {/* 단계 2: 증상 재현 */}
      <StepItem
        number={2}
        title="증상 재현"
        done={phase === 'collecting-delta' || phase === 'done'}
        active={phase === 'waiting-reproduction'}
      >
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
          베이스라인 수집 완료! 이제 PC에서 문제 증상을 재현해보세요.
          (게임 실행, 작업 시작, 특정 앱 열기 등)
        </p>
        <button
          type="button"
          disabled={phase !== 'waiting-reproduction'}
          onClick={onCollectDelta}
          style={stepBtnStyle(phase === 'waiting-reproduction')}
        >
          재현 후 delta 수집
        </button>
      </StepItem>

      {/* 단계 3: 결과 확인 */}
      <StepItem
        number={3}
        title="결과 분석"
        done={false}
        active={phase === 'done' || !!reproResult}
      >
        {reproResult && (
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <p className="text-sm" style={{
              color: reproResult.success ? 'var(--color-success)' : 'var(--color-text-secondary)',
            }}>
              {reproResult.success
                ? `✓ 재현 성공 — CPU ${reproResult.delta.cpuDeltaPct?.toFixed(1) ?? 0}%p, 메모리 ${reproResult.delta.memoryDeltaMB?.toFixed(0) ?? 0}MB 변화`
                : `△ 재현 실패 — delta가 임계값 미만이에요 (CPU <5%p, 메모리 <200MB)`}
            </p>
          </div>
        )}
        <button
          type="button"
          disabled={!reproResult}
          onClick={onComplete}
          style={stepBtnStyle(!!reproResult)}
        >
          {reproResult?.success ? 'AI 분석 요청' : '패턴 분석 요청'}
        </button>
      </StepItem>

      {apiError && (
        <p className="text-sm" style={{ color: 'var(--color-error)', marginTop: 'var(--space-3)' }}>
          오류: {apiError}
        </p>
      )}

      <button
        type="button"
        onClick={onBack}
        style={{
          marginTop: 'var(--space-4)',
          background: 'transparent',
          border: 'none',
          color: 'var(--color-text-hint)',
          cursor: 'pointer',
          fontSize: '13px',
          padding: 0,
        }}
      >
        ← 가설 목록으로 돌아가기
      </button>
    </section>
  );
}

function stepBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: 'var(--space-2) var(--space-4)',
    background: active ? 'var(--color-brand)' : 'var(--color-bg-card-sub)',
    color: active ? '#fff' : 'var(--color-text-hint)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: active ? 'pointer' : 'not-allowed',
    fontSize: '13px',
    fontWeight: active ? 600 : 400,
    transition: 'background 0.15s',
  };
}

interface StepItemProps {
  number: number;
  title: string;
  done: boolean;
  active: boolean;
  children: React.ReactNode;
}

function StepItem({ number, title, done, children }: StepItemProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-4)',
        marginBottom: 'var(--space-5)',
      }}
    >
      <div
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          background: done ? 'var(--color-success)' : 'var(--color-brand-light)',
          color: done ? '#fff' : 'var(--color-brand)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: '13px',
          flexShrink: 0,
          marginTop: '2px',
        }}
      >
        {done ? '✓' : number}
      </div>
      <div style={{ flex: 1 }}>
        <p className="text-sm" style={{ fontWeight: 600, marginBottom: 'var(--space-2)', color: 'var(--color-text-primary)' }}>
          {title}
        </p>
        {children}
      </div>
    </div>
  );
}

// ── SW 확정 결과 뷰 ──────────────────────────────────────────────────────────

interface SwResultViewProps {
  result: SoftwareDiagnosisResponse;
  onContinue: () => void;
  onHwEscalate: () => void;
  onReset: () => void;
}

function SwResultView({ result, onContinue, onHwEscalate, onReset }: SwResultViewProps) {
  return (
    <section
      className="animate-fade-in-up"
      style={{
        background: 'var(--color-bg-card)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-6)',
        boxShadow: 'var(--shadow-card)',
        marginTop: 'var(--space-4)',
      }}
    >
      <p className="text-label" style={{ marginBottom: 'var(--space-3)' }}>진단 결과</p>

      <p className="text-sub" style={{ fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 'var(--space-2)' }}>
        {result.confirmedHypothesis}
      </p>

      <p className="text-base" style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
        {result.cause}
      </p>

      {result.isComplex && (
        <div
          style={{
            background: 'var(--color-brand-light)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3)',
            marginBottom: 'var(--space-4)',
          }}
        >
          <p className="text-sm" style={{ color: 'var(--color-brand)', fontWeight: 600 }}>
            💡 SW + HW 복합 원인 가능성 있음
          </p>
        </div>
      )}

      <div
        style={{
          background: 'var(--color-bg-card-sub)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-4)',
          marginBottom: 'var(--space-4)',
        }}
      >
        <p className="text-label" style={{ marginBottom: 'var(--space-2)' }}>해결 방법</p>
        <p className="text-sm" style={{ color: 'var(--color-text-primary)', whiteSpace: 'pre-line', lineHeight: 1.7 }}>
          {result.solution}
        </p>
      </div>

      <DiagnosisConfidence
        confidence={result.confidence}
        requiresRepairShop={result.requiresRepairShop}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-5)' }}>
        {/* 이게 전부가 아닐 수 있어요 — 상시 노출 (checklist 10-0-3) */}
        <button
          type="button"
          onClick={onContinue}
          style={{
            padding: 'var(--space-3)',
            background: 'transparent',
            border: '1px solid var(--color-brand)',
            color: 'var(--color-brand)',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          이게 전부가 아닐 수 있어요 →
        </button>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button
            type="button"
            onClick={onHwEscalate}
            style={{
              flex: 1,
              padding: 'var(--space-3)',
              background: 'transparent',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            하드웨어 점검 필요
          </button>
          <button
            type="button"
            onClick={onReset}
            style={{
              flex: 1,
              padding: 'var(--space-3)',
              background: 'transparent',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            처음으로
          </button>
        </div>
      </div>
    </section>
  );
}

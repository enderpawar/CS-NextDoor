// PatternSelector — 이벤트 로그 기반 유사 패턴 제안
// 재현 실패 시 표시. 패턴 없으면 "간헐적 증상이라 지금 당장 파악이 어려워요" 안내

import type { PatternSuggestion } from '../../types';

interface Props {
  patterns: PatternSuggestion[];
  summary: string;
  onSelect: (pattern: PatternSuggestion) => void;
  onRetryDiagnosis: () => void;
}

export default function PatternSelector({ patterns, summary, onSelect, onRetryDiagnosis }: Props) {
  const hasPatterns = patterns.length > 0;

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
      <p className="text-label" style={{ marginBottom: 'var(--space-3)' }}>재현 실패 — 패턴 분석</p>

      {hasPatterns ? (
        <>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
            증상을 직접 재현하기 어렵지만, 이벤트 로그에서 비슷한 패턴을 찾았어요. 해당하는 패턴을 선택해주세요.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {patterns.map((pattern) => (
              <button
                key={pattern.id}
                type="button"
                onClick={() => onSelect(pattern)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'var(--color-bg-card-sub)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-4)',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-brand)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span className="text-sub" style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    {pattern.title}
                  </span>
                  <span
                    className="text-sm"
                    style={{
                      color: pattern.relevanceScore >= 0.7 ? 'var(--color-brand)' : 'var(--color-text-secondary)',
                      flexShrink: 0,
                      marginLeft: 'var(--space-3)',
                    }}
                  >
                    연관도 {Math.round(pattern.relevanceScore * 100)}%
                  </span>
                </div>
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)' }}>
                  {pattern.description}
                </p>
                <p
                  className="text-sm"
                  style={{
                    color: 'var(--color-text-hint)',
                    marginTop: 'var(--space-2)',
                    fontSize: '11px',
                  }}
                >
                  근거: {pattern.matchReason}
                </p>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
          <p className="text-base" style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
            🤔 {summary}
          </p>
          <p className="text-sm" style={{ color: 'var(--color-text-hint)' }}>
            증상이 간헐적으로 발생해서 현재 데이터로는 원인을 특정하기 어려워요.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={onRetryDiagnosis}
        style={{
          marginTop: 'var(--space-5)',
          width: '100%',
          padding: 'var(--space-3)',
          background: 'transparent',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--color-text-secondary)',
          cursor: 'pointer',
          fontSize: '13px',
        }}
      >
        증상 다시 입력하고 재진단
      </button>
    </section>
  );
}

// DiagnosisConfidence — 신뢰도 바 + 수리기사 권장 배너
// confidence < 0.6 → 빨강 + "수리기사 상담 권장" 배너 자동 표시

interface Props {
  confidence: number;           // 0.0 ~ 1.0
  requiresRepairShop?: boolean; // true면 강제 배너 표시
  compact?: boolean;            // 가설 카드 내 소형 표시용
}

export default function DiagnosisConfidence({ confidence, requiresRepairShop, compact }: Props) {
  const pct = Math.round(confidence * 100);
  const isLow = confidence < 0.6;
  const showRepairBanner = isLow || requiresRepairShop;

  const barColor = isLow
    ? 'var(--color-error)'
    : confidence >= 0.8
      ? 'var(--color-success)'
      : 'var(--color-brand)';

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
        <div
          style={{
            flex: 1,
            height: '4px',
            background: 'var(--color-brand-track)',
            borderRadius: 'var(--radius-sm)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: barColor,
              transition: 'width 0.4s ease',
            }}
          />
        </div>
        <span
          className="text-sm"
          style={{ color: isLow ? 'var(--color-error)' : 'var(--color-text-secondary)', minWidth: '32px' }}
        >
          {pct}%
        </span>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
        <span className="text-label">확신도</span>
        <span
          className="text-base"
          style={{ fontWeight: 600, color: isLow ? 'var(--color-error)' : 'var(--color-text-primary)' }}
        >
          약 {pct}%
        </span>
      </div>

      <div
        style={{
          height: '8px',
          background: 'var(--color-brand-track)',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: barColor,
            boxShadow: isLow ? 'none' : 'var(--glow-divider)',
            transition: 'width 0.6s ease',
          }}
        />
      </div>

      {showRepairBanner && (
        <div
          className="animate-fade-in-up"
          style={{
            marginTop: 'var(--space-3)',
            padding: 'var(--space-3) var(--space-4)',
            background: 'rgba(158, 63, 78, 0.08)',
            border: '1px solid var(--color-error-dark)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-error-dark)',
          }}
        >
          <span className="text-sm" style={{ fontWeight: 600 }}>
            🔧 수리기사 상담을 권장해요
          </span>
          <p className="text-sm" style={{ marginTop: 'var(--space-1)', color: 'var(--color-error-dark)', opacity: 0.9 }}>
            {isLow
              ? '확신도가 낮아서 정확한 원인 파악이 어려워요. 전문가에게 확인받아 보세요.'
              : '하드웨어 직접 수리가 필요한 문제예요. 납땜이나 전문 장비가 필요할 수 있어요.'}
          </p>
        </div>
      )}
    </div>
  );
}

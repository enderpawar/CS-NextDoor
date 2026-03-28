// DiskHealthCard — 디스크 I/O 속도 + 상태 판단 카드
// Phase 3 수집 데이터(DiskInfo) 기반 — read/write MB/s 표시
// CLAUDE.md 프로젝트 구조에 명시된 누락 컴포넌트

import type { DiskInfo } from '../../types/electron';

function toMBs(bytesPerSec: number): number {
  return bytesPerSec / (1024 * 1024);
}

function SpeedBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min((value / max) * 100, 100);
  const isHigh = pct >= 80;
  return (
    <div style={{ height: '3px', background: 'var(--color-brand-track)',
      borderRadius: 'var(--radius-full)', overflow: 'hidden', marginTop: 'var(--space-1)' }}>
      <div style={{
        width: `${pct}%`, height: '100%',
        background: isHigh ? 'var(--color-warning)' : 'var(--color-brand)',
        boxShadow: isHigh ? 'none' : 'var(--glow-divider)',
        transition: 'width 0.4s ease',
      }} />
    </div>
  );
}

interface Props {
  disk: DiskInfo;
}

export default function DiskHealthCard({ disk }: Props) {
  const readMBs  = toMBs(disk.read);
  const writeMBs = toMBs(disk.write);

  // 상태 판단: 읽기 500 MB/s 이상 또는 쓰기 200 MB/s 이상 → "빠름"
  const isFast   = readMBs >= 500 || writeMBs >= 200;
  const isActive = readMBs > 1 || writeMBs > 1;

  const statusLabel  = isFast ? '빠름' : isActive ? '정상' : '대기';
  const statusColor  = isFast ? 'var(--color-brand)' : isActive ? 'var(--color-success)' : 'var(--color-text-hint)';

  // 읽기 기준 max: HDD 200 MB/s, SSD 500 MB/s — 500 사용
  const READ_MAX  = 500;
  const WRITE_MAX = 200;

  return (
    <div style={{
      background: 'var(--color-bg-card)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-4)',
      boxShadow: 'var(--shadow-card)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: 'var(--space-3)' }}>
        <p className="text-label">디스크 상태</p>
        <span className="text-badge" style={{
          fontSize: '10px', fontWeight: 700, color: statusColor,
          letterSpacing: '0.05em',
        }}>
          {statusLabel}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {/* 읽기 */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'baseline' }}>
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>읽기</span>
            <span style={{ fontSize: 16, fontWeight: 700,
              color: 'var(--color-text-primary)', letterSpacing: '-0.3px' }}>
              {readMBs.toFixed(1)}
              <span className="text-sm" style={{ fontWeight: 400,
                color: 'var(--color-text-hint)', marginLeft: 2 }}>MB/s</span>
            </span>
          </div>
          <SpeedBar value={readMBs} max={READ_MAX} />
        </div>

        {/* 쓰기 */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'baseline' }}>
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>쓰기</span>
            <span style={{ fontSize: 16, fontWeight: 700,
              color: 'var(--color-text-primary)', letterSpacing: '-0.3px' }}>
              {writeMBs.toFixed(1)}
              <span className="text-sm" style={{ fontWeight: 400,
                color: 'var(--color-text-hint)', marginLeft: 2 }}>MB/s</span>
            </span>
          </div>
          <SpeedBar value={writeMBs} max={WRITE_MAX} />
        </div>
      </div>
    </div>
  );
}

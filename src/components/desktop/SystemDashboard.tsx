import { useSystemInfo } from '../../hooks/useSystemInfo';
import type { SystemSnapshot } from '../../types/electron';

function toGB(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(1);
}

function TemperatureValue({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span style={{ color: 'var(--color-text-hint)' }}>측정 불가</span>
    );
  }
  const isHot = value >= 80;
  return (
    <span style={{ color: isHot ? 'var(--color-error)' : 'var(--color-text-primary)' }}>
      {value}°C{isHot && ' ⚠️'}
    </span>
  );
}

function UsageBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  const isHigh = pct >= 90;
  return (
    <div
      style={{
        height: '6px',
        background: 'var(--color-brand-track)',
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
        marginTop: 'var(--space-1)',
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          background: isHigh ? 'var(--color-error)' : 'var(--color-brand)',
          boxShadow: isHigh ? 'none' : 'var(--glow-divider)',
          transition: 'width 0.4s ease',
        }}
      />
    </div>
  );
}

function StatCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: 'var(--color-bg-card)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-4)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <p className="text-label" style={{ marginBottom: 'var(--space-2)' }}>
        {label}
      </p>
      {children}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      className="skeleton"
      style={{ height: '88px', borderRadius: 'var(--radius-lg)' }}
    />
  );
}

interface Props {
  sysInfo: SystemSnapshot;
}

function Dashboard({ sysInfo }: Props) {
  const memUsedGB = toGB(sysInfo.memory.used);
  const memTotalGB = toGB(sysInfo.memory.total);
  const memPct = (sysInfo.memory.used / sysInfo.memory.total) * 100;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 'var(--space-4)',
      }}
    >
      {/* CPU */}
      <StatCard label="CPU">
        <p className="text-stat" style={{ lineHeight: 1 }}>
          {sysInfo.cpu.usage}
          <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            %
          </span>
        </p>
        <UsageBar value={sysInfo.cpu.usage} />
        <p className="text-sm" style={{ marginTop: 'var(--space-2)', color: 'var(--color-text-secondary)' }}>
          온도: <TemperatureValue value={sysInfo.cpu.temperature} />
        </p>
      </StatCard>

      {/* 메모리 */}
      <StatCard label="메모리">
        <p className="text-stat" style={{ lineHeight: 1 }}>
          {memUsedGB}
          <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            / {memTotalGB} GB
          </span>
        </p>
        <UsageBar value={memPct} />
      </StatCard>

      {/* GPU */}
      <StatCard label="GPU">
        {sysInfo.gpu ? (
          <>
            <p
              className="text-base"
              style={{
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {sysInfo.gpu.model}
            </p>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)' }}>
              VRAM {sysInfo.gpu.vram} MB
            </p>
            <p className="text-sm" style={{ color: 'var(--color-text-hint)', marginTop: 'var(--space-1)' }}>
              사용률·온도 수집 불가
            </p>
          </>
        ) : (
          <p className="text-sm" style={{ color: 'var(--color-text-hint)' }}>
            GPU 정보 없음
          </p>
        )}
      </StatCard>

      {/* 디스크 I/O */}
      {sysInfo.disk && (
        <StatCard label="디스크 I/O">
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            읽기: {sysInfo.disk.read.toFixed(0)} B/s
          </p>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)' }}>
            쓰기: {sysInfo.disk.write.toFixed(0)} B/s
          </p>
        </StatCard>
      )}
    </div>
  );
}

export default function SystemDashboard() {
  const sysInfo = useSystemInfo();

  return (
    <section style={{ marginTop: 'var(--space-6)' }}>
      <p className="text-label" style={{ marginBottom: 'var(--space-3)' }}>
        시스템 현황
        <span
          style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: 'var(--color-brand)',
            boxShadow: 'var(--glow-brand)',
            marginLeft: 'var(--space-2)',
            verticalAlign: 'middle',
          }}
          className="animate-glow-pulse"
        />
      </p>

      {sysInfo ? (
        <Dashboard sysInfo={sysInfo} />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}
    </section>
  );
}

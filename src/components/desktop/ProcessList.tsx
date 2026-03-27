import { useState, useEffect, useCallback } from 'react';
import type { ProcessData, ProcessSummary } from '../../types/electron';

type SortMode = 'cpu' | 'mem';

interface TableProps {
  processes: ProcessSummary[];
}

function ProcessTable({ processes }: TableProps) {
  return (
    <div
      style={{
        overflowX: 'auto',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-divider)',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--color-bg-card-sub)' }}>
            <th
              className="text-label"
              style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'left', fontWeight: 600 }}
            >
              프로세스
            </th>
            <th
              className="text-label"
              style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'right', fontWeight: 600 }}
            >
              CPU %
            </th>
            <th
              className="text-label"
              style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'right', fontWeight: 600 }}
            >
              메모리 MB
            </th>
          </tr>
        </thead>
        <tbody>
          {processes.map((p, idx) => (
            <tr
              key={`${p.pid}-${idx}`}
              style={{
                borderTop: '1px solid var(--color-divider)',
                background: idx % 2 === 0 ? 'var(--color-bg-card)' : 'transparent',
              }}
            >
              <td
                className="text-sm"
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  color: 'var(--color-text-primary)',
                  maxWidth: '180px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={`PID: ${p.pid}`}
              >
                {p.name}
              </td>
              <td
                className="text-sm"
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  textAlign: 'right',
                  color: Number(p.cpu) >= 50 ? 'var(--color-error)' : 'var(--color-text-secondary)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {p.cpu}
              </td>
              <td
                className="text-sm"
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  textAlign: 'right',
                  color: 'var(--color-text-secondary)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {p.mem}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ProcessList() {
  const [data, setData] = useState<ProcessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('cpu');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI?.getTopProcesses();
      setData(result ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const processes = data ? (sortMode === 'cpu' ? data.byCpu : data.byMem) : [];

  return (
    <section style={{ marginTop: 'var(--space-6)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-3)',
        }}
      >
        <p className="text-label" style={{ margin: 0 }}>
          상위 프로세스
          {data && (
            <span style={{ color: 'var(--color-text-hint)', marginLeft: 'var(--space-2)' }}>
              (전체 {data.total}개)
            </span>
          )}
        </p>

        {/* 정렬 토글 */}
        <div style={{ display: 'flex', gap: 'var(--space-1)', marginLeft: 'auto' }}>
          <button
            type="button"
            className={sortMode === 'cpu' ? 'badge' : 'badge-warning'}
            style={{ cursor: 'pointer', border: 'none' }}
            onClick={() => setSortMode('cpu')}
          >
            CPU
          </button>
          <button
            type="button"
            className={sortMode === 'mem' ? 'badge' : 'badge-warning'}
            style={{ cursor: 'pointer', border: 'none' }}
            onClick={() => setSortMode('mem')}
          >
            메모리
          </button>
          <button
            type="button"
            className="text-sm"
            style={{
              cursor: 'pointer',
              border: 'none',
              background: 'none',
              color: 'var(--color-text-hint)',
              padding: 'var(--space-1)',
            }}
            onClick={load}
            disabled={loading}
            title="새로고침"
          >
            ↺
          </button>
        </div>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: '200px', borderRadius: 'var(--radius-lg)' }} />
      ) : data && processes.length > 0 ? (
        <ProcessTable processes={processes} />
      ) : (
        <p className="text-sm" style={{ color: 'var(--color-text-hint)' }}>
          프로세스 정보를 가져올 수 없어요.
        </p>
      )}
    </section>
  );
}

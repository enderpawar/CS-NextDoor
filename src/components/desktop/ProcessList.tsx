import { useState, useEffect, useCallback } from 'react';
import type { ProcessData, ProcessSummary } from '../../types/electron';

type SortMode = 'cpu' | 'mem';

interface TableProps {
  processes: ProcessSummary[];
}

function ProcessTable({ processes }: TableProps) {
  return (
    <div className="nd-data-table-wrap">
      <table className="nd-data-table">
        <thead>
          <tr>
            <th>프로세스</th>
            <th className="numeric">CPU %</th>
            <th className="numeric">메모리 MB</th>
          </tr>
        </thead>
        <tbody>
          {processes.map((p, idx) => (
            <tr key={`${p.pid}-${idx}`}>
              <td title={`PID: ${p.pid}`}>
                <div className="nd-table-process-cell">
                  <span className="nd-table-process-name">{p.name}</span>
                  <span className="nd-table-process-meta">PID {p.pid}</span>
                </div>
              </td>
              <td className={`numeric ${Number(p.cpu) >= 50 ? 'is-hot' : ''}`}>
                {p.cpu}
              </td>
              <td className="numeric">
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
  const topCpu = data?.byCpu[0];

  return (
    <section className="nd-detail-shell">
      <div className="nd-detail-hero">
        <div>
          <p className="nd-panel-label">Top processes</p>
          <h2 className="nd-detail-title">실시간 프로세스 점유 현황</h2>
          <p className="nd-detail-copy">
            {topCpu
              ? `${topCpu.name} 프로세스가 현재 CPU ${topCpu.cpu}%를 사용 중입니다.`
              : '시스템 프로세스 데이터를 수집하고 있습니다.'}
          </p>
        </div>
        <div className="nd-detail-actions">
          <button
            type="button"
            className={`nd-toggle-button${sortMode === 'cpu' ? ' active' : ''}`}
            onClick={() => setSortMode('cpu')}
          >
            CPU
          </button>
          <button
            type="button"
            className={`nd-toggle-button${sortMode === 'mem' ? ' active' : ''}`}
            onClick={() => setSortMode('mem')}
          >
            메모리
          </button>
          <button
            type="button"
            className="nd-secondary-button"
            onClick={load}
            disabled={loading}
          >
            새로고침
          </button>
      </div>
      </div>

      <div className="nd-stat-row">
        <div className="nd-stat-card">
          <span className="nd-stat-label">전체 프로세스</span>
          <strong className="nd-stat-value">{data?.total ?? '--'}</strong>
        </div>
        <div className="nd-stat-card">
          <span className="nd-stat-label">정렬 기준</span>
          <strong className="nd-stat-value">{sortMode === 'cpu' ? 'CPU' : '메모리'}</strong>
        </div>
        <div className="nd-stat-card">
          <span className="nd-stat-label">최상위 점유</span>
          <strong className="nd-stat-value">{topCpu?.name ?? '대기 중'}</strong>
        </div>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: '240px', borderRadius: 'var(--radius-lg)' }} />
      ) : data && processes.length > 0 ? (
        <ProcessTable processes={processes} />
      ) : (
        <p className="nd-empty-note">
          프로세스 정보를 가져올 수 없어요.
        </p>
      )}
    </section>
  );
}

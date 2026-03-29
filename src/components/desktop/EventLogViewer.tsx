import { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import type { EventLog } from '../../types/electron';

function getLevelColor(level: string): string {
  if (level === 'Critical' || level === 'Error') return 'var(--color-error)';
  if (level === 'Warning') return 'var(--color-warning)';
  return 'var(--color-text-secondary)';
}

function formatTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

interface EventCardProps {
  event: EventLog;
}

function EventCard({ event }: EventCardProps) {
  const [expanded, setExpanded] = useState(false);
  const color = getLevelColor(event.levelDisplayName);

  return (
    <article className="nd-event-card" onClick={() => event.message && setExpanded(v => !v)} style={{ '--event-tone': color } as CSSProperties}>
      <div className="nd-event-head">
        <div className="nd-event-meta">
          <span className="nd-event-level">
            {event.levelDisplayName.toUpperCase()}
          </span>
          <span className="nd-event-subtext">
            ID {event.id}
          </span>
          {event.providerName && (
            <span className="nd-event-subtext">
              · {event.providerName}
            </span>
          )}
        </div>
        <span className="nd-event-time">
          {formatTime(event.timeCreated)}
        </span>
      </div>

      {event.message && (
        <p
          className="nd-event-message"
          style={{
            overflow: expanded ? 'visible' : 'hidden',
            display: expanded ? 'block' : '-webkit-box',
            WebkitLineClamp: expanded ? undefined : 2,
            WebkitBoxOrient: 'vertical' as const,
          }}
        >
          {event.message}
        </p>
      )}
    </article>
  );
}

export default function EventLogViewer() {
  const [events, setEvents] = useState<EventLog[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI?.getEventLogs();
      setEvents(result ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const errorCount = events?.filter(event => event.levelDisplayName === 'Critical' || event.levelDisplayName === 'Error').length ?? 0;
  const warningCount = events?.filter(event => event.levelDisplayName === 'Warning').length ?? 0;

  return (
    <section className="nd-detail-shell">
      <div className="nd-detail-hero">
        <div>
          <p className="nd-panel-label">Event log stream</p>
          <h2 className="nd-detail-title">시스템 에러와 경고를 시간순으로 추적합니다.</h2>
          <p className="nd-detail-copy">
            최근에 발생한 크래시, 드라이버 경고, 서비스 오류를 읽기 쉬운 카드 형태로 정리했습니다.
          </p>
        </div>
        <div className="nd-detail-actions">
          <button type="button" className="nd-secondary-button" onClick={load} disabled={loading}>
            새로고침
          </button>
        </div>
      </div>

      <div className="nd-stat-row">
        <div className="nd-stat-card">
          <span className="nd-stat-label">전체 항목</span>
          <strong className="nd-stat-value">{events?.length ?? '--'}</strong>
        </div>
        <div className="nd-stat-card">
          <span className="nd-stat-label">오류 / Critical</span>
          <strong className="nd-stat-value">{errorCount}</strong>
        </div>
        <div className="nd-stat-card">
          <span className="nd-stat-label">경고</span>
          <strong className="nd-stat-value">{warningCount}</strong>
        </div>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: '220px', borderRadius: 'var(--radius-lg)' }} />
      ) : !events || events.length === 0 ? (
        <p className="nd-empty-note">
          최근 에러·경고 이벤트가 없어요.
        </p>
      ) : (
        <div className="nd-event-list">
          {events.map((evt, idx) => (
            <EventCard key={`${evt.id}-${idx}`} event={evt} />
          ))}
        </div>
      )}

      {!loading && events && events.length > 0 && (
        <p className="nd-empty-note">
          항목 클릭 시 전체 메시지 펼쳐보기
        </p>
      )}
    </section>
  );
}

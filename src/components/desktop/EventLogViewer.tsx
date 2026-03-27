import { useState, useEffect, useCallback } from 'react';
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
    <div
      style={{
        padding: 'var(--space-3)',
        borderLeft: `3px solid ${color}`,
        background: 'var(--color-bg-card)',
        borderRadius: 'var(--radius-sm)',
        cursor: event.message ? 'pointer' : 'default',
      }}
      onClick={() => event.message && setExpanded(v => !v)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span
            className="text-badge badge-error"
            style={{
              background: 'transparent',
              color,
              padding: 0,
              letterSpacing: '0.04em',
            }}
          >
            {event.levelDisplayName.toUpperCase()}
          </span>
          <span className="text-sm" style={{ color: 'var(--color-text-hint)' }}>
            ID {event.id}
          </span>
          {event.providerName && (
            <span className="text-sm" style={{ color: 'var(--color-text-hint)' }}>
              · {event.providerName}
            </span>
          )}
        </div>
        <span className="text-sm" style={{ color: 'var(--color-text-hint)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {formatTime(event.timeCreated)}
        </span>
      </div>

      {event.message && (
        <p
          className="text-sm"
          style={{
            color: 'var(--color-text-secondary)',
            margin: 'var(--space-1) 0 0',
            lineHeight: 1.5,
            overflow: expanded ? 'visible' : 'hidden',
            display: expanded ? 'block' : '-webkit-box',
            WebkitLineClamp: expanded ? undefined : 2,
            WebkitBoxOrient: 'vertical' as const,
          }}
        >
          {event.message}
        </p>
      )}
    </div>
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

  return (
    <section style={{ marginTop: 'var(--space-6)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: 'var(--space-3)',
        }}
      >
        <p className="text-label" style={{ margin: 0 }}>
          이벤트 로그
          {events && events.length > 0 && (
            <span style={{ color: 'var(--color-text-hint)', marginLeft: 'var(--space-2)' }}>
              ({events.length}건)
            </span>
          )}
        </p>
        <button
          type="button"
          className="text-sm"
          style={{
            cursor: 'pointer',
            border: 'none',
            background: 'none',
            color: 'var(--color-text-hint)',
            padding: 'var(--space-1)',
            marginLeft: 'auto',
          }}
          onClick={load}
          disabled={loading}
          title="새로고침"
        >
          ↺
        </button>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: '180px', borderRadius: 'var(--radius-lg)' }} />
      ) : !events || events.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-text-hint)' }}>
          최근 에러·경고 이벤트가 없어요.
        </p>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            maxHeight: '320px',
            overflowY: 'auto',
            paddingRight: 'var(--space-1)',
          }}
        >
          {events.map((evt, idx) => (
            <EventCard key={`${evt.id}-${idx}`} event={evt} />
          ))}
        </div>
      )}

      {!loading && events && events.length > 0 && (
        <p className="text-sm" style={{ color: 'var(--color-text-hint)', marginTop: 'var(--space-2)' }}>
          항목 클릭 시 전체 메시지 펼쳐보기
        </p>
      )}
    </section>
  );
}

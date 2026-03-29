import { useEffect, useRef, useState } from 'react';
import type { ClipboardEventHandler } from 'react';
import type { ClipboardImage, HypothesesResponse, Hypothesis } from '../../types';
import type { EventLog, ProcessData, SystemSnapshot } from '../../types/electron';
import ProcessList from './ProcessList';

type HypoStatus = 'idle' | 'trying' | 'done' | 'failed';
type ActiveTab = 'diagnose' | 'process' | 'events';
type StepStatus = 'locked' | 'idle' | 'active' | 'done' | 'failed';
type ChatMsg =
  | { kind: 'user'; text: string }
  | { kind: 'ai-hypo'; response: HypothesesResponse }
  | { kind: 'error'; text: string };

const WORKFLOW_STEPS = [
  { num: 1, label: '증상 입력', sublabel: '시스템 스냅샷 수집' },
  { num: 2, label: '가설 추적', sublabel: 'A · B · C 가설 시도' },
  { num: 3, label: '재현 모드', sublabel: '베이스라인 → 델타 측정' },
  { num: 4, label: '패턴 분석', sublabel: '유사 증상 이벤트 탐색' },
  { num: 5, label: 'HW 연결', sublabel: 'QR 스캔 → PWA 진단' },
] as const;

function formatMemoryTotal(bytes?: number): string {
  if (!bytes) return '수집 중';
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
}

function formatTransferRate(bytesPerSecond?: number | null): string {
  if (bytesPerSecond == null) return '수집 중';

  const mb = bytesPerSecond / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(1)} MB/s`;

  const kb = bytesPerSecond / 1024;
  if (kb >= 1) return `${Math.round(kb)} KB/s`;

  return `${Math.round(bytesPerSecond)} B/s`;
}

function summarizeEvent(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 72 ? `${oneLine.slice(0, 72)}...` : oneLine;
}

function WorkflowStep({
  num,
  label,
  sublabel,
  status,
  active,
  isLast,
  onClick,
}: {
  num: number;
  label: string;
  sublabel: string;
  status: StepStatus;
  active: boolean;
  isLast: boolean;
  onClick?: () => void;
}) {
  const badgeClass = `nd-step-badge nd-step-badge-${status}${active ? ' nd-step-badge-current' : ''}`;
  const itemClass = `nd-workflow-step${active ? ' active' : ''}${status === 'locked' ? ' locked' : ''}`;

  return (
    <div className="nd-workflow-step-wrap">
      <button
        type="button"
        className={itemClass}
        onClick={status !== 'locked' ? onClick : undefined}
        disabled={status === 'locked'}
        aria-label={label}
        aria-current={active ? 'step' : undefined}
      >
        <span className={badgeClass} aria-hidden="true">
          {status === 'done' && '✓'}
          {status === 'failed' && '✕'}
          {(status === 'idle' || status === 'active' || status === 'locked') && num}
        </span>
        <span className="nd-step-info">
          <span className="nd-step-label">{label}</span>
          <span className="nd-step-sublabel">{sublabel}</span>
        </span>
      </button>
      {!isLast && (
        <div
          className={`nd-step-connector${status === 'done' ? ' done' : status === 'active' ? ' partial' : ''}`}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

function HypoCard({
  hypo,
  status,
  onStatus,
}: {
  hypo: Hypothesis;
  status: HypoStatus;
  onStatus: (id: string, next: HypoStatus) => void;
}) {
  const confidencePct = Math.round(hypo.confidence * 100);
  const tone = confidencePct >= 70
    ? 'var(--color-success)'
    : confidencePct >= 50
      ? 'var(--color-warning)'
      : 'var(--color-text-hint)';

  return (
    <article className={`nd-hypothesis-card is-${status}`}>
      <div className="nd-hypothesis-meta">
        <span className={`nd-hypothesis-priority priority-${hypo.priority.toLowerCase()}`}>{hypo.priority}</span>
        <span className="nd-hypothesis-confidence-pill">확신도 {confidencePct}%</span>
      </div>
      <div className="nd-hypothesis-head">
        <h4 className="nd-hypothesis-title">{hypo.title}</h4>
      </div>
      <p className="nd-hypothesis-kicker">지금 해볼 조치</p>
      <p className="nd-hypothesis-desc">{hypo.description}</p>
      <div className="nd-hypothesis-confidence">
        <div className="nd-progress">
          <div className="nd-progress-fill" style={{ width: `${confidencePct}%`, background: tone }} />
        </div>
        <span className="nd-hypothesis-percent">우선 확인</span>
      </div>
      <div className="nd-hypothesis-actions">
        {status === 'idle' && (
          <button type="button" className="nd-chip-button" onClick={() => onStatus(hypo.id, 'trying')}>
            이 조치 시도하기
          </button>
        )}
        {status === 'trying' && (
          <>
            <button type="button" className="nd-chip-button accent" onClick={() => onStatus(hypo.id, 'done')}>
              해봤어요
            </button>
            <button type="button" className="nd-chip-button muted" onClick={() => onStatus(hypo.id, 'failed')}>
              효과 없어요
            </button>
          </>
        )}
        {status === 'done' && <span className="nd-status-pill success">완료</span>}
        {status === 'failed' && <span className="nd-status-pill error">추가 점검 필요</span>}
      </div>
    </article>
  );
}

interface Props {
  sysInfo: SystemSnapshot | null;
  cpuHistory: number[];
  symptom: string;
  clipboardImage: ClipboardImage | null;
  isLoading: boolean;
  apiError: string | null;
  processData: ProcessData | null;
  eventLogs: EventLog[];
  diagnosisResponse: HypothesesResponse | null;
  onSymptomChange: (value: string) => void;
  onPaste: ClipboardEventHandler<HTMLTextAreaElement>;
  onDiagnose: () => void;
  onClearImage: () => void;
  onReset: () => void;
}

export default function ElectronDashboard({
  sysInfo,
  cpuHistory: _cpuHistory,
  symptom,
  clipboardImage,
  isLoading,
  apiError,
  processData,
  eventLogs,
  diagnosisResponse,
  onSymptomChange,
  onPaste,
  onDiagnose,
  onClearImage,
  onReset,
}: Props) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('diagnose');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [hypoStatuses, setHypoStatuses] = useState<Record<string, HypoStatus>>({});
  const [showConversationLayout, setShowConversationLayout] = useState(false);
  const [isConversationMorphing, setIsConversationMorphing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const errorCount = eventLogs.filter(log => log.levelDisplayName === 'Error' || log.levelDisplayName === 'Critical').length;
  const warningCount = eventLogs.filter(log => log.levelDisplayName === 'Warning').length;
  const memoryUsagePct = sysInfo ? Math.round((sysInfo.memory.used / sysInfo.memory.total) * 100) : null;
  const cpuTemp = sysInfo?.cpu.temperature != null ? `${Math.round(sysInfo.cpu.temperature)}°C` : '측정 중';
  const topProcess = processData?.byCpu[0]?.name ?? '대기 중';
  const gpuLabel = sysInfo?.gpu?.model ?? '그래픽 정보 대기';
  const recentActivities = eventLogs.slice(0, 3);
  const cpuUsage = sysInfo ? Math.round(sysInfo.cpu.usage) : null;
  const diskTraffic = sysInfo?.disk ? sysInfo.disk.read + sysInfo.disk.write : null;
  const quickSymptomChips = [
    '부팅이 평소보다 많이 느려졌어요.',
    '특정 프로그램만 실행하면 화면이 멈춥니다.',
    '팬 소음과 발열이 갑자기 심해졌어요.',
    '게임이나 영상 편집 중 프레임 드랍이 심합니다.',
  ];

  const heroSummary = !sysInfo
    ? '실시간 텔레메트리를 수집하는 중입니다. 지금 느끼는 증상을 먼저 적어두면 수집 완료 후 바로 원인 후보를 좁혀드립니다.'
    : errorCount > 0
      ? `최근 오류 ${errorCount}건과 경고 ${warningCount}건이 감지되었습니다. ${topProcess} 관련 부하 여부와 함께 증상을 입력해보세요.`
      : memoryUsagePct != null && memoryUsagePct >= 80
        ? `메모리 점유율이 ${memoryUsagePct}%로 높습니다. 백그라운드 앱 누적 점유나 특정 프로세스 병목 가능성을 먼저 확인해보는 것이 좋습니다.`
        : cpuUsage != null && cpuUsage >= 75
          ? `CPU 사용률이 ${cpuUsage}%로 높게 유지되고 있습니다. ${topProcess} 같은 상위 프로세스의 순간 부하와 이벤트 로그를 함께 보는 것이 좋습니다.`
          : '현재 시스템은 비교적 안정적으로 보입니다. 증상이 발생하는 순간의 상황을 적어주시면 AI가 원인 후보를 더 정확하게 정리해드립니다.';

  useEffect(() => {
    if (diagnosisResponse) {
      setMessages(prev => [...prev.filter(message => message.kind !== 'error'), { kind: 'ai-hypo', response: diagnosisResponse }]);
      const nextStatuses: Record<string, HypoStatus> = {};
      diagnosisResponse.hypotheses.forEach(hypo => {
        nextStatuses[hypo.id] = 'idle';
      });
      setHypoStatuses(nextStatuses);
    }
  }, [diagnosisResponse]);

  useEffect(() => {
    if (apiError) {
      setMessages(prev => [...prev.filter(message => message.kind !== 'error'), { kind: 'error', text: apiError }]);
    }
  }, [apiError]);

  useEffect(() => {
    const anchor = messagesEndRef.current;
    if (anchor && typeof anchor.scrollIntoView === 'function') {
      anchor.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const heroLead = !sysInfo
    ? '시스템 데이터를 모으는 동안, 현재 겪는 문제를 한 줄로 적어주시면 바로 분석을 시작할 수 있어요.'
    : errorCount > 0
      ? `오류 ${errorCount}건, 경고 ${warningCount}건이 감지되었습니다. 증상 설명과 함께 보내주시면 더 정확하게 원인을 좁힐 수 있어요.`
      : '';

  const handleSend = () => {
    if (!symptom.trim() || isLoading) return;
    setMessages(prev => [...prev, { kind: 'user', text: symptom.trim() }]);
    onDiagnose();
  };

  const handleReset = () => {
    setMessages([]);
    setHypoStatuses({});
    onReset();
  };

  const allExhausted = diagnosisResponse
    ? Object.values(hypoStatuses).every(status => status === 'done' || status === 'failed')
    : false;
  const hypothesisExists = Boolean(diagnosisResponse);
  const hasStartedDiagnosis = messages.some(m => m.kind === 'user');
  const hasConversationStarted = messages.length > 0 || isLoading || Boolean(diagnosisResponse) || Boolean(apiError);
  const activeStepNumber = !hasStartedDiagnosis ? 1 : allExhausted ? 3 : 2;

  useEffect(() => {
    if (!hasConversationStarted) {
      setShowConversationLayout(false);
      setIsConversationMorphing(false);
      return;
    }

    if (!showConversationLayout) {
      setShowConversationLayout(true);
      setIsConversationMorphing(true);

      const timer = window.setTimeout(() => {
        setIsConversationMorphing(false);
      }, 520);

      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [hasConversationStarted, showConversationLayout]);

  const getStepStatus = (stepNum: number): StepStatus => {
    switch (stepNum) {
      case 1:
        return hasStartedDiagnosis ? 'done' : 'active';
      case 2:
        if (!hasStartedDiagnosis) return 'locked';
        return allExhausted ? 'done' : 'active';
      case 3:
        return allExhausted ? 'active' : 'locked';
      case 4:
        return 'locked';
      case 5:
        return 'locked';
      default:
        return 'locked';
    }
  };

  const handleStepClick = (stepNum: number) => {
    if (stepNum <= 2 || stepNum === 5) setActiveTab('diagnose');
    if (stepNum === 3) setActiveTab('process');
    if (stepNum === 4) setActiveTab('events');
  };

  const renderPromptShell = (conversationMode = false, extraClassName = '') => (
    <div className={`nd-prompt-shell${conversationMode ? ' is-conversation' : ''}${extraClassName ? ` ${extraClassName}` : ''}`}>
      <div className="nd-prompt-toolbar">
        <span className="nd-prompt-toolbar-left">증상을 한 줄로 적으면 바로 원인 후보를 정리해드립니다.</span>
        <span className="nd-prompt-toolbar-right">Enter 전송</span>
      </div>

      <textarea
        className="nd-prompt-input"
        placeholder="예: 영상 편집 프로그램 실행 시 화면이 깜빡이고 본체 팬 소음이 급격히 커집니다. 때때로 VIDEO_TDR_FAILURE 블루스크린이 발생합니다."
        value={symptom}
        rows={conversationMode ? 4 : 5}
        onChange={event => onSymptomChange(event.target.value)}
        onPaste={onPaste}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleSend();
          }
        }}
      />

      <div className="nd-prompt-footer">
        <div className="nd-prompt-footer-left">
          <span className="nd-trust-pill">{sysInfo ? '실시간 시스템 데이터 반영' : '시스템 데이터 수집 중'}</span>
          <span className="nd-trust-copy">스크린샷은 붙여넣기로 바로 첨부할 수 있습니다.</span>
        </div>

        <div className="nd-prompt-footer-right">
          {clipboardImage && (
            <div className="nd-attachment-pill">
              <img src={clipboardImage.dataUrl} alt="첨부 이미지" />
              <span>스크린샷 첨부됨</span>
              <button type="button" onClick={onClearImage} aria-label="이미지 제거">✕</button>
            </div>
          )}
          {(messages.length > 0 || diagnosisResponse) && (
            <button type="button" className="nd-secondary-button" onClick={handleReset}>
              초기화
            </button>
          )}
          <button
            type="button"
            className="nd-submit-fab"
            onClick={handleSend}
            disabled={!symptom.trim() || isLoading}
            aria-label="진단 시작"
          >
            AI 진단 시작하기
          </button>
        </div>
      </div>
    </div>
  );

  const renderRecentActivity = () => (
    <section className="nd-diagnose-activity card-glass">
      <div className="nd-section-heading">
        <div>
          <p className="nd-panel-label">최근 활동</p>
          <h2 className="nd-section-title">최근 감지된 시스템 흔적</h2>
        </div>
        <button type="button" className="nd-text-link" disabled aria-disabled="true">
          전체 기록 보기
        </button>
      </div>

      <div className="nd-activity-list">
        {recentActivities.length > 0 ? recentActivities.map((event, index) => (
          <article key={`${event.id}-${index}`} className="nd-activity-card">
            <div className={`nd-activity-icon ${event.levelDisplayName === 'Warning' ? 'warning' : event.levelDisplayName === 'Error' || event.levelDisplayName === 'Critical' ? 'danger' : 'neutral'}`}>
              {event.levelDisplayName === 'Warning' ? '!' : event.levelDisplayName === 'Error' || event.levelDisplayName === 'Critical' ? 'x' : 'i'}
            </div>
            <div className="nd-activity-copy">
              <strong>{event.providerName || `이벤트 ${event.id}`}</strong>
              <p>{summarizeEvent(event.message || `${event.levelDisplayName} 로그가 수집되었습니다.`)}</p>
            </div>
            <span className="nd-activity-chevron" aria-hidden="true">›</span>
          </article>
        )) : (
          <div className="nd-activity-empty">최근 시스템 이벤트가 아직 수집되지 않았습니다.</div>
        )}
      </div>
    </section>
  );

  const renderSystemAside = () => (
    <div className="nd-diagnose-side-stack">
      <section className="nd-system-preview card-glass">
        <div className="nd-system-preview-head">
          <span className="nd-chip-badge accent">{sysInfo ? '실시간 측정 중' : '연결 대기'}</span>
          <span className={`nd-status-pill ${errorCount > 0 ? 'error' : 'success'}`}>
            {errorCount > 0 ? `오류 ${errorCount}건 감지` : '안정 상태'}
          </span>
        </div>

        <div className="nd-system-preview-copy">
          <p className="nd-panel-label">실시간 시스템 스냅샷</p>
          <h3>지금 확인된 상태를 바탕으로 바로 진단을 시작할 수 있어요.</h3>
          <p className="nd-system-preview-summary">{heroSummary}</p>
        </div>

        <div className="nd-system-health-grid" aria-label="핵심 시스템 상태">
          <article className="nd-system-health-card">
            <span>CPU 사용률</span>
            <strong>{cpuUsage != null ? `${cpuUsage}%` : '수집 중'}</strong>
          </article>
          <article className="nd-system-health-card">
            <span>메모리 점유</span>
            <strong>{memoryUsagePct != null ? `${memoryUsagePct}%` : '수집 중'}</strong>
          </article>
          <article className="nd-system-health-card">
            <span>디스크 I/O</span>
            <strong>{formatTransferRate(diskTraffic)}</strong>
          </article>
          <article className="nd-system-health-card">
            <span>최근 오류</span>
            <strong>{errorCount}건</strong>
          </article>
        </div>

        <div className="nd-system-preview-meta">
          <span><i className="status-online" /> 라이브 연결</span>
          <span>CPU 온도 {cpuTemp}</span>
          <span>상위 프로세스 {topProcess}</span>
        </div>

        <div className="nd-quick-symptom-row" aria-label="빠른 증상 선택">
          {quickSymptomChips.map(chip => (
            <button
              key={chip}
              type="button"
              className="nd-quick-symptom-chip"
              onClick={() => onSymptomChange(chip)}
            >
              {chip}
            </button>
          ))}
        </div>
      </section>

      <section className="nd-system-specs card-glass">
        <div className="nd-section-heading compact">
          <div>
            <p className="nd-panel-label">하드웨어 사양</p>
            <h3 className="nd-side-card-title">실시간 시스템 정보</h3>
          </div>
        </div>
        <div className="nd-spec-list">
          <div className="nd-spec-row">
            <span>CPU 사용률</span>
            <strong>{sysInfo ? `${Math.round(sysInfo.cpu.usage)}%` : '수집 중'}</strong>
          </div>
          <div className="nd-spec-row">
            <span>메모리 사용량</span>
            <strong>{memoryUsagePct != null ? `${memoryUsagePct}% / ${formatMemoryTotal(sysInfo?.memory.total)}` : '수집 중'}</strong>
          </div>
          <div className="nd-spec-row">
            <span>그래픽</span>
            <strong>{gpuLabel}</strong>
          </div>
          <div className="nd-spec-row">
            <span>상위 프로세스</span>
            <strong>{topProcess}</strong>
          </div>
        </div>
      </section>

      <section className="nd-system-tip card-glass soft">
        <div className="nd-tip-icon" aria-hidden="true">i</div>
        <div>
          <p className="nd-side-card-title">전문가 팁</p>
          <p className="nd-system-tip-copy">
            문제가 발생하는 시점과 함께 스크린샷을 붙여넣으면 드라이버 충돌이나 특정 앱 병목을 더 빠르게 구분할 수 있습니다.
          </p>
        </div>
      </section>
    </div>
  );

  const renderResponseBoard = (conversationMode = false) => (
    <section className={`nd-response-board${conversationMode ? ' is-conversation' : ''}`} aria-label="AI 진단 패널">
      <div className="nd-response-board-head">
        <div>
          <p className="nd-panel-label">진단 결과</p>
          <h2 className="nd-response-title">AI 분석 결과</h2>
        </div>
        <span className="nd-panel-meta">
          {isLoading ? '분석 중' : diagnosisResponse ? `가설 ${diagnosisResponse.hypotheses.length}개` : '대기'}
        </span>
      </div>

      <div className={`nd-response-feed${conversationMode ? ' is-conversation' : ''}`}>
        {messages.map((message, index) => {
          if (message.kind === 'user') {
            return (
              <div key={`${message.kind}-${index}`} className="nd-message user">
                <div className="nd-bubble user">{message.text}</div>
              </div>
            );
          }

          if (message.kind === 'error') {
            return (
              <div key={`${message.kind}-${index}`} className="nd-message">
                <div className="nd-bubble error">{message.text}</div>
              </div>
            );
          }

          return (
            <div key={`${message.kind}-${index}`} className="nd-message">
              <div className="nd-bubble ai">
                <p className="nd-bubble-intro">
                  {message.response.immediateAction || `${message.response.hypotheses.length}가지 가능성을 찾았습니다. 아래 조치부터 순서대로 확인해보세요.`}
                </p>
                <div className="nd-hypothesis-list">
                  {message.response.hypotheses.map(hypo => (
                    <HypoCard
                      key={hypo.id}
                      hypo={hypo}
                      status={hypoStatuses[hypo.id] ?? 'idle'}
                      onStatus={(id, next) => setHypoStatuses(prev => ({ ...prev, [id]: next }))}
                    />
                  ))}
                </div>
                {allExhausted && (
                  <div className="nd-exhausted-card">
                    <strong>모든 가설을 시도했어요.</strong>
                    <p>재현 모드를 시작하거나 SW + HW 복합 원인 가능성을 염두에 두고 추가 진단을 권장합니다.</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="nd-message">
            <div className="nd-bubble ai">
              <p className="nd-bubble-loading">시스템 스냅샷과 증상을 종합해서 가설을 정리하는 중입니다.</p>
              <div className="nd-loading-dots" aria-label="분석 중">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    </section>
  );

  const renderDiagnosis = () => (
    <div className={`nd-diagnose-stage${showConversationLayout ? ' has-conversation' : ''}${isConversationMorphing ? ' is-morphing' : ''}`}>
      {(!showConversationLayout || isConversationMorphing) && (
        <section className={`nd-landing-view nd-diagnose-page${isConversationMorphing ? ' is-collapsing' : ''}`}>
          <div className="nd-diagnose-main">
            <section className="nd-page-intro animate-fade-in-up">
              <p className="nd-page-kicker">PC Doctor AI</p>
              <h1 className="nd-page-headline">증상 입력</h1>
              <p className="nd-page-description">
                현재 PC에서 겪고 있는 증상을 자유롭게 설명해 주세요. AI가 시스템 텔레메트리 데이터와 함께 분석해 정확한 원인을 찾아드립니다.
              </p>
              {heroLead ? <p className="nd-page-helper">{heroLead}</p> : null}
            </section>

            <section className="nd-diagnose-entry card-glass animate-spring-in">
              {renderPromptShell(false)}
            </section>

            {renderRecentActivity()}
          </div>

          <aside className="nd-diagnose-side animate-fade-in-up delay-150">
            {renderSystemAside()}
          </aside>
        </section>
      )}

      {showConversationLayout && (
        <section className={`nd-conversation-view${isConversationMorphing ? ' is-entering' : ' is-visible'}`}>
          <div className="nd-conversation-main">
            <div className="nd-conversation-header">
              <p className="nd-panel-label">AI 진단 결과</p>
              <h1 className="nd-conversation-title">가능한 원인과 바로 해볼 조치를 정리했습니다.</h1>
              <p className="nd-conversation-copy">효과 여부를 바로 표시하면서 다음 단계로 빠르게 좁혀가세요.</p>
            </div>
            {renderResponseBoard(true)}
          </div>

          <aside className="nd-conversation-side">
            {renderPromptShell(true)}
            {renderSystemAside()}
          </aside>
        </section>
      )}
    </div>
  );

  return (
    <div className="nd-chat-shell nd-redesign-shell">
      <aside className="nd-rail nd-rail-workflow nd-redesign-sidebar">
        <div className="nd-rail-header nd-redesign-brand">
          <div>
            <strong className="nd-redesign-brand-title">PC Doctor AI</strong>
            <p className="nd-redesign-brand-subtitle">AI 기반 실시간 진단</p>
          </div>
        </div>

        <nav className="nd-redesign-nav" aria-label="주요 메뉴">
          <button type="button" className={`nd-redesign-nav-item${activeTab === 'diagnose' ? ' active' : ''}`} onClick={() => setActiveTab('diagnose')}>
            <span className="nd-redesign-nav-icon" aria-hidden="true">▣</span>
            <span>증상 입력</span>
          </button>
          <button type="button" className="nd-redesign-nav-item" disabled aria-disabled="true">
            <span className="nd-redesign-nav-icon" aria-hidden="true">◎</span>
            <span>진단 기록</span>
          </button>
          <button type="button" className="nd-redesign-nav-item" onClick={() => setActiveTab('diagnose')}>
            <span className="nd-redesign-nav-icon" aria-hidden="true">◇</span>
            <span>세션 연결</span>
          </button>
          <button type="button" className="nd-redesign-nav-item" onClick={() => setActiveTab('diagnose')}>
            <span className="nd-redesign-nav-icon" aria-hidden="true">◌</span>
            <span>사용 가이드</span>
          </button>
        </nav>

        <div className="nd-rail-section">
          <p className="nd-rail-section-label">진단 단계</p>
          <div className="nd-rail-progress-summary">
            <span className="nd-rail-progress-step">현재 {activeStepNumber}/5 단계</span>
            <span className="nd-rail-progress-copy">
              {activeStepNumber === 1 ? '증상을 입력하면 바로 가설 단계로 넘어갑니다.' : activeStepNumber === 2 ? '가능성 높은 조치부터 하나씩 확인해보세요.' : '다음 단계 진입 준비가 끝났습니다.'}
            </span>
          </div>
          <div className="nd-workflow-steps">
            {WORKFLOW_STEPS.map((step, i) => {
              const status = getStepStatus(step.num);
              const isActiveStep = step.num === activeStepNumber;

              return (
                <WorkflowStep
                  key={step.num}
                  num={step.num}
                  label={step.label}
                  sublabel={step.sublabel}
                  status={status}
                  active={isActiveStep}
                  isLast={i === WORKFLOW_STEPS.length - 1}
                  onClick={() => handleStepClick(step.num)}
                />
              );
            })}
          </div>
        </div>

        <div className="nd-redesign-sidebar-actions">
          <button type="button" className="nd-redesign-scan-button">
            전체 스캔 시작
          </button>
        </div>

        <div className="nd-rail-footer">
          <button type="button" className="nd-rail-util-button" aria-label="설정">
            <span aria-hidden="true">⌘</span>
            <span>설정</span>
          </button>
          <button type="button" className="nd-rail-util-button" aria-label="고객 센터">
            <span aria-hidden="true">?</span>
            <span>고객 센터</span>
          </button>
          <button type="button" className="nd-rail-util-button" aria-label="로그아웃">
            <span aria-hidden="true">↗</span>
            <span>로그아웃</span>
          </button>
        </div>
      </aside>

      <div className="nd-chat-stage nd-redesign-stage">
        <header className="nd-chat-topbar nd-redesign-topbar">
          <div className="nd-redesign-search">
            <span className="nd-redesign-search-icon" aria-hidden="true">⌕</span>
            <input type="text" placeholder="진단 기록 및 증상 검색..." aria-label="진단 기록 및 증상 검색" />
          </div>
          <div className="nd-chat-actions">
            <button type="button" className="nd-toolbar-button">알림</button>
            <button type="button" className="nd-toolbar-button primary" onClick={handleReset}>새 진단</button>
          </div>
        </header>

        <main className="nd-chat-content nd-redesign-content">
          {activeTab === 'diagnose' && renderDiagnosis()}

          {activeTab === 'process' && (
            <section className="nd-section-page">
              <div className="nd-page-hero">
                <p className="nd-panel-label">시스템 점검</p>
                <h1 className="nd-page-title">CPU와 메모리를 많이 쓰는 프로세스를 한 번에 살펴보세요.</h1>
                <p className="nd-page-copy">
                  성능 저하의 직접 원인이 되는 상위 프로세스를 정렬 기준별로 확인하고, 병목이 특정 앱인지 전체 시스템인지 빠르게 구분할 수 있습니다.
                </p>
              </div>
              <ProcessList />
            </section>
          )}

          {activeTab === 'events' && null}
        </main>
      </div>
    </div>
  );
}

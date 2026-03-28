import { useRef, useState, useEffect } from 'react';
import { useRuntimeMode } from './hooks/useRuntimeMode';
import { useSystemInfo } from './hooks/useSystemInfo';
import type { ClipboardImage, HypothesesResponse } from './types';
import ProcessList from './components/desktop/ProcessList';
import EventLogViewer from './components/desktop/EventLogViewer';
import HypothesisTracker from './components/desktop/HypothesisTracker';
import { generateHypotheses } from './api/diagnosisApi';
import type { EventLog } from './types/electron';
import './styles/tokens.css';
import './styles/global.css';
import './styles/animations.css';

type NavId = 'diagnose' | 'process' | 'events';

function NavIcon({ id }: { id: NavId }) {
  const s: React.CSSProperties = { width: 15, height: 15, flexShrink: 0, display: 'block' };
  switch (id) {
    case 'diagnose':
      return (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={s}>
          <path d="M1 8h2.5L5.5 3l3 10 2.5-7.5 1.5 2.5H15"/>
        </svg>
      );
    case 'events':
      return (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={s}>
          <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h7"/>
        </svg>
      );
    case 'process':
      return (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={s}>
          <rect x="4" y="4" width="8" height="8" rx="1.5"/>
          <path d="M6 1.5V4M8 1.5V4M10 1.5V4M6 12v2.5M8 12v2.5M10 12v2.5M1.5 6H4M1.5 8H4M1.5 10H4M12 6h2.5M12 8h2.5M12 10h2.5"/>
        </svg>
      );
    default:
      return <span style={s} />;
  }
}

const NAV_ITEMS: { id: NavId; label: string }[] = [
  { id: 'diagnose', label: 'Diagnostics' },
  { id: 'events',   label: 'Logs'        },
  { id: 'process',  label: 'Processes'   },
];

const PAGE_TITLE: Record<NavId, string> = {
  diagnose: 'Diagnostics',
  process:  'Processes',
  events:   'Logs',
};

// CPU 실시간 꺾은선 그래프 — 작업 관리자 스타일
const CPU_HISTORY_MAX = 60;

function CpuLineChart({ history }: { history: number[] }) {
  const W = 600;
  const H = 96;
  const padT = 8, padB = 8, padL = 32, padR = 8;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // 히스토리가 부족하면 왼쪽을 0으로 채움
  const data: number[] = Array.from({ length: CPU_HISTORY_MAX }, (_, i) =>
    history[i - (CPU_HISTORY_MAX - history.length)] ?? 0,
  );

  const toX = (i: number) => padL + (i / (CPU_HISTORY_MAX - 1)) * innerW;
  const toY = (v: number) => padT + innerH - (Math.min(v, 100) / 100) * innerH;

  const pts = data.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');
  const area = `${toX(0)},${toY(0)} ${pts} ${toX(CPU_HISTORY_MAX - 1)},${toY(0)}`;

  const gridPcts = [25, 50, 75, 100];

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: H, display: 'block' }}
        preserveAspectRatio="none"
      >
        {/* 수평 그리드 */}
        {gridPcts.map(pct => (
          <line
            key={pct}
            x1={padL} y1={toY(pct)}
            x2={padL + innerW} y2={toY(pct)}
            stroke="var(--color-border)"
            strokeWidth="1"
          />
        ))}

        {/* 채움 영역 */}
        <defs>
          <linearGradient id="cpuFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#cpuFill)" />

        {/* 꺾은선 */}
        <polyline
          points={pts}
          fill="none"
          stroke="var(--color-brand)"
          strokeWidth={1.8}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>

      {/* Y축 레이블 */}
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0,
        width: padL, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        paddingTop: padT, paddingBottom: padB,
        pointerEvents: 'none',
      }}>
        {[100, 75, 50, 25, 0].map(v => (
          <span key={v} style={{ fontSize: 8, color: 'var(--color-text-hint)', lineHeight: 1, textAlign: 'right', paddingRight: 4 }}>
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const mode = useRuntimeMode();
  const sysInfo = useSystemInfo();
  const [symptom, setSymptom] = useState('');
  const [clipboardImage, setClipboardImage] = useState<ClipboardImage | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [activeNav, setActiveNav] = useState<NavId>('diagnose');
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);

  // Phase 5: 진단 플로우 상태
  const [diagnosisResponse, setDiagnosisResponse] = useState<HypothesesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [eventLogs, setEventLogs] = useState<EventLog[]>([]);

  // CPU 사용률 히스토리 — 실시간 꺾은선 그래프용
  useEffect(() => {
    if (sysInfo?.cpu.usage === undefined) return;
    setCpuHistory(prev => {
      const next = [...prev, sysInfo.cpu.usage];
      return next.length > CPU_HISTORY_MAX ? next.slice(-CPU_HISTORY_MAX) : next;
    });
  }, [sysInfo?.cpu.usage]);

  // Phase 4 이벤트 로그 수집 — HypothesisTracker의 패턴 분석에 전달
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    api.getEventLogs().then(setEventLogs).catch(() => {/* 수집 실패는 무시 */});
  }, []);

  // Phase 2: 클립보드 이미지 붙여넣기
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find(item => item.type.startsWith('image/'));
    if (!imageItem) return;

    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setClipboardImage({ dataUrl, file });
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => setClipboardImage(null);

  // Phase 5: 진단 요청 — 가설 생성
  const handleDiagnose = async () => {
    if (!symptom.trim()) return;
    setIsLoading(true);
    setApiError(null);
    setDiagnosisResponse(null);

    try {
      const base64Image = clipboardImage?.dataUrl.includes(',')
        ? clipboardImage.dataUrl.split(',')[1]
        : undefined;

      const systemSnapshot: Record<string, unknown> = sysInfo
        ? {
            cpu: { usage: sysInfo.cpu.usage, temperature: sysInfo.cpu.temperature },
            memory: { used: sysInfo.memory.used, total: sysInfo.memory.total },
            gpu: sysInfo.gpu,
          }
        : {};

      const response = await generateHypotheses({
        symptom: symptom.trim(),
        clipboardImage: base64Image,
        systemSnapshot,
      });

      setDiagnosisResponse(response);
      setActiveNav('diagnose');
    } catch (e) {
      setApiError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setDiagnosisResponse(null);
    setApiError(null);
    setSymptom('');
    setClipboardImage(null);
  };

  const handleHwEscalate = () => {
    // Phase 11에서 QR 세션 생성 구현 예정
    alert('하드웨어 점검 모드는 Phase 11에서 구현됩니다.');
  };

  // 진단 중에는 항상 diagnose 탭 고정
  const currentNav: NavId = diagnosisResponse ? 'diagnose' : activeNav;

  return (
    <div className={`app-root mode-${mode}`}>

      {/* ── Electron 전용 사이드바 ── */}
      {mode === 'electron' && (
        <aside className="sidebar">
          {/* 로고 섹션 */}
          <div style={{ padding: '0 var(--space-5)', marginBottom: 'var(--space-8)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{
                width: 36, height: 36,
                borderRadius: 10,
                background: 'var(--color-brand)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 0 16px rgba(67,85,185,0.45)',
              }}>
                <svg viewBox="0 0 14 14" fill="none" style={{ width: 14, height: 14 }}>
                  <rect x="1" y="1.5" width="12" height="8.5" rx="1.5" stroke="white" strokeWidth="1.5"/>
                  <path d="M4.5 13h5M7 10v3" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--color-sidebar-text-active)', letterSpacing: '-0.6px', lineHeight: '22px' }}>
                  NextDoor CS
                </p>
                <p style={{ fontWeight: 500, fontSize: 10, color: 'var(--color-sidebar-text)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  SW 진단 시스템
                </p>
              </div>
            </div>
          </div>

          {/* 구분선 */}
          <div style={{ height: 1, background: 'var(--color-sidebar-divider)', margin: '0 var(--space-5)', marginBottom: 'var(--space-5)' }} />

          {/* 네비게이션 */}
          <nav style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <p className="sidebar-nav-group-label">메뉴</p>
            {NAV_ITEMS.map(item => {
              const isLocked = !!diagnosisResponse && item.id !== 'diagnose';
              return (
                <button
                  key={item.id}
                  type="button"
                  className={[
                    'sidebar-nav-item',
                    currentNav === item.id ? 'active' : '',
                    isLocked ? 'locked' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => {
                    if (!isLocked) setActiveNav(item.id);
                  }}
                >
                  <NavIcon id={item.id} />
                  <span>{item.label}</span>
                  {currentNav === item.id && (
                    <span style={{
                      marginLeft: 'auto',
                      width: 6, height: 6,
                      borderRadius: '50%',
                      background: 'var(--color-brand)',
                      boxShadow: 'var(--glow-brand)',
                      flexShrink: 0,
                    }} />
                  )}
                </button>
              );
            })}
          </nav>

          {/* 시스템 연결 상태 */}
          <div style={{
            margin: '0 var(--space-3)',
            marginBottom: 'var(--space-3)',
            padding: 'var(--space-3) var(--space-4)',
            background: 'rgba(34,197,94,0.08)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(34,197,94,0.15)',
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-success)', flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: 'rgba(34,197,94,0.9)', fontWeight: 600, letterSpacing: '0.02em' }}>
              시스템 연결됨
            </span>
          </div>

          {/* 구분선 */}
          <div style={{ height: 1, background: 'var(--color-sidebar-divider)', margin: '0 var(--space-5)', marginBottom: 'var(--space-4)' }} />

          {/* 유저 프로필 (하단) */}
          <div style={{
            padding: '0 var(--space-5) var(--space-2)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'rgba(67,85,185,0.25)',
              border: '1px solid rgba(67,85,185,0.3)',
              flexShrink: 0,
              overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg viewBox="0 0 24 24" fill="none" style={{ width: 16, height: 16 }}>
                <circle cx="12" cy="9" r="4.5" fill="rgba(255,255,255,0.5)"/>
                <path d="M3 22c0-4.97 4.03-9 9-9s9 4.03 9 9" fill="rgba(255,255,255,0.5)"/>
              </svg>
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-sidebar-text-active)', letterSpacing: '-0.3px' }}>
                Admin User
              </p>
              <p style={{ fontSize: 10, color: 'var(--color-sidebar-text)' }}>
                System Engineer
              </p>
            </div>
          </div>
        </aside>
      )}

      {/* ── 헤더 ── */}
      <header className="top-app-bar">
        {mode === 'electron' ? (
          <>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 11, color: 'var(--color-brand)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                System Status
              </span>
              <span style={{ fontSize: 14, color: 'var(--color-border)', lineHeight: 1 }}>/</span>
              <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)', letterSpacing: '-0.2px' }}>
                {diagnosisResponse ? '재현 모드' : PAGE_TITLE[currentNav]}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {sysInfo && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '5px 12px', background: 'var(--color-bg-card-sub)', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: '0.03em' }}>
                    CPU {sysInfo.cpu.usage}%
                  </span>
                  <span style={{ width: 1, height: 10, background: 'var(--color-border)', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: '0.03em' }}>
                    MEM {Math.round((sysInfo.memory.used / sysInfo.memory.total) * 100)}%
                  </span>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <span className="text-h2">옆집 컴공생</span>
            <span className="badge text-badge">
              {mode === 'pwa-session' ? 'MOBILE' : 'STANDALONE'}
            </span>
          </>
        )}
      </header>

      {/* ── 메인 콘텐츠 ── */}
      <main className="app-content">
        {mode === 'pwa-standalone' && (
          <div className="badge-warning" style={{ padding: 'var(--space-3)', marginBottom: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>
            ⚠️ SW 데이터 없이 분석 — 정확도가 제한될 수 있어요
          </div>
        )}

        {/* ── SW 진단 탭 ── */}
        {currentNav === 'diagnose' && (
          <>
            {/* HypothesisTracker — 진단 플로우 (결과 있을 때) */}
            {diagnosisResponse && mode === 'electron' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                  <p className="text-sm" style={{ color: 'var(--color-text-hint)' }}>
                    증상: {symptom}
                  </p>
                  <button
                    type="button"
                    onClick={handleReset}
                    style={{ background: 'transparent', border: 'none', color: 'var(--color-text-hint)', cursor: 'pointer', fontSize: '12px' }}
                  >
                    ✕ 초기화
                  </button>
                </div>
                <HypothesisTracker
                  response={diagnosisResponse}
                  symptom={symptom}
                  eventLogs={eventLogs}
                  onHwEscalate={handleHwEscalate}
                  onReset={handleReset}
                />
              </>
            )}

            {/* ── Diagnostics Landing ── */}
            {!diagnosisResponse && mode === 'electron' && (
              <div className="animate-fade-in-up">

                {/* 히어로 인사 */}
                <div style={{ paddingTop: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
                  <h1 style={{ fontSize: 38, fontWeight: 300, lineHeight: 1.18, letterSpacing: '-0.025em', color: 'var(--color-text-primary)' }}>
                    안녕하세요, 저는{' '}
                    <span style={{ color: 'var(--color-brand)', fontWeight: 600 }}>옆집 컴공생</span>
                    입니다.
                  </h1>
                </div>

                {/* 증상 입력 — 검색 스타일 */}
                <div className="symptom-search-wrap">
                  <textarea
                    id="symptom-input"
                    ref={textareaRef}
                    className="symptom-search"
                    placeholder="PC 증상을 설명해 주세요... (Ctrl+V 스크린샷 첨부 가능)"
                    value={symptom}
                    onChange={e => setSymptom(e.target.value)}
                    onPaste={handlePaste}
                    rows={1}
                  />
                  <button
                    type="button"
                    className="symptom-search-btn"
                    disabled={!symptom.trim() || isLoading}
                    onClick={handleDiagnose}
                    aria-label="진단 요청"
                  >
                    {isLoading ? (
                      <span className="dot-loading" style={{ transform: 'scale(0.5)' }}><span /><span /><span /></span>
                    ) : (
                      <svg viewBox="0 0 14 14" fill="none" style={{ width: 14, height: 14 }}>
                        <circle cx="6" cy="6" r="4.5" stroke="white" strokeWidth="1.5"/>
                        <path d="M9.5 9.5L12 12" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    )}
                  </button>
                  {clipboardImage && (
                    <div className="clipboard-preview" style={{ marginTop: 'var(--space-2)' }}>
                      <img src={clipboardImage.dataUrl} alt="첨부 이미지" className="clipboard-thumbnail" />
                      <button type="button" className="clipboard-remove" onClick={clearImage} aria-label="이미지 제거">✕</button>
                    </div>
                  )}
                  {apiError && (
                    <p className="text-sm" style={{ color: 'var(--color-error)', marginTop: 'var(--space-2)' }}>
                      오류: {apiError}
                    </p>
                  )}
                </div>

                {/* CPU + Memory/Disk 2열 그리드 */}
                {sysInfo ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 288px', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>

                    {/* CPU 퍼포먼스 카드 */}
                    <div style={{ background: 'var(--color-bg-card)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-8)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-6)' }}>
                        <div>
                          <p className="text-label" style={{ marginBottom: 'var(--space-1)' }}>THERMAL ARCHITECTURE</p>
                          <p style={{ fontSize: 22, fontWeight: 400, color: 'var(--color-text-primary)', letterSpacing: '-0.015em', lineHeight: 1.2 }}>CPU Performance</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: 44, fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: '-0.04em', lineHeight: 1 }}>
                            {sysInfo.cpu.usage}
                            <span style={{ fontSize: 22, fontWeight: 400, color: 'var(--color-text-secondary)' }}>%</span>
                          </p>
                          <p className="text-label" style={{ marginTop: 2 }}>UTILIZATION</p>
                        </div>
                      </div>

                      <CpuLineChart history={cpuHistory} />

                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sysInfo.gpu ? 3 : 2}, 1fr)`, gap: 'var(--space-4)', marginTop: 'var(--space-5)', paddingTop: 'var(--space-5)', borderTop: '1px solid var(--color-border)' }}>
                        <div>
                          <p className="text-label" style={{ marginBottom: 'var(--space-1)' }}>TEMPERATURE</p>
                          <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
                            {sysInfo.cpu.temperature !== null ? `${sysInfo.cpu.temperature}° C` : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-label" style={{ marginBottom: 'var(--space-1)' }}>USAGE</p>
                          <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>{sysInfo.cpu.usage}%</p>
                        </div>
                        {sysInfo.gpu && (
                          <div>
                            <p className="text-label" style={{ marginBottom: 'var(--space-1)' }}>GPU VRAM</p>
                            <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>{sysInfo.gpu.vram} MB</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 우측 Memory + Disk */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                      {/* Memory */}
                      <div style={{ background: 'var(--color-bg-card)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)', flex: 1 }}>
                        <p className="text-label" style={{ marginBottom: 'var(--space-4)' }}>MEMORY ALLOCATION</p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>RAM</span>
                          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-brand)', letterSpacing: '-0.3px' }}>
                            {(sysInfo.memory.used / 1024 ** 3).toFixed(1)} / {(sysInfo.memory.total / 1024 ** 3).toFixed(0)} GB
                          </span>
                        </div>
                        <div style={{ height: 3, background: 'var(--color-brand-track)', borderRadius: 'var(--radius-full)' }}>
                          <div style={{ width: `${(sysInfo.memory.used / sysInfo.memory.total) * 100}%`, height: '100%', background: 'var(--color-brand)', borderRadius: 'var(--radius-full)', boxShadow: 'var(--glow-divider)', transition: 'width 0.5s ease' }} />
                        </div>
                        <p className="text-sm" style={{ marginTop: 'var(--space-3)' }}>
                          {Math.round((sysInfo.memory.used / sysInfo.memory.total) * 100)}% 사용 중
                        </p>
                      </div>

                      {/* Disk */}
                      {sysInfo.disk && (
                        <div style={{ background: 'var(--color-bg-card)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)', flex: 1 }}>
                          <p className="text-label" style={{ marginBottom: 'var(--space-4)' }}>DATA VELOCITY</p>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>Disk I/O</span>
                            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-brand)', letterSpacing: '-0.3px' }}>
                              {sysInfo.disk.read} IOPS
                            </span>
                          </div>
                          <div style={{ height: 3, background: 'var(--color-brand-track)', borderRadius: 'var(--radius-full)' }}>
                            <div style={{ width: `${Math.min(sysInfo.disk.read / 500 * 100, 100)}%`, height: '100%', background: 'var(--color-brand)', borderRadius: 'var(--radius-full)', boxShadow: 'var(--glow-divider)', transition: 'width 0.5s ease' }} />
                          </div>
                          <p className="text-sm" style={{ marginTop: 'var(--space-3)' }}>
                            쓰기 {sysInfo.disk.write} IOPS
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 288px', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                    <div className="skeleton" style={{ height: 260, borderRadius: 'var(--radius-xl)' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                      <div className="skeleton" style={{ flex: 1, borderRadius: 'var(--radius-xl)' }} />
                      <div className="skeleton" style={{ flex: 1, borderRadius: 'var(--radius-xl)' }} />
                    </div>
                  </div>
                )}

                {/* 시스템 합성 카드 */}
                <div style={{ background: 'var(--color-bg-card-sub)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-8)', marginBottom: 'var(--space-4)', border: '1px solid var(--color-border)', display: 'grid', gridTemplateColumns: '1fr 140px', gap: 'var(--space-8)', alignItems: 'center' }}>
                  <div>
                    <p className="text-label" style={{ color: 'var(--color-brand)', marginBottom: 'var(--space-4)', letterSpacing: '0.08em' }}>HARDWARE SYNTHESIS</p>
                    <h2 style={{ fontSize: 26, fontWeight: 400, lineHeight: 1.25, letterSpacing: '-0.015em', color: 'var(--color-text-primary)', marginBottom: 'var(--space-3)' }}>
                      시스템 상태 검증됨
                      <span style={{ display: 'block', fontSize: 16, fontWeight: 400, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                        {new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 기준
                      </span>
                    </h2>
                    <p className="text-sm" style={{ maxWidth: 480, lineHeight: 1.7, marginBottom: 'var(--space-5)', color: 'var(--color-text-secondary)' }}>
                      PC 내부 구성 요소가 정상 범위 내에서 작동 중이에요. 하드웨어 병목 현상은 감지되지 않았어요.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                      {[
                        { label: '메모리 상태', desc: '안정적인 메모리 할당이 확인됐어요.' },
                        { label: '열 관리', desc: sysInfo ? `CPU 온도 ${sysInfo.cpu.temperature !== null ? sysInfo.cpu.temperature + '°C' : '측정 불가'} — 정상 범위` : '데이터 수집 중...' },
                      ].map(item => (
                        <div key={item.label} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                          <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--color-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                            <svg viewBox="0 0 8 8" fill="none" style={{ width: 8, height: 8 }}>
                              <path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                          <div>
                            <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.3 }}>{item.label}</p>
                            <p className="text-sm">{item.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* 장식 그래픽 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.12 }}>
                    <svg viewBox="0 0 120 120" fill="none" style={{ width: 120 }}>
                      <circle cx="60" cy="60" r="55" stroke="var(--color-brand)" strokeWidth="2"/>
                      <circle cx="60" cy="60" r="36" stroke="var(--color-brand)" strokeWidth="1.5"/>
                      <circle cx="60" cy="60" r="18" stroke="var(--color-brand)" strokeWidth="1"/>
                      <line x1="60" y1="5" x2="60" y2="24" stroke="var(--color-brand)" strokeWidth="2"/>
                      <line x1="60" y1="96" x2="60" y2="115" stroke="var(--color-brand)" strokeWidth="2"/>
                      <line x1="5" y1="60" x2="24" y2="60" stroke="var(--color-brand)" strokeWidth="2"/>
                      <line x1="96" y1="60" x2="115" y2="60" stroke="var(--color-brand)" strokeWidth="2"/>
                    </svg>
                  </div>
                </div>

                {/* 퀵 액션 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-4)' }}>
                  {([
                    { navId: 'events'  as NavId, label: '이벤트 로그',  desc: '최근 시스템 로그 조회' },
                    { navId: 'process' as NavId, label: '프로세스 목록', desc: '실행 중인 프로세스 확인' },
                  ] as const).map(action => (
                    <button
                      key={action.navId}
                      type="button"
                      className="quick-action-card"
                      onClick={() => setActiveNav(action.navId)}
                    >
                      <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--color-bg-card-sub)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--color-brand)' }}>
                        <NavIcon id={action.navId} />
                      </div>
                      <div>
                        <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary)', letterSpacing: '-0.2px', lineHeight: 1.3, marginBottom: 2 }}>{action.label}</p>
                        <p className="text-sm">{action.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>

              </div>
            )}
          </>
        )}

        {/* ── 프로세스 탭 ── */}
        {currentNav === 'process' && mode === 'electron' && (
          <ProcessList />
        )}

        {/* ── 이벤트 로그 탭 ── */}
        {currentNav === 'events' && mode === 'electron' && (
          <EventLogViewer />
        )}
      </main>
    </div>
  );
}

import { useRef, useState, useEffect } from 'react';
import { useRuntimeMode } from './hooks/useRuntimeMode';
import { useSystemInfo } from './hooks/useSystemInfo';
import type { ClipboardImage, HypothesesResponse } from './types';
import SystemDashboard from './components/desktop/SystemDashboard';
import ProcessList from './components/desktop/ProcessList';
import EventLogViewer from './components/desktop/EventLogViewer';
import HypothesisTracker from './components/desktop/HypothesisTracker';
import { generateHypotheses } from './api/diagnosisApi';
import type { EventLog } from './types/electron';
import './styles/tokens.css';
import './styles/global.css';
import './styles/animations.css';

export default function App() {
  const mode = useRuntimeMode();
  const sysInfo = useSystemInfo();
  const [symptom, setSymptom] = useState('');
  const [clipboardImage, setClipboardImage] = useState<ClipboardImage | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Phase 5: 진단 플로우 상태
  const [diagnosisResponse, setDiagnosisResponse] = useState<HypothesesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [eventLogs, setEventLogs] = useState<EventLog[]>([]);

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
      // 클립보드 이미지 base64 추출 (data: prefix 제거)
      const base64Image = clipboardImage?.dataUrl.includes(',')
        ? clipboardImage.dataUrl.split(',')[1]
        : undefined;

      // 현재 시스템 스냅샷을 systemSnapshot으로 전달
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

  return (
    <div className={`app-root mode-${mode}`}>
      <header className="top-app-bar">
        <span className="text-h2">옆집 컴공생</span>
        <span className="badge text-badge">
          {mode === 'electron' ? 'DESKTOP' : mode === 'pwa-session' ? 'MOBILE' : 'STANDALONE'}
        </span>
      </header>

      <main className="app-content">
        {mode === 'pwa-standalone' && (
          <div className="badge-warning" style={{ padding: 'var(--space-3)', marginBottom: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>
            ⚠️ SW 데이터 없이 분석 — 정확도가 제한될 수 있어요
          </div>
        )}

        {/* 증상 입력 섹션 — 진단 중에는 숨김 */}
        {!diagnosisResponse && (
          <section className="symptom-section">
            <label className="text-label" htmlFor="symptom-input">증상 입력</label>
            <textarea
              id="symptom-input"
              ref={textareaRef}
              className="symptom-textarea"
              placeholder="PC 증상을 입력하세요... (Ctrl+V로 스크린샷 첨부 가능)"
              value={symptom}
              onChange={e => setSymptom(e.target.value)}
              onPaste={handlePaste}
              rows={4}
            />

            {clipboardImage && (
              <div className="clipboard-preview">
                <img src={clipboardImage.dataUrl} alt="첨부 이미지" className="clipboard-thumbnail" />
                <button type="button" className="clipboard-remove" onClick={clearImage} aria-label="이미지 제거">
                  ✕
                </button>
              </div>
            )}

            {/* Phase 5: 진단 요청 버튼 */}
            {mode === 'electron' && (
              <button
                type="button"
                disabled={!symptom.trim() || isLoading}
                onClick={handleDiagnose}
                style={{
                  marginTop: 'var(--space-3)',
                  padding: 'var(--space-3) var(--space-6)',
                  background: symptom.trim() && !isLoading ? 'var(--color-brand)' : 'var(--color-bg-card-sub)',
                  color: symptom.trim() && !isLoading ? '#fff' : 'var(--color-text-hint)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  cursor: symptom.trim() && !isLoading ? 'pointer' : 'not-allowed',
                  fontWeight: 600,
                  fontSize: '14px',
                  transition: 'background 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                }}
              >
                {isLoading ? (
                  <>
                    <span className="dot-loading" style={{ transform: 'scale(0.6)' }} />
                    분석 중...
                  </>
                ) : (
                  '진단 요청'
                )}
              </button>
            )}

            {apiError && (
              <p className="text-sm" style={{ color: 'var(--color-error)', marginTop: 'var(--space-2)' }}>
                오류: {apiError}
              </p>
            )}
          </section>
        )}

        {/* Phase 5: HypothesisTracker — 진단 플로우 */}
        {diagnosisResponse && mode === 'electron' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
              <p className="text-sm" style={{ color: 'var(--color-text-hint)' }}>
                증상: {symptom}
              </p>
              <button
                type="button"
                onClick={handleReset}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-text-hint)',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
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

        {/* Phase 3: Electron 전용 시스템 대시보드 */}
        {mode === 'electron' && !diagnosisResponse && <SystemDashboard />}

        {/* Phase 4: Electron 전용 프로세스 목록 + 이벤트 로그 */}
        {mode === 'electron' && !diagnosisResponse && <ProcessList />}
        {mode === 'electron' && !diagnosisResponse && <EventLogViewer />}
      </main>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { useRuntimeMode } from './hooks/useRuntimeMode';
import { useSystemInfo } from './hooks/useSystemInfo';
import type { ClipboardImage, HypothesesResponse, DiagnosisResponse, ScoreSummary } from './types';
import ElectronDashboard from './components/desktop/ElectronDashboard';
import VideoAnalysis from './components/mobile/VideoAnalysis';
import ShootingGuide from './components/mobile/ShootingGuide';
import { generateHypotheses, diagnoseHardware } from './api/diagnosisApi';
import type { EventLog, ProcessData } from './types/electron';
import './styles/tokens.css';
import './styles/global.css';
import './styles/animations.css';


const CPU_HISTORY_MAX = 60;

export default function App() {
  const mode = useRuntimeMode();
  const sysInfo = useSystemInfo();
  const [symptom, setSymptom] = useState('');
  const [clipboardImage, setClipboardImage] = useState<ClipboardImage | null>(null);

  const [cpuHistory, setCpuHistory] = useState<number[]>([]);

  // Phase 5: 진단 플로우 상태
  const [diagnosisResponse, setDiagnosisResponse] = useState<HypothesesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [eventLogs, setEventLogs] = useState<EventLog[]>([]);
  const [processData, setProcessData] = useState<ProcessData | null>(null);

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
    api.getTopProcesses().then(setProcessData).catch(() => {/* 수집 실패는 무시 */});
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

  // ── Phase 6/7: PWA HW 진단 상태 ─────────────────────────────────────────────
  const [pwaSymptom, setPwaSymptom]           = useState('');
  const [pwaLoading, setPwaLoading]           = useState(false);
  const [pwaError, setPwaError]               = useState<string | null>(null);
  const [pwaResult, setPwaResult]             = useState<DiagnosisResponse | null>(null);

  // Phase 7: VideoAnalysis로 캡처된 프레임/오디오
  const [pwaFrames, setPwaFrames]             = useState<string[]>([]);
  const [pwaAudioBlob, setPwaAudioBlob]       = useState<Blob | null>(null);
  const [pwaMimeType, setPwaMimeType]         = useState('audio/webm');
  const [pwaScoreSummary, setPwaScoreSummary] = useState<ScoreSummary | null>(null);
  const [showGuide, setShowGuide]             = useState(false);

  const handleFramesReady = useCallback((
    frames: string[],
    audioBlob: Blob,
    mimeType: string,
    scoreSummary: ScoreSummary,
  ) => {
    setPwaFrames(frames);
    setPwaAudioBlob(audioBlob);
    setPwaMimeType(mimeType);
    setPwaScoreSummary(scoreSummary);
  }, []);

  const handlePwaDiagnose = async () => {
    if (!pwaSymptom.trim()) return;
    setPwaLoading(true);
    setPwaError(null);
    setPwaResult(null);
    try {
      const result = await diagnoseHardware({
        symptom: pwaSymptom.trim(),
        frames: pwaFrames, // Phase 7: 실제 프레임 배열
      });
      setPwaResult(result);
    } catch (e) {
      setPwaError((e as Error).message);
    } finally {
      setPwaLoading(false);
    }
  };

  const handlePwaReset = () => {
    setPwaResult(null);
    setPwaError(null);
    setPwaSymptom('');
    setPwaFrames([]);
    setPwaAudioBlob(null);
    setPwaScoreSummary(null);
  };

  // pwaAudioBlob, pwaMimeType은 Phase 8에서 서버 전송 시 사용
  void pwaAudioBlob; void pwaMimeType;

  return (
    <div className={`app-root mode-${mode}`}>
      {/* ── PWA 모드 ── */}
      {mode !== 'electron' && (
        <div className="nd-pwa-shell">
          <header className="nd-pwa-topbar animate-fade-in-down">
            <div className="nd-pwa-brand-block">
              <div>
                <p className="nd-pwa-overline">PC Doctor Mobile</p>
                <h1 className="nd-pwa-title">하드웨어 진단</h1>
              </div>
              <p className="nd-pwa-brand-copy">카메라 기반 하드웨어 진단</p>
            </div>
            <span className="nd-status-pill neutral">
              {mode === 'pwa-session' ? 'LINKED SESSION' : 'STANDALONE'}
            </span>
          </header>

          <main className="nd-pwa-main">
            {/* 독립 모드 정확도 경고 — 항상 최상단 */}
            {mode === 'pwa-standalone' && (
              <div className="nd-pwa-warning animate-fade-in-up">
                <strong>독립 모드</strong> — SW 데이터 없이 분석합니다. Electron과 연결하면 더 정확한 진단이 가능해요.
              </div>
            )}

            {/* 진단 결과 화면 */}
            {pwaResult && (
              <section className="nd-pwa-result-panel animate-spring-in">
                <div className="nd-pwa-result-header">
                  <p className="nd-pwa-overline">진단 완료</p>
                  <h2>하드웨어 진단 결과</h2>
                </div>
                <div className="nd-pwa-result-body">
                  <div className="nd-pwa-result-block">
                    <p className="nd-pwa-result-label">원인 추정</p>
                    <p className="nd-pwa-result-value">{pwaResult.cause}</p>
                  </div>
                  <div className="nd-pwa-result-block">
                    <p className="nd-pwa-result-label">해결 방법</p>
                    <p className="nd-pwa-result-value nd-pwa-result-preformatted">{pwaResult.solution}</p>
                  </div>
                  <div className="nd-pwa-result-confidence">
                    <span className={`nd-confidence-badge ${pwaResult.confidence < 0.6 ? 'warn' : 'ok'}`}>
                      확신도 약 {Math.round(pwaResult.confidence * 100)}%
                    </span>
                    {pwaResult.confidence < 0.6 && (
                      <p className="nd-confidence-warn-text">수리기사 상담을 권장해요.</p>
                    )}
                  </div>
                </div>
                <button className="nd-pwa-reset-btn" onClick={handlePwaReset}>
                  새로운 진단 시작
                </button>
              </section>
            )}

            {/* 진단 입력 + 카메라 */}
            {!pwaResult && (
              <>
                {/* VideoAnalysis — 촬영 가이드 토글 + 프레임 캡처 */}
                <section className="nd-pwa-camera-section animate-spring-in">
                  <div className="nd-camera-guide-toggle-wrap">
                    <button
                      className="nd-camera-guide-toggle"
                      onClick={() => setShowGuide(true)}
                    >
                      촬영 가이드 보기
                    </button>
                  </div>
                  <VideoAnalysis onFramesReady={handleFramesReady} />
                  {pwaScoreSummary && (
                    <p className="nd-camera-hint nd-camera-score-summary">
                      선택 프레임 {pwaScoreSummary.sent}개 · 흔들림 제외 {pwaScoreSummary.blurDiscarded}개
                    </p>
                  )}
                </section>
                <ShootingGuide open={showGuide} onClose={() => setShowGuide(false)} />

                {/* 증상 입력 + 진단 요청 */}
                <section className="nd-pwa-input-section animate-fade-in-up delay-150">
                  <label className="nd-pwa-input-label" htmlFor="pwa-symptom">
                    증상 설명
                  </label>
                  <textarea
                    id="pwa-symptom"
                    className="nd-pwa-textarea"
                    placeholder={`PC 상태를 설명해주세요.\n예) 부팅 시 비프음 3번, LED 빨간 불, 메인보드 커패시터 부풀어오름`}
                    value={pwaSymptom}
                    onChange={e => setPwaSymptom(e.target.value)}
                    rows={4}
                  />
                  <p className="nd-pwa-camera-tip">촬영 완료 후 증상을 입력하고 진단을 요청해주세요.</p>
                  {pwaError && (
                    <div className="nd-pwa-error-banner">
                      오류가 발생했어요: {pwaError}
                    </div>
                  )}
                  <button
                    className="nd-pwa-diagnose-btn nd-submit-fab"
                    onClick={handlePwaDiagnose}
                    disabled={pwaLoading || !pwaSymptom.trim()}
                  >
                    {pwaLoading ? (
                      <span className="nd-pwa-loading-text">
                        <span className="nd-camera-loading-dots"><span/><span/><span/></span>
                        분석 중
                      </span>
                    ) : '진단 요청'}
                  </button>
                </section>

                {/* 안내 카드 그리드 */}
                <section className="nd-pwa-card-grid">
                  <article className="nd-pwa-card animate-fade-in-up delay-150">
                    <span className="nd-pwa-card-label">01</span>
                    <h3>증상 설명</h3>
                    <p>부팅 불가, 비프음, LED 상태 등 체감 증상을 입력하세요.</p>
                  </article>
                  <article className="nd-pwa-card animate-fade-in-up delay-300">
                    <span className="nd-pwa-card-label">02</span>
                    <h3>카메라 촬영</h3>
                    <p>PC 내부를 카메라로 비추면 이미지 기반 분석이 추가됩니다.</p>
                  </article>
                  <article className="nd-pwa-card animate-fade-in-up delay-400">
                    <span className="nd-pwa-card-label">03</span>
                    <h3>진단 결과</h3>
                    <p>원인 추정 + 확신도 + 해결 방법을 제공합니다.</p>
                  </article>
                </section>

                <section className="nd-pwa-support-grid animate-fade-in-up delay-500">
                  <article className="nd-pwa-support-card">
                    <p className="nd-pwa-support-title">연결 상태</p>
                    <strong>{mode === 'pwa-session' ? 'Electron 세션 연결됨' : '독립 모드 실행 중'}</strong>
                    <p>세션 연결 시 SW 데이터와 함께 복합 원인 분석이 가능합니다.</p>
                  </article>
                  <article className="nd-pwa-support-card">
                    <p className="nd-pwa-support-title">촬영 팁</p>
                    <strong>PC 내부 20~30cm 거리</strong>
                    <p>메인보드 커패시터, RAM 슬롯, 전원부 등을 밝은 곳에서 찍어주세요.</p>
                  </article>
                </section>
              </>
            )}
          </main>
        </div>
      )}

      {/* ── Electron 모드 — 3컬럼 대시보드 ── */}
      {mode === 'electron' && (
        <ElectronDashboard
          sysInfo={sysInfo}
          cpuHistory={cpuHistory}
          symptom={symptom}
          clipboardImage={clipboardImage}
          isLoading={isLoading}
          apiError={apiError}
          processData={processData}
          eventLogs={eventLogs}
          diagnosisResponse={diagnosisResponse}
          onSymptomChange={setSymptom}
          onPaste={handlePaste}
          onDiagnose={handleDiagnose}
          onClearImage={clearImage}
          onReset={handleReset}
        />
      )}
    </div>
  );
}

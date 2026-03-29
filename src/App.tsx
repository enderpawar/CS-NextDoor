import { useState, useEffect } from 'react';
import { useRuntimeMode } from './hooks/useRuntimeMode';
import { useSystemInfo } from './hooks/useSystemInfo';
import type { ClipboardImage, HypothesesResponse } from './types';
import ElectronDashboard from './components/desktop/ElectronDashboard';
import { generateHypotheses } from './api/diagnosisApi';
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

  return (
    <div className={`app-root mode-${mode}`}>
      {/* ── PWA 모드 ── */}
      {mode !== 'electron' && (
        <div className="nd-pwa-shell">
          <header className="nd-pwa-topbar animate-fade-in-down">
            <div className="nd-pwa-brand-block">
              <div>
                <p className="nd-pwa-overline">PC Doctor Mobile</p>
                <h1 className="nd-pwa-title">하드웨어 진단 가이드</h1>
              </div>
              <p className="nd-pwa-brand-copy">카메라와 마이크 기반 하드웨어 진단</p>
            </div>
            <span className="nd-status-pill neutral">
              {mode === 'pwa-session' ? 'LINKED SESSION' : 'STANDALONE'}
            </span>
          </header>

          <main className="nd-pwa-main">
            <section className="nd-pwa-hero-card nd-pwa-hero-panel animate-spring-in">
              <div className="nd-pwa-hero-copy">
                <p className="nd-pwa-hero-eyebrow">mobile flow</p>
                <h2>카메라와 마이크를 이용해 하드웨어 증상을 단계별로 기록하는 모바일 진단 셸입니다.</h2>
                <p>
                  아직 Phase 6~8 화면은 구현 전이지만, 데스크톱과 동일한 글래스 톤과 블루 액센트로 첫 경험을 맞췄습니다.
                </p>
                <div className="nd-pwa-pill-row">
                  <span className="nd-pwa-pill accent">Camera Guide</span>
                  <span className="nd-pwa-pill">Audio Capture</span>
                  <span className="nd-pwa-pill">Linked Session</span>
                </div>
              </div>

              <div className="nd-pwa-side-grid animate-fade-in-up delay-150">
                <article className="nd-pwa-side-card primary">
                  <span className="nd-pwa-highlight-label">준비 중인 기능</span>
                  <strong>카메라 가이드</strong>
                  <p>프레임 보조와 촬영 가이드로 물리적 징후를 안정적으로 수집합니다.</p>
                </article>
                <article className="nd-pwa-side-card">
                  <span className="nd-pwa-highlight-label">세션 연결</span>
                  <strong>BIOS / Windows 안내</strong>
                  <p>Electron 세션과 연결되면 SW 데이터와 함께 복합 원인을 추적합니다.</p>
                </article>
              </div>
            </section>

            {mode === 'pwa-standalone' && (
              <div className="nd-pwa-warning animate-fade-in-up delay-300">
                SW 데이터 없이 분석 중입니다. 독립 모드에서는 정확도가 제한될 수 있어요.
              </div>
            )}

            <section className="nd-pwa-card-grid">
              <article className="nd-pwa-card animate-fade-in-up delay-150">
                <span className="nd-pwa-card-label">01</span>
                <h3>문제 상황 설명</h3>
                <p>부팅 불가, 비프음, LED 상태처럼 사용자가 체감하는 증상을 먼저 정리합니다.</p>
              </article>
              <article className="nd-pwa-card animate-fade-in-up delay-300">
                <span className="nd-pwa-card-label">02</span>
                <h3>카메라/오디오 수집</h3>
                <p>카메라 프레임과 마이크 입력을 기반으로 하드웨어 징후를 수집할 준비를 갖춥니다.</p>
              </article>
              <article className="nd-pwa-card animate-fade-in-up delay-400">
                <span className="nd-pwa-card-label">03</span>
                <h3>세션 연결</h3>
                <p>Electron과 연결되면 소프트웨어 정보와 함께 복합 원인 분석으로 확장됩니다.</p>
              </article>
            </section>

            <section className="nd-pwa-support-grid animate-fade-in-up delay-500">
              <article className="nd-pwa-support-card">
                <p className="nd-pwa-support-title">실시간 연결 상태</p>
                <strong>{mode === 'pwa-session' ? 'Electron 세션 연결됨' : '독립 모드 실행 중'}</strong>
                <p>세션 연결 시 BIOS/오디오/시스템 진단 흐름이 하나의 진단 기록으로 연결됩니다.</p>
              </article>
              <article className="nd-pwa-support-card">
                <p className="nd-pwa-support-title">권장 안내</p>
                <strong>문제 발생 시점을 같이 적어주세요</strong>
                <p>전원 직후, 부팅 화면, 윈도우 진입 직전처럼 시점을 적으면 더 정확한 안내가 가능합니다.</p>
              </article>
            </section>
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

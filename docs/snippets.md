# 코드 스니펫 — Phase별 구현 레퍼런스

> **진단 모드 분리 원칙**
> - Mobile PWA  → 하드웨어 진단 (카메라/마이크 입력)
> - Desktop Electron → 소프트웨어 진단 (OS 시스템 데이터 수집)

---

## Phase 4 — eventLogReader.js (Windows 이벤트 로그)

> **[!WARNING]** `ExecutionPolicy: Restricted` 환경에서는 `-ExecutionPolicy Bypass` 플래그 필요.
> Security 로그는 관리자 권한 필요 — System/Application 로그는 일반 권한으로 접근 가능.

```js
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// execSync 대신 exec + Promise — Get-WinEvent 수집 시 메인 프로세스 블로킹 방지
// 이벤트 1개일 때 ConvertTo-Json이 배열이 아닌 객체를 반환 → 정규화 필수
function normalizeJson(raw) {
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [parsed];
}

// Windows Event Log에서 최근 에러/경고 수집
async function getEventLogs(maxEvents = 30) {
  try {
    const ps = `
      Get-WinEvent -LogName System -MaxEvents ${maxEvents} |
      Where-Object { $_.Level -le 2 } |
      Select-Object TimeCreated, Id, LevelDisplayName, Message |
      ConvertTo-Json
    `;
    const { stdout } = await execAsync(
      `powershell -ExecutionPolicy Bypass -Command "${ps}"`,
      { encoding: 'utf8' }
    );
    return normalizeJson(stdout);
  } catch {
    return [];  // 권한 부족 또는 비-Windows 환경
  }
}

// Application 로그 (앱 크래시, 드라이버 오류)
async function getAppLogs(maxEvents = 20) {
  try {
    const ps = `
      Get-WinEvent -LogName Application -MaxEvents ${maxEvents} |
      Where-Object { $_.Level -le 2 } |
      Select-Object TimeCreated, Id, ProviderName, Message |
      ConvertTo-Json
    `;
    const { stdout } = await execAsync(
      `powershell -ExecutionPolicy Bypass -Command "${ps}"`,
      { encoding: 'utf8' }
    );
    return normalizeJson(stdout);
  } catch {
    return [];
  }
}

module.exports = { getEventLogs, getAppLogs };
```

---

## Phase 4 — processAnalyzer.js (고부하 프로세스)

```js
const si = require('systeminformation');

async function getTopProcesses(limit = 10) {
  const procs = await si.processes();

  // CPU 점유율 상위 N개
  const byCpu = [...procs.list]
    .sort((a, b) => b.cpu - a.cpu)
    .slice(0, limit)
    .map(p => ({ name: p.name, pid: p.pid, cpu: p.cpu.toFixed(1), mem: (p.mem / 1024).toFixed(0) }));

  // 메모리 점유율 상위 N개
  const byMem = [...procs.list]
    .sort((a, b) => b.mem - a.mem)
    .slice(0, limit)
    .map(p => ({ name: p.name, pid: p.pid, cpu: p.cpu.toFixed(1), mem: (p.mem / 1024).toFixed(0) }));

  return { byCpu, byMem, total: procs.all };
}

module.exports = { getTopProcesses };
```

---

## Phase 5 — DiagnosisController.java (/software 엔드포인트)

```java
@PostMapping("/software")
public ResponseEntity<DiagnosisResponse> diagnoseSoftware(
        @RequestBody SoftwareSnapshotRequest req) {

    // systemSnapshot: { cpuLoad, temperature, memory, topProcesses, eventLogs }
    String result = diagnosisService.diagnoseSoftware(req);
    return ResponseEntity.ok(new DiagnosisResponse(result));
}

// SoftwareSnapshotRequest DTO
public record SoftwareSnapshotRequest(
    String symptom,                                 // 사용자 입력 증상 텍스트 (필수)
    String cpuLoad,
    Map<String, Object> temperature,
    Map<String, Object> memory,
    List<Map<String, Object>> topProcesses,
    List<Map<String, Object>> eventLogs
) {}
```

---

## Phase 5 — HypothesisController.java (/hypotheses 엔드포인트)

```java
// POST /api/diagnosis/hypotheses
// 증상 텍스트 + 시스템 스냅샷 → Gemini 1차 판단 → track 분기 + 가설 A/B/C 목록 반환
@PostMapping("/hypotheses")
public ResponseEntity<HypothesisResponse> generateHypotheses(
        @RequestBody SoftwareSnapshotRequest req) {

    HypothesisResponse response = diagnosisService.generateHypotheses(req);
    return ResponseEntity.ok(response);
}

// HypothesisResponse DTO
public record HypothesisResponse(
    String track,                    // "metric" | "guide"
    List<Hypothesis> hypotheses
) {}

public record Hypothesis(
    String label,                    // "A", "B", "C"
    String title,                    // 가설 제목 (예: "GPU 과열 의심")
    String description,              // 근거 설명
    String action,                   // 사용자가 직접 해볼 수 있는 조치
    boolean requiresMonitoring       // true면 재현 모니터링 권장
) {}
```

---

## Phase 5 — SymptomInput.jsx (증상 입력 + 스냅샷 첨부)

```jsx
import { useState } from 'react';

// 증상 텍스트 입력 → 시스템 스냅샷 자동 첨부 → /api/diagnosis/hypotheses 호출
export default function SymptomInput({ systemSnapshot, onHypothesesReady }) {
  const [symptom, setSymptom] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!symptom.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/diagnosis/hypotheses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symptom, ...systemSnapshot }),
      });
      const data = await res.json();
      onHypothesesReady(data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>어떤 문제를 겪고 계신가요?</h2>
      <textarea
        value={symptom}
        onChange={e => setSymptom(e.target.value)}
        placeholder="예: 게임할 때 갑자기 버벅거리고 팬이 엄청 돌아요"
        rows={3}
        style={{ width: '100%' }}
      />
      <button onClick={submit} disabled={loading || !symptom.trim()}>
        {loading ? '분석 중...' : '진단 시작'}
      </button>
    </div>
  );
}
```

---

## Phase 5 — HypothesisList.jsx (가설 카드 + 트랙 분기)

```jsx
import { useState } from 'react';
import ReproductionMode from './ReproductionMode';

// hypotheses: HypothesisResponse { track, hypotheses[] }
export default function HypothesisList({ hypotheses, systemSnapshot }) {
  const [selectedHypothesis, setSelectedHypothesis] = useState(null);
  const [showReproduction, setShowReproduction] = useState(false);

  if (showReproduction) {
    return (
      <ReproductionMode
        hypothesis={selectedHypothesis}
        systemSnapshot={systemSnapshot}
        onBack={() => setShowReproduction(false)}
      />
    );
  }

  return (
    <div>
      <p>
        {hypotheses.track === 'metric'
          ? '재현 모니터링으로 정확한 원인을 확인할 수 있어요.'
          : '아래 체크리스트를 순서대로 시도해보세요.'}
      </p>

      {hypotheses.hypotheses.map(h => (
        <div key={h.label} style={{ border: '1px solid #333', borderRadius: 8, padding: 16, marginBottom: 12 }}>
          <h3>{h.label}. {h.title}</h3>
          <p>{h.description}</p>
          <p><strong>해볼 것:</strong> {h.action}</p>

          {h.requiresMonitoring && hypotheses.track === 'metric' && (
            <button onClick={() => { setSelectedHypothesis(h); setShowReproduction(true); }}>
              🔬 진단 모드로 확인하기
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
```

---

## Phase 5 — ReproductionMode.jsx (재현 모니터링)

```jsx
import { useState } from 'react';
import { useReproductionMonitor } from '../hooks/useReproductionMonitor';

// metric 트랙 전용: 베이스라인 저장 → 사용자가 문제 재현 → 델타 비교 → 서버 전송
export default function ReproductionMode({ hypothesis, systemSnapshot, onBack }) {
  const { phase, baseline, delta, startBaseline, startReproduction, stopReproduction } =
    useReproductionMonitor();
  const [result, setResult] = useState(null);

  const diagnose = async () => {
    const res = await fetch('/api/diagnosis/software', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symptom: hypothesis.title,
        selectedHypothesis: hypothesis.label,
        baseline,
        delta,
        ...systemSnapshot,
      }),
    });
    const data = await res.json();
    setResult(data.result);
  };

  if (result) {
    return (
      <div>
        <h3>진단 결과</h3>
        <p>{result}</p>
        <button onClick={onBack}>← 돌아가기</button>
      </div>
    );
  }

  return (
    <div>
      <h3>🔬 재현 모니터링</h3>
      <p><strong>선택된 가설:</strong> {hypothesis.title}</p>

      {phase === 'idle' && (
        <button onClick={startBaseline}>1단계: 베이스라인 측정 시작</button>
      )}
      {phase === 'baseline' && (
        <p>베이스라인 측정 중... 잠시 정상 상태로 대기해주세요.</p>
      )}
      {phase === 'ready' && (
        <>
          <p>✅ 베이스라인 저장됨. 이제 문제 상황을 재현해보세요.</p>
          <button onClick={startReproduction}>2단계: 재현 시작</button>
        </>
      )}
      {phase === 'reproducing' && (
        <>
          <p>⏺ 모니터링 중... 문제가 발생하면 종료하세요.</p>
          <button onClick={stopReproduction}>재현 종료 + 분석</button>
        </>
      )}
      {phase === 'done' && (
        <button onClick={diagnose}>AI 가설 확정 요청</button>
      )}

      <button onClick={onBack} style={{ marginTop: 12 }}>← 가설 목록으로</button>
    </div>
  );
}
```

---

## Phase 5 — useReproductionMonitor.js

```js
import { useState, useRef, useCallback } from 'react';

// 베이스라인 스냅샷 저장 → 재현 중 델타 수집 → phase 관리
// phase: 'idle' | 'baseline' | 'ready' | 'reproducing' | 'done'
export function useReproductionMonitor() {
  const [phase, setPhase] = useState('idle');
  const [baseline, setBaseline] = useState(null);
  const [delta, setDelta] = useState(null);
  const snapshotsRef = useRef([]);
  const intervalRef = useRef(null);

  const collectSnapshot = useCallback(async () => {
    const info = await window.electronAPI.getSystemInfo();
    snapshotsRef.current.push({ ...info, ts: Date.now() });
  }, []);

  const startBaseline = useCallback(async () => {
    setPhase('baseline');
    snapshotsRef.current = [];
    // 5초 동안 3회 수집
    await collectSnapshot();
    await new Promise(r => setTimeout(r, 2500));
    await collectSnapshot();
    setBaseline(snapshotsRef.current[snapshotsRef.current.length - 1]);
    snapshotsRef.current = [];
    setPhase('ready');
  }, [collectSnapshot]);

  const startReproduction = useCallback(() => {
    setPhase('reproducing');
    snapshotsRef.current = [];
    intervalRef.current = setInterval(collectSnapshot, 2000);
  }, [collectSnapshot]);

  const stopReproduction = useCallback(() => {
    clearInterval(intervalRef.current);
    setDelta(snapshotsRef.current);
    setPhase('done');
  }, []);

  return { phase, baseline, delta, startBaseline, startReproduction, stopReproduction };
}
```

---

## Phase 7 — VideoAnalysis.jsx (영상+오디오 통합 촬영)

```jsx
import { useRef, useState, useCallback } from 'react';

const INTERVAL_SEC = 1.5;
const MAX_FRAMES = 10;

// 영상 촬영과 오디오 녹음을 동시에 수행
// 비프음은 부팅 순간 단 한 번 울리므로 촬영 시작과 동시에 오디오도 함께 수집해야 포착 가능
// onFramesReady(frames, audioBlob) — audioBlob은 비프음/팬소음 포함, 없으면 null
export default function VideoAnalysis({ onFramesReady }) {
  const videoRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const framesRef = useRef([]);
  const intervalRef = useRef(null);
  const canvasRef = useRef(document.createElement('canvas'));
  const audioRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const stopRecording = useCallback(() => {
    clearInterval(intervalRef.current);
    audioRecorderRef.current?.stop();
    videoRef.current?.srcObject?.getTracks().forEach(t => t.stop());
    setRecording(false);
    // audioBlob은 recorder.onstop 콜백에서 비동기로 전달됨
  }, []);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || video.readyState < 2) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    framesRef.current.push(canvas.toDataURL('image/jpeg', 0.7));
    setFrameCount(framesRef.current.length);

    if (framesRef.current.length >= MAX_FRAMES) {
      stopRecording();
    }
  }, [stopRecording]);

  const start = async () => {
    framesRef.current = [];
    audioChunksRef.current = [];
    setFrameCount(0);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: true,
    });

    videoRef.current.srcObject = stream;
    setRecording(true);
    intervalRef.current = setInterval(captureFrame, INTERVAL_SEC * 1000);

    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
    const audioRecorder = new MediaRecorder(stream, { mimeType });
    audioRecorder.ondataavailable = e => audioChunksRef.current.push(e.data);
    audioRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
      onFramesReady(framesRef.current, audioBlob);
    };
    audioRecorder.start();
    audioRecorderRef.current = audioRecorder;
  };

  return (
    <div>
      <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%' }} />
      {recording && (
        <p>{frameCount}/{MAX_FRAMES} 프레임 수집 중... (매 {INTERVAL_SEC}초 샘플링 · 오디오 동시 녹음)</p>
      )}
      {!recording
        ? <button onClick={start}>🎥 촬영 시작 (영상+오디오)</button>
        : <button onClick={stopRecording}>⏹️ 촬영 종료 + 분석</button>
      }
    </div>
  );
}
```

> **[!NOTE]** 영상(프레임 배열)과 오디오(Blob)를 단일 액션으로 동시 수집.
> 비프음은 부팅 직후 발생하므로 촬영 시작 전 PC 전원을 켜는 게 아니라, **촬영 시작 후 PC 전원을 켜도록** UX 안내 문구가 필요.
> `onFramesReady(frames, audioBlob)` — 부모 컴포넌트에서 두 데이터를 함께 `/api/diagnosis/hardware`로 전송.

> **[!WARNING]** iOS Safari는 `audio/webm`을 지원하지 않습니다. `MediaRecorder.isTypeSupported` 분기로 `audio/mp4` 폴백 처리됨.
> Gemini API 전송 시 mime type도 실제 녹음 포맷과 반드시 일치시켜야 합니다.

---

## Phase 2 — Electron main.js (앱 진입점)

```js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,   // 보안: 필수
      nodeIntegration: false,   // 보안: 필수
    },
  });

  const isDev = process.env.NODE_ENV === 'development';
  win.loadURL(isDev ? 'http://localhost:3000' : `file://${path.join(__dirname, '../build/index.html')}`);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
```

---

## Phase 2 — preload.js (IPC 브리지)

```js
const { contextBridge, ipcRenderer } = require('electron');

// renderer(React)에서 window.electronAPI.* 로 접근
contextBridge.exposeInMainWorld('electronAPI', {
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  onSystemUpdate: (cb) => ipcRenderer.on('system-update', (_, data) => cb(data)),
  removeSystemListener: () => ipcRenderer.removeAllListeners('system-update'),
});
```

---

## Phase 3 — systemMonitor.js (systeminformation 수집)

```js
const si = require('systeminformation');
const { ipcMain } = require('electron');

// 1회 조회
ipcMain.handle('get-system-info', async () => {
  const [cpu, mem, graphics, temp] = await Promise.all([
    si.currentLoad(),          // CPU 사용률
    si.mem(),                  // 메모리
    si.graphics(),             // GPU 정보
    si.cpuTemperature(),       // CPU 온도 (관리자 권한 필요할 수 있음)
  ]);

  return {
    cpu: {
      load: cpu.currentLoad.toFixed(1),        // %
      cores: cpu.cpus.map(c => c.load.toFixed(1)),
    },
    memory: {
      used: (mem.used / 1024 ** 3).toFixed(1), // GB
      total: (mem.total / 1024 ** 3).toFixed(1),
    },
    gpu: graphics.controllers[0] ? {
      model: graphics.controllers[0].model,
      vram: graphics.controllers[0].vram,       // MB
    } : null,
    temperature: {
      cpu: temp.main ?? null,                   // °C
    },
  };
});

// 주기적 푸시 (2초마다)
function startMonitoring(win) {
  setInterval(async () => {
    const load = await si.currentLoad();
    win.webContents.send('system-update', {
      cpuLoad: load.currentLoad.toFixed(1),
    });
  }, 2000);
}

module.exports = { startMonitoring };
```

---

## Phase 3 — useSystemInfo.js (React 훅 — IPC 통합)

> **[!WARNING]** React 18 Strict Mode에서 `useEffect`가 2회 실행됩니다. `onSystemUpdate`의 `ipcRenderer.on()`이 이중 등록되어 콜백이 2번 호출될 수 있습니다. `on()` 직전에 `ipcRenderer.removeAllListeners('system-update')`를 선행 호출하세요.

```js
import { useState, useEffect } from 'react';

export function useSystemInfo() {
  const [sysInfo, setSysInfo] = useState(null);
  const isElectron = !!window.electronAPI;

  useEffect(() => {
    if (!isElectron) return;

    // 초기 1회 조회
    window.electronAPI.getSystemInfo().then(setSysInfo);

    // 실시간 업데이트 구독
    window.electronAPI.onSystemUpdate(data => {
      setSysInfo(prev => ({ ...prev, cpu: { ...prev?.cpu, load: data.cpuLoad } }));
    });

    return () => window.electronAPI.removeSystemListener();
  }, []);

  return { sysInfo, isElectron };
}
```

---

## Phase 2 — useRuntimeMode.js (Electron/PWA 감지)

```js
// preload.js가 window.electronAPI를 주입 → 존재 여부로 판별
// 'electron' | 'pwa'
export function useRuntimeMode() {
  return window.electronAPI ? 'electron' : 'pwa';
}
```

---

## Phase 2 — ScreenCapture.jsx (Desktop 화면 캡처)

```jsx
import { useRef, useState } from 'react';

export default function ScreenCapture({ onCapture }) {
  const videoRef = useRef(null);
  const [capturing, setCapturing] = useState(false);

  const startCapture = async () => {
    // HTTPS 또는 localhost에서만 동작
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 60 },
      audio: false,
    });
    videoRef.current.srcObject = stream;
    setCapturing(true);
  };

  const takeSnapshot = () => {
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
    onCapture(canvas.toDataURL('image/jpeg', 0.8));
  };

  const stopCapture = () => {
    videoRef.current?.srcObject?.getTracks().forEach(t => t.stop());
    setCapturing(false);
  };

  return (
    <div className="screen-capture">
      <video ref={videoRef} autoPlay muted style={{ width: '100%' }} />
      {!capturing
        ? <button onClick={startCapture}>🖥️ 화면 공유 시작</button>
        : <>
            <button onClick={takeSnapshot}>📸 스냅샷 진단</button>
            <button onClick={stopCapture}>⏹️ 중지</button>
          </>
      }
    </div>
  );
}
```

---

## Phase 3 — useFpsMonitor.js (실시간 FPS + 드랍 감지)

```js
import { useRef, useState, useCallback } from 'react';

export function useFpsMonitor() {
  const [fps, setFps] = useState(null);
  const [drops, setDrops] = useState([]); // { timestamp, fps, baseline, dropPercent }
  const rafRef = useRef(null);
  const lastTimeRef = useRef(performance.now());
  const frameCountRef = useRef(0);
  const fpsHistoryRef = useRef([]);  // 최근 10초 FPS 기록 — 동적 베이스라인 계산용

  const start = useCallback(() => {
    fpsHistoryRef.current = [];

    const tick = (now) => {
      frameCountRef.current++;
      const elapsed = now - lastTimeRef.current;

      if (elapsed >= 1000) {
        const currentFps = Math.round((frameCountRef.current * 1000) / elapsed);
        setFps(currentFps);

        const history = fpsHistoryRef.current;
        history.push(currentFps);
        if (history.length > 10) history.shift();

        // 절대값(30fps) 기준이 아닌 베이스라인 대비 20% 이상 드롭 시 기록
        // 예: 143fps → 100fps(30% 드롭) 감지 / 30fps → 25fps는 정상 범위로 처리
        if (history.length >= 5) {
          const baseline = history.slice(0, -1).reduce((a, b) => a + b, 0) / (history.length - 1);
          const dropRatio = (baseline - currentFps) / baseline;
          if (dropRatio > 0.2) {
            setDrops(prev => [...prev.slice(-19), {
              timestamp: new Date().toLocaleTimeString(),
              fps: currentFps,
              baseline: Math.round(baseline),
              dropPercent: Math.round(dropRatio * 100),
            }]);
          }
        }

        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  // Long Task 감지 (50ms 이상 메인 스레드 블로킹 — FPS 드롭 원인 단서)
  const observeLongTasks = useCallback(() => {
    if (!('PerformanceObserver' in window)) return;
    const observer = new PerformanceObserver(list => {
      list.getEntries().forEach(entry => {
        console.warn(`Long Task: ${entry.duration.toFixed(0)}ms`);
      });
    });
    observer.observe({ entryTypes: ['longtask'] });
    return () => observer.disconnect();
  }, []);

  return { fps, drops, start, stop, observeLongTasks };
}
```

> **[!NOTE]** `drops` 배열에 `baseline`과 `dropPercent`를 포함해 Gemini에 전달하면 GPU 병목·CPU 과부하·드라이버 충돌 등 원인 추론이 가능합니다.
> FPS 단독 데이터보다 `systemSnapshot`(CPU/GPU 메트릭)과 함께 전송할 때 진단 정확도가 높아집니다.

---

## Phase 3 — FpsDashboard.jsx

```jsx
import { useEffect } from 'react';
import { useFpsMonitor } from '../hooks/useFpsMonitor';

export default function FpsDashboard({ onDiagnoseRequest }) {
  const { fps, drops, start, stop, observeLongTasks } = useFpsMonitor();

  useEffect(() => {
    start();
    const cleanup = observeLongTasks();
    return () => { stop(); cleanup?.(); };
  }, []);

  const fpsColor = fps >= 50 ? '#00FF88' : fps >= 30 ? '#FFA500' : '#FF4444';

  return (
    <div className="fps-dashboard">
      <div className="fps-gauge" style={{ color: fpsColor }}>
        <span className="fps-value">{fps}</span>
        <span className="fps-label">FPS</span>
      </div>

      {drops.length > 0 && (
        <div className="drop-log">
          <h4>⚠️ 프레임 드랍 감지됨</h4>
          {drops.map((d, i) => (
            <div key={i}>{d.timestamp} — {d.fps}fps</div>
          ))}
          <button onClick={() => onDiagnoseRequest(drops)}>
            AI에게 원인 분석 요청
          </button>
        </div>
      )}
    </div>
  );
}
```

---

## Phase 6 — manifest.json (PWA)

```json
{
  "name": "옆집 컴공생",
  "short_name": "NextDoor CS",
  "description": "AI 하드웨어 진단 서비스",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1a1a2e",
  "theme_color": "#00FF88",
  "orientation": "any",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

## Phase 6 — Service Worker (sw.js)

```js
// WARNING: 배포마다 버전을 올려야 합니다 (nextdoorcs-v2, v3...). 고정 시 구버전 캐시가 새 API와 충돌합니다.
const CACHE = 'nextdoorcs-v1';
const PRECACHE = ['/', '/index.html', '/opencv.js'];

self.addEventListener('install', e =>
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)))
);

self.addEventListener('fetch', e => {
  // API 요청은 항상 네트워크 우선
  if (e.request.url.includes('/api/')) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
```

---

## Phase 1 — GeminiService.java

```java
@Service
@RequiredArgsConstructor
public class GeminiService {

    @Value("${gemini.api.key}")
    private String apiKey;

    private static final String GEMINI_URL =
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent";

    private final RestTemplate restTemplate;

    public String diagnoseImage(String base64Image, String symptomText) {
        Map<String, Object> requestBody = Map.of(
            "contents", List.of(Map.of(
                "parts", List.of(
                    Map.of("text", "증상: " + symptomText),
                    Map.of("inline_data", Map.of(
                        "mime_type", "image/jpeg",
                        "data", base64Image
                    ))
                )
            ))
        );

        String url = GEMINI_URL + "?key=" + apiKey;
        Map<String, Object> response = restTemplate.postForObject(url, requestBody, Map.class);
        return extractText(response);
    }

    // Phase 8 확장: 이미지 + 오디오 멀티모달
    // audioMimeType: 프론트엔드에서 실제 녹음된 포맷 전달 필수 ("audio/webm" | "audio/mp4")
    // iOS Safari는 audio/mp4만 지원하므로 하드코딩 금지
    public String diagnoseMultimodal(String base64Image, byte[] audioBytes, String audioMimeType, String symptom) {
        List<Map<String, Object>> parts = new ArrayList<>(List.of(
            Map.of("text", "증상: " + symptom),
            Map.of("inline_data", Map.of("mime_type", "image/jpeg", "data", base64Image))
        ));
        if (audioBytes != null && audioMimeType != null) {
            parts.add(Map.of("inline_data", Map.of(
                "mime_type", audioMimeType,
                "data", Base64.getEncoder().encodeToString(audioBytes)
            )));
        }
        Map<String, Object> requestBody = Map.of(
            "contents", List.of(Map.of("parts", parts))
        );
        return extractText(restTemplate.postForObject(GEMINI_URL + "?key=" + apiKey, requestBody, Map.class));
    }

    // WARNING: null 방어 없음 — API 오류(404/401)/모델 미존재/빈 응답 시 NPE 또는 ClassCastException 발생
    // Phase 1 구현 시 response null 체크 후 DiagnosisException 처리 필수
    private String extractText(Map<String, Object> response) {
        var candidates = (List<Map<String, Object>>) response.get("candidates");
        var content = (Map<String, Object>) candidates.get(0).get("content");
        var parts = (List<Map<String, Object>>) content.get("parts");
        return (String) parts.get(0).get("text");
    }
}
```

## Phase 1 — DiagnosisController.java

```java
@RestController
@RequestMapping("/api/diagnosis")
@RequiredArgsConstructor
public class DiagnosisController {

    private final DiagnosisService diagnosisService;

    // 이미지 단독 진단 (오디오 없는 경우 — /hardware의 단순 버전)
    @PostMapping("/hardware/image-only")
    public ResponseEntity<DiagnosisResponse> diagnoseImageOnly(
            @RequestParam("image") MultipartFile image,
            @RequestParam("symptom") String symptom) throws IOException {

        String base64 = Base64.getEncoder().encodeToString(image.getBytes());
        String result = diagnosisService.diagnose(base64, symptom);
        return ResponseEntity.ok(new DiagnosisResponse(result));
    }

    @PostMapping("/hardware")
    public ResponseEntity<DiagnosisResponse> diagnoseHardware(
            @RequestParam("image") MultipartFile image,
            @RequestParam(value = "audio", required = false) MultipartFile audio,
            @RequestParam(value = "audioMimeType", required = false) String audioMimeType,
            @RequestParam("symptom") String symptom) throws IOException {

        String base64Image = Base64.getEncoder().encodeToString(image.getBytes());
        byte[] audioBytes = audio != null ? audio.getBytes() : null;
        String result = diagnosisService.diagnoseMultimodal(base64Image, audioBytes, audioMimeType, symptom);
        return ResponseEntity.ok(new DiagnosisResponse(result));
    }
}
```

## Phase 6 — CameraView.jsx (기본)

```jsx
import { useRef, useState, useEffect } from 'react';

export default function CameraView({ onCapture }) {
  const videoRef = useRef(null);
  const [streaming, setStreaming] = useState(false);

  const startCamera = async () => {
    // facingMode: 'environment' — 모바일에서 후면(PC 촬영용) 카메라 우선 사용
    // { video: true }만 쓰면 전면(셀카) 카메라가 열릴 수 있음
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    });
    videoRef.current.srcObject = stream;
    setStreaming(true);
  };

  const capture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
    onCapture(canvas.toDataURL('image/jpeg'));
  };

  // 컴포넌트 언마운트 시 스트림 정리 — 카메라 LED 계속 켜져 있는 문제 방지
  useEffect(() => {
    return () => {
      videoRef.current?.srcObject?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <div className="camera-view">
      <video ref={videoRef} autoPlay playsInline muted />
      {!streaming
        ? <button onClick={startCamera}>카메라 켜기</button>
        : <button onClick={capture}>📸 촬영</button>
      }
    </div>
  );
}
```

---

## Phase 6 — useOpenCV.js

```js
import { useEffect, useState } from 'react';

export function useOpenCV() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.cv) { setReady(true); return; }
    const script = document.createElement('script');
    script.src = '/opencv.js';
    script.async = true;
    script.onload = () => {
      window.cv['onRuntimeInitialized'] = () => setReady(true);
    };
    document.body.appendChild(script);
  }, []);

  return ready;
}
```

## Phase 2 — OpenCV 오버레이 루프 (CameraView.jsx 확장)

> **[!WARNING]** `[src, gray, edges, contours, hierarchy].forEach(m => m.delete())`는 예외 발생 시 실행되지 않습니다.
> `findContours` 실패 등 예외 발생 시 WASM 힙에 Mat 5개가 누수됩니다. JS GC는 WASM 힙을 회수하지 못하므로 반드시 `try/finally`로`.delete()`를 보장하세요.

```js
// requestAnimationFrame 루프에서 매 프레임 실행
function processFrame(videoEl, canvasEl) {
  const cv = window.cv;
  const ctx = canvasEl.getContext('2d');

  ctx.drawImage(videoEl, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);

  const src = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
  cv.Canny(gray, edges, 50, 150);
  cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  for (let i = 0; i < contours.size(); i++) {
    const rect = cv.boundingRect(contours.get(i));
    if (rect.width > 100 && rect.height > 100) {
      ctx.strokeStyle = '#00FF88';
      ctx.lineWidth = 2;
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
      ctx.fillStyle = '#00FF88';
      ctx.font = '14px sans-serif';
      ctx.fillText('부품 감지됨', rect.x, rect.y - 6);
    }
  }

  [src, gray, edges, contours, hierarchy].forEach(m => m.delete());
}
```

---

## Phase 3 — ManualToolProvider.java

```java
@Component
public class ManualToolProvider {

    private final ManualRepository manualRepository;

    @Tool(description = "메인보드 모델명과 에러 코드로 제조사 매뉴얼에서 해결법을 검색합니다.")
    public String get_manual_info(
            @ToolParam(description = "제품 모델명, 예: ASUS-B760-PLUS") String model_name,
            @ToolParam(description = "에러 코드 또는 비프음 패턴, 예: 3long1short") String error_code) {

        return manualRepository.findByModelAndErrorCode(model_name, error_code)
            .map(ManualEntry::getSolution)
            .orElse("해당 모델의 매뉴얼 정보를 찾을 수 없습니다.");
    }
}
```

## Phase 3 — RepairAgent.java (Spring AI)

```java
@Service
@RequiredArgsConstructor
public class RepairAgent {

    private final ChatClient chatClient;
    private final ManualToolProvider manualTool;

    private static final String SYSTEM_PROMPT = """
        당신은 '옆집 컴공생' AI입니다.
        말투: 친근한 공대생처럼. 기술 근거는 정확하게.
        답변 형식: "여기[부품/프로세스]에 문제가 있는 것 같아요. 해결방법은 ~~ 입니다."
        가격/비용 정보는 포함하지 않음.
        """;

    public String diagnoseWithTools(String base64Image, String symptom) {
        // Spring AI 1.x: @Tool 어노테이션이 달린 빈 객체를 직접 전달
        // ToolCallbacks.from() 또는 빈 인스턴스 목록으로 등록
        return chatClient.prompt()
            .system(SYSTEM_PROMPT)
            .user(u -> u
                .text("증상: " + symptom)
                .media(MimeTypeUtils.IMAGE_JPEG,
                    new ByteArrayResource(Base64.getDecoder().decode(base64Image)))
            )
            .tools(ToolCallbacks.from(manualTool))  // Spring AI 1.x 공식 패턴
            .call()
            .content();
    }
}
// 참고: Spring AI 버전에 따라 .tools() 인자가 다를 수 있음
// - 1.0.x: ToolCallbacks.from(Object... beans)
// - 구버전: FunctionCallback 방식
// 실제 사용 버전의 JavaDoc 확인 권장
```

---

## Phase 8 — AudioCapture.jsx (화면 없음 전용 — 오디오만 녹음)

> **[!NOTE]** 이 컴포넌트는 PC가 완전히 켜지지 않아 카메라로 찍을 화면이 없는 경우 전용입니다.
> 일반적인 비프음/팬소음 진단은 `VideoAnalysis.jsx`의 통합 촬영을 사용하세요.
> 사용 케이스: 전원 버튼을 눌러도 아무 화면이 없고 비프음만 들리는 상황.

> **[!WARNING]** iOS Safari는 `audio/webm`을 지원하지 않습니다.
> `MediaRecorder.isTypeSupported('audio/webm')` 분기로 `audio/mp4` 폴백 처리 필수.
> Gemini API 전송 시 mime type도 실제 녹음 포맷과 반드시 일치시켜야 합니다.

```jsx
import { useRef, useState } from 'react';

export default function AudioCapture({ onAudioReady }) {
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [recording, setRecording] = useState(false);

  const start = async () => {
    chunksRef.current = [];
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = e => chunksRef.current.push(e.data);
    recorder.onstop = () => {
      onAudioReady(new Blob(chunksRef.current, { type: mimeType }), mimeType);
      stream.getTracks().forEach(t => t.stop());
    };
    recorder.start();
    recorderRef.current = recorder;
    setRecording(true);
  };

  const stop = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  return (
    <div>
      <p style={{ fontSize: '0.9rem', color: '#666' }}>
        화면이 전혀 없고 소리만 들리는 경우 사용하세요.
      </p>
      {!recording
        ? <button onClick={start}>🎙️ 비프음 녹음 시작</button>
        : <button onClick={stop} style={{ color: 'red' }}>⏹️ 녹음 중지</button>
      }
    </div>
  );
}
```

---

## pom.xml 핵심 의존성

> **의존성 전략**: Phase 1~2는 Gemini REST API 직접 호출 (API Key만 필요).
> Phase 3에서 Spring AI MCP 툴 연동 시 `spring-ai-mcp-spring-boot-starter` 추가.
> Vertex AI starter는 GCP 계정 + 인증 필요 → **직접 REST 방식으로 통일**.

```xml
<!-- Web (REST 직접 호출 방식 — Phase 1~2) -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>

<!-- Spring AI Core + MCP (Phase 3 이후) -->
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-core</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-mcp-spring-boot-starter</artifactId>
</dependency>

<!-- JPA + PostgreSQL (Phase 5) -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-jpa</artifactId>
</dependency>
<dependency>
    <groupId>org.postgresql</groupId>
    <artifactId>postgresql</artifactId>
</dependency>

<!-- Spring AI BOM (버전 관리 — dependencyManagement에 추가) -->
<!--
<dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>org.springframework.ai</groupId>
      <artifactId>spring-ai-bom</artifactId>
      <version>1.0.0</version>
      <type>pom</type>
      <scope>import</scope>
    </dependency>
  </dependencies>
</dependencyManagement>
-->
```

## docker-compose.yml

```yaml
version: '3.8'
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: nextdoorcs
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"

  backend:
    build: ./backend
    ports:
      - "8080:8080"
    environment:
      GEMINI_API_KEY: ${GEMINI_API_KEY}
      SPRING_DATASOURCE_URL: jdbc:postgresql://db:5432/nextdoorcs
      SPRING_DATASOURCE_USERNAME: postgres
      SPRING_DATASOURCE_PASSWORD: password
    depends_on:
      - db

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      REACT_APP_API_URL: http://localhost:8080
```

---

## Phase 11 — WebSocketConfig.java (STOMP 설정)

```java
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        config.enableSimpleBroker("/topic");
        config.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
            .setAllowedOriginPatterns("*")
            .withSockJS();
    }
}
```

---

## Phase 11 — DiagnosisSession.java (세션 엔티티)

```java
@Entity
@Table(name = "diagnosis_session")
@Getter @Builder
@NoArgsConstructor @AllArgsConstructor
public class DiagnosisSession {

    @Id
    private String sessionId;          // UUID — QR 코드에 인코딩

    @Enumerated(EnumType.STRING)
    private SessionStatus status;      // WAITING / SW_READY / HW_READY / DIAGNOSING / DONE

    @Column(columnDefinition = "TEXT")
    private String swSnapshot;         // Electron 수집 소프트웨어 스냅샷 (JSON)

    @Column(columnDefinition = "TEXT")
    private String hwFrames;           // PWA 수집 하드웨어 프레임 (Base64 JSON 배열)

    @Column(columnDefinition = "TEXT")
    private String diagnosisResult;    // 통합 진단 결과

    private LocalDateTime expiresAt;   // 세션 만료 시각 (생성 후 5분)

    @CreationTimestamp
    private LocalDateTime createdAt;

    public enum SessionStatus {
        WAITING, SW_READY, HW_READY, DIAGNOSING, DONE
    }
}
```

---

## Phase 11 — SessionController.java

```java
@RestController
@RequestMapping("/api/session")
@RequiredArgsConstructor
public class SessionController {

    private final SessionService sessionService;
    private final SimpMessagingTemplate messagingTemplate;

    // Electron: 세션 생성 + QR용 sessionId 반환
    @PostMapping("/create")
    public ResponseEntity<Map<String, String>> createSession() {
        String sessionId = sessionService.create();
        return ResponseEntity.ok(Map.of("sessionId", sessionId));
    }

    // Electron: 소프트웨어 스냅샷 제출
    @PostMapping("/{sessionId}/sw")
    public ResponseEntity<Void> submitSoftware(
            @PathVariable String sessionId,
            @RequestBody SoftwareSnapshotRequest req) {
        sessionService.saveSoftwareSnapshot(sessionId, req);
        messagingTemplate.convertAndSend("/topic/session/" + sessionId,
            Map.of("event", "SW_READY"));
        sessionService.triggerDiagnosisIfReady(sessionId);
        return ResponseEntity.ok().build();
    }

    // PWA: 하드웨어 프레임 제출
    @PostMapping("/{sessionId}/hw")
    public ResponseEntity<Void> submitHardware(
            @PathVariable String sessionId,
            @RequestBody HardwareFramesRequest req) {
        sessionService.saveHardwareFrames(sessionId, req);
        messagingTemplate.convertAndSend("/topic/session/" + sessionId,
            Map.of("event", "HW_READY"));
        sessionService.triggerDiagnosisIfReady(sessionId);
        return ResponseEntity.ok().build();
    }

    // 세션 상태 폴링 (QR 스캔 전 Electron 대기용)
    @GetMapping("/{sessionId}/status")
    public ResponseEntity<Map<String, String>> getStatus(@PathVariable String sessionId) {
        return ResponseEntity.ok(Map.of("status", sessionService.getStatus(sessionId)));
    }
}
```

---

## Phase 11 — QRDisplay.jsx (Electron — QR 생성 + 스캔 대기)

```jsx
import { useEffect, useState } from "react";
import QRCode from "react-qr-code";

// Electron에서 세션 생성 후 QR 표시. PWA가 스캔하면 상태 변경 감지.
// REACT_APP_API_URL: 백엔드 서버 주소 (예: https://nextdoorcs-backend.onrender.com)
// Electron에서 window.location.origin은 file:// 또는 app:// → QR URL로 사용 불가
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8080';
const PWA_BASE = process.env.REACT_APP_PWA_URL || 'http://localhost:3000';

export default function QRDisplay({ onSessionReady }) {
  const [sessionId, setSessionId] = useState(null);
  const [status, setStatus] = useState("WAITING");

  useEffect(() => {
    fetch(`${API_BASE}/api/session/create`, { method: "POST" })
      .then((r) => r.json())
      .then(({ sessionId }) => setSessionId(sessionId));
  }, []);

  // PWA 스캔 감지: 1초 폴링 (WebSocket 연결 전 초기 대기)
  useEffect(() => {
    if (!sessionId || status !== "WAITING") return;
    const interval = setInterval(() => {
      fetch(`${API_BASE}/api/session/${sessionId}/status`)
        .then((r) => r.json())
        .then(({ status }) => {
          setStatus(status);
          if (status !== "WAITING") {
            clearInterval(interval);
            onSessionReady(sessionId);
          }
        });
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionId, status]);

  // QR에는 PWA URL + sessionId 인코딩 — 모바일이 스캔해서 접속할 수 있는 주소
  const qrValue = sessionId ? `${PWA_BASE}/scan?session=${sessionId}` : "";

  return (
    <div className="qr-display">
      {sessionId ? (
        <>
          <QRCode value={qrValue} size={200} />
          <p>모바일로 QR을 스캔해 하드웨어 진단을 시작하세요</p>
          <p className="status">상태: {status}</p>
        </>
      ) : (
        <p>세션 생성 중...</p>
      )}
    </div>
  );
}
```

---

## Phase 11 — QRScanner.jsx (PWA — QR 스캔 + 세션 참여)

```jsx
import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

// BarcodeDetector 미지원 시 jsQR 폴백 자동 적용
export default function QRScanner({ onSessionJoined }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const [scanning, setScanning] = useState(false);

  const startScan = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });
    videoRef.current.srcObject = stream;
    setScanning(true);
  };

  useEffect(() => {
    if (!scanning) return;

    const scan = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(scan);
        return;
      }
      const ctx = canvas.getContext("2d");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);

      if (code) {
        const url = new URL(code.data);
        const sessionId = url.searchParams.get("session");
        if (sessionId) {
          video.srcObject?.getTracks().forEach((t) => t.stop());
          cancelAnimationFrame(rafRef.current);
          onSessionJoined(sessionId);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(scan);
    };

    rafRef.current = requestAnimationFrame(scan);
    return () => {
      cancelAnimationFrame(rafRef.current);
      videoRef.current?.srcObject?.getTracks().forEach((t) => t.stop());
    };
  }, [scanning]);

  return (
    <div className="qr-scanner">
      <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%" }} />
      <canvas ref={canvasRef} style={{ display: "none" }} />
      {!scanning && (
        <button onClick={startScan}>QR 코드 스캔으로 세션 연결</button>
      )}
    </div>
  );
}
```

---

## Phase 11 — useSessionSync.js (WebSocket STOMP 구독 훅)

```js
import { useEffect, useRef, useState } from "react";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";

// sessionId 기반 WebSocket 구독. 진단 완료 이벤트 수신.
export default function useSessionSync(sessionId) {
  const [event, setEvent] = useState(null);
  const clientRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  const connect = useCallback(() => {
    // 이전 client가 살아있으면 먼저 비활성화 — 재연결 시 중복 client 방지
    clientRef.current?.deactivate();

    const client = new Client({
      webSocketFactory: () => new SockJS("/ws"),
      onConnect: () => {
        client.subscribe(`/topic/session/${sessionId}`, (msg) => {
          setEvent(JSON.parse(msg.body));
        });
      },
      // Render 무료 티어 슬립 후 재연결 — reconnectDelay로 STOMP 내장 재연결 사용
      reconnectDelay: 3000,
    });
    client.activate();
    clientRef.current = client;
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    connect();
    return () => {
      clearTimeout(reconnectTimerRef.current);
      clientRef.current?.deactivate();
    };
  }, [sessionId, connect]);

  return event;
}
```

---

## Phase 11 — render.yaml (Render 자동 배포)

```yaml
services:
  - type: web
    name: nextdoorcs-backend
    runtime: java
    buildCommand: cd backend && ./mvnw clean package -DskipTests
    startCommand: java $JAVA_OPTS -jar backend/target/*.jar
    healthCheckPath: /actuator/health
    envVars:
      - key: JAVA_OPTS
        value: -Xmx350m -Xss512k -XX:MaxMetaspaceSize=100m
      - key: GEMINI_API_KEY
        sync: false
      - key: SPRING_DATASOURCE_URL
        sync: false
      - key: SPRING_DATASOURCE_USERNAME
        sync: false
      - key: SPRING_DATASOURCE_PASSWORD
        sync: false
      - key: ALLOWED_ORIGINS
        sync: false
```

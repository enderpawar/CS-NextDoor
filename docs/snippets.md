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

## Phase 5 — SymptomInput.tsx (증상 입력 + 스냅샷 첨부)

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

## Phase 5 — HypothesisList.tsx (가설 카드 + 트랙 분기)

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

## Phase 5 — ReproductionMode.tsx (재현 모니터링)

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

## Phase 7 — VideoAnalysis.tsx (영상+오디오 통합 촬영)

> **[!NOTE]** 영상(프레임 배열)과 오디오(Blob)를 단일 액션으로 동시 수집.
> 비프음은 부팅 직후 발생하므로 촬영 시작 전 PC 전원을 켜는 게 아니라, **촬영 시작 후 PC 전원을 켜도록** UX 안내 문구가 필요.

> **[!WARNING]** iOS Safari는 `audio/webm`을 지원하지 않습니다. `MediaRecorder.isTypeSupported` 분기로 `audio/mp4` 폴백 처리됨.
> Gemini API 전송 시 mime type도 실제 녹음 포맷과 반드시 일치시켜야 합니다.

프레임 선별 전략 변경:
- **기존**: 1.5초 간격으로 10개 캡처 → 전부 전송
- **변경**: 1초 간격으로 15개 캡처 → 흔들림 프레임 자동 제외(Laplacian) → 이상도 상위 5개만 Gemini 전송

`onFramesReady(frames, audioBlob, mimeType, scoreSummary)`
- `frames`: Base64 JPEG 배열 (최대 5개, 이상도 내림차순)
- `scoreSummary`: `{ total, sent, blurDiscarded, max, avg, frameScores }` — 발표용 정량 데이터

```jsx
import { useRef, useState, useCallback } from 'react';
import { processFrame } from '../mobile/CameraView';

const CAPTURE_TOTAL = 15;
const SEND_TOP      = 5;
const INTERVAL_SEC  = 1.0;

export default function VideoAnalysis({ onFramesReady }) {
  const videoRef         = useRef(null);
  const canvasRef        = useRef(document.createElement('canvas'));
  const intervalRef      = useRef(null);
  const audioRecorderRef = useRef(null);
  const audioChunksRef   = useRef([]);
  const candidatesRef    = useRef([]); // { dataUrl, qualityScore, blurScore }
  // ref로 관리 — setInterval 클로저 stale 방지
  const blurCountRef     = useRef(0);
  const readyCountRef    = useRef(0);

  const [recording, setRecording]       = useState(false);
  const [captureCount, setCaptureCount] = useState(0);
  const [blurCount, setBlurCount]       = useState(0); // 표시 전용

  const stopRecording = useCallback(() => {
    clearInterval(intervalRef.current);
    audioRecorderRef.current?.stop();
    videoRef.current?.srcObject?.getTracks().forEach(t => t.stop());
    setRecording(false);
  }, []);

  const captureAndScore = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || video.readyState < 2) return;

    // 크기가 변경된 경우에만 재설정 — 동일값 대입도 canvas buffer flush 유발
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    const result = processFrame(video, canvas, readyCountRef.current);

    if (result.guidance === 'stabilize') {
      blurCountRef.current += 1;
      setBlurCount(blurCountRef.current); // 표시 동기화
    } else {
      if (result.isReadyToCapture) readyCountRef.current = 0; // 자동 촬영 후 리셋
      else readyCountRef.current = result.guidance === 'ready' ? readyCountRef.current + 1 : 0;

      candidatesRef.current.push({
        dataUrl: canvas.toDataURL('image/jpeg', 0.7),
        qualityScore: result.qualityScore,
        blurScore: result.blurScore,
      });
      setCaptureCount(c => c + 1);
    }

    if (candidatesRef.current.length + blurCountRef.current >= CAPTURE_TOTAL) stopRecording();
  }, [stopRecording]); // blurCountRef는 ref이므로 의존성 불필요

  const start = async () => {
    candidatesRef.current  = [];
    audioChunksRef.current = [];
    blurCountRef.current   = 0;
    readyCountRef.current  = 0;
    setCaptureCount(0);
    setBlurCount(0);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: true,
    });
    videoRef.current.srcObject = stream;
    setRecording(true);
    intervalRef.current = setInterval(captureAndScore, INTERVAL_SEC * 1000);

    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
    const audioRecorder = new MediaRecorder(stream, { mimeType });
    audioRecorder.ondataavailable = e => audioChunksRef.current.push(e.data);
    audioRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

      // qualityScore 내림차순 → 상위 SEND_TOP개 선택
      const sorted   = [...candidatesRef.current].sort((a, b) => b.qualityScore - a.qualityScore);
      const selected = sorted.slice(0, SEND_TOP);
      const scores   = candidatesRef.current.map(f => f.qualityScore);

      const scoreSummary = {
        total: candidatesRef.current.length,
        sent: selected.length,
        blurDiscarded: blurCountRef.current, // ref 참조 — stale 없음
        max: scores.length ? Math.max(...scores) : 0,
        avg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
        frameScores: sorted.map(f => ({ score: f.qualityScore.toFixed(1), blur: f.blurScore.toFixed(0) })),
      };

      onFramesReady(selected.map(f => f.dataUrl), audioBlob, mimeType, scoreSummary);
    };
    audioRecorder.start();
    audioRecorderRef.current = audioRecorder;
  };

  const progress = Math.round(((captureCount + blurCount) / CAPTURE_TOTAL) * 100);

  return (
    <div>
      <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%' }} />
      {recording && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span>선명 프레임 {captureCount}개</span>
            <span>흔들림 제외 {blurCount}개</span>
            <span>{progress}%</span>
          </div>
          <p style={{ fontSize: 12, color: '#6b7684' }}>
            OpenCV 채점 중 — 이상도 상위 {SEND_TOP}개 프레임을 AI로 전송합니다
          </p>
        </div>
      )}
      {!recording
        ? <button onClick={start}>🎥 촬영 시작 (영상+오디오)</button>
        : <button onClick={stopRecording}>⏹️ 촬영 종료 + 분석</button>
      }
    </div>
  );
}
```

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
      // TS 빌드 후 .js로 컴파일됨
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

## Phase 2 — useRuntimeMode.ts (Electron/PWA 감지)

```js
// preload.js가 window.electronAPI를 주입 → 존재 여부로 판별
// 'electron' | 'pwa'
export function useRuntimeMode() {
  return window.electronAPI ? 'electron' : 'pwa';
}
```

---

## Phase 2 — ScreenCapture.tsx (Desktop 화면 캡처)

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
        ? <button onClick={startCapture}> 화면 공유 시작</button>
        : <>
            <button onClick={takeSnapshot}> 스냅샷 진단</button>
            <button onClick={stopCapture}>⏹ 중지</button>
          </>
      }
    </div>
  );
}
```

---

## Phase 3 — useFpsMonitor.ts (실시간 FPS + 드랍 감지)

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

## Phase 3 — FpsDashboard.tsx

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

## Phase 6 — CameraView.tsx (기본)

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

## Phase 6 — useOpenCV.ts

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

## Phase 7 — OpenCV 실시간 촬영 가이드 (CameraView.tsx 확장)

> **[!WARNING]** Mat 객체는 예외 발생 시에도 반드시 해제해야 합니다. JS GC는 WASM 힙을 회수하지 못하므로 반드시 `try/finally`로 `.delete()`를 보장하세요.

### 설계 방향

OpenCV를 "조용한 프레임 필터"가 아닌 **사용자에게 직접 보이는 실시간 촬영 가이드**로 사용합니다.
발표 시 "OpenCV로 이걸 했습니다"가 화면에 보여야 합니다.

### guidance 상태 흐름

```
카메라 켜짐
    ↓
[CLAHE → Laplacian]  blurScore < 100  → 'stabilize' → "카메라를 고정해 주세요"
    ↓ 선명
[Canny → findContours]  감지 없음      → 'no_target' → "PC 내부를 향해주세요"
    ↓ 감지됨
[최대 컨투어 면적]  < 프레임의 5%      → 'too_far'   → "더 가까이 찍어주세요"
    ↓ 충분
[3프레임 연속 통과]                    → 'ready'     → "좋아요! 자동 촬영합니다"
```

`ready` 상태가 **3프레임 연속** 유지되면 자동 촬영 트리거 — 사용자가 버튼을 누를 필요 없음.

### 반환 타입

```ts
type Guidance = 'stabilize' | 'no_target' | 'too_far' | 'ready';

interface FrameAnalysis {
  guidance: Guidance;
  guidanceText: string;
  qualityScore: number;      // 0~100, 종합 품질 점수 (선명도 50% + 커버리지 50%)
  blurScore: number;
  coverageRatio: number;     // 최대 컨투어 면적 / 전체 프레임 면적
  isReadyToCapture: boolean; // guidance === 'ready'
}
```

### processFrame 구현

```ts
declare const cv: any; // OpenCV.js WASM — 공식 TS 타입 미지원

const BLUR_THRESHOLD    = 100;  // Laplacian 분산 기준값
const COVERAGE_MIN      = 0.05; // 최대 컨투어가 프레임의 5% 이상이어야 "충분히 가까움"
const READY_FRAMES_NEEDED = 3;  // 자동 촬영까지 연속 통과 필요 프레임 수

// 연속 ready 카운터 — processFrame 외부에서 관리 (useRef)
// readyCountRef: React.MutableRefObject<number>

function processFrame(
  videoEl: HTMLVideoElement,
  canvasEl: HTMLCanvasElement,
  readyCount: number,         // 현재 연속 ready 프레임 수
): FrameAnalysis {
  const ctx = canvasEl.getContext('2d')!;
  ctx.drawImage(videoEl, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
  const frameArea = canvasEl.width * canvasEl.height;

  const src       = cv.matFromImageData(imageData);
  const gray      = new cv.Mat();
  const blurred   = new cv.Mat();
  const edges     = new cv.Mat();
  const contours  = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const lap       = new cv.Mat();
  const mean      = new cv.Mat();
  const stddev    = new cv.Mat();

  try {
    // ── Step 1: 그레이스케일 + CLAHE (조명 불균일 보정) ─────────────────
    // CLAHE는 파라미터 고정 → 구현 시 useRef로 1회 생성 후 재사용, 언마운트 시 delete()
    // (스니펫에서는 단순성을 위해 매 프레임 생성으로 표기)
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
    clahe.apply(gray, gray);
    clahe.delete();

    // ── Step 2: Laplacian 분산 — 블러 감지 ──────────────────────────────
    // 분산이 작을수록 흐릿한 프레임 (고주파 성분 부족)
    cv.Laplacian(gray, lap, cv.CV_32F);
    cv.meanStdDev(lap, mean, stddev);
    const blurScore = stddev.doubleAt(0, 0) ** 2;

    if (blurScore < BLUR_THRESHOLD) {
      drawGuidanceOverlay(ctx, canvasEl, 'stabilize', '카메라를 고정해 주세요', 0);
      return { guidance: 'stabilize', guidanceText: '카메라를 고정해 주세요',
               qualityScore: 0, blurScore, coverageRatio: 0, isReadyToCapture: false };
    }

    // ── Step 3: GaussianBlur + Canny + findContours ──────────────────────
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 50, 150);
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    if (contours.size() === 0) {
      drawGuidanceOverlay(ctx, canvasEl, 'no_target', 'PC 내부를 향해주세요', 0);
      return { guidance: 'no_target', guidanceText: 'PC 내부를 향해주세요',
               qualityScore: 0, blurScore, coverageRatio: 0, isReadyToCapture: false };
    }

    // ── Step 4: 최대 컨투어 면적으로 거리 판단 ──────────────────────────
    // 가장 큰 컨투어 = 가장 가까운 주요 부품 영역
    let maxArea = 0;
    let maxIdx  = 0;
    for (let i = 0; i < contours.size(); i++) {
      const area = cv.contourArea(contours.get(i));
      if (area > maxArea) { maxArea = area; maxIdx = i; }
    }
    const coverageRatio = maxArea / frameArea;

    if (coverageRatio < COVERAGE_MIN) {
      drawGuidanceOverlay(ctx, canvasEl, 'too_far', '더 가까이 찍어주세요', 0);
      return { guidance: 'too_far', guidanceText: '더 가까이 찍어주세요',
               qualityScore: 0, blurScore, coverageRatio, isReadyToCapture: false };
    }

    // ── Step 5: 촬영 품질 점수 계산 ─────────────────────────────────────
    // 선명도 50% + 커버리지 50%
    const sharpScore    = Math.min(blurScore / 500, 1.0);   // 500을 만점 기준으로 정규화
    const coverageScore = Math.min(coverageRatio / 0.3, 1.0); // 30% 이상이면 만점
    const qualityScore  = Math.round((sharpScore * 0.5 + coverageScore * 0.5) * 100);

    // ── Step 6: 오버레이 렌더링 ─────────────────────────────────────────
    // 모든 컨투어 박스 표시
    for (let i = 0; i < contours.size(); i++) {
      const rect = cv.boundingRect(contours.get(i));
      if (rect.width < 60 || rect.height < 60) continue;
      const isMain = (i === maxIdx);
      ctx.strokeStyle = isMain ? '#3182f6' : '#05c46b';
      ctx.lineWidth   = isMain ? 3 : 1;
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    }

    // ready 상태: 녹색 테두리 + 카운트다운 표시
    const newReadyCount = readyCount + 1;
    const isReadyToCapture = newReadyCount >= READY_FRAMES_NEEDED;

    if (isReadyToCapture) {
      // 화면 전체 녹색 테두리 — "촬영 완료" 시각적 피드백
      ctx.strokeStyle = '#05c46b';
      ctx.lineWidth   = 8;
      ctx.strokeRect(4, 4, canvasEl.width - 8, canvasEl.height - 8);
    }

    drawGuidanceOverlay(ctx, canvasEl, 'ready',
      isReadyToCapture ? '촬영 완료!' : `준비 중 (${newReadyCount}/${READY_FRAMES_NEEDED})`,
      qualityScore);

    return { guidance: 'ready', guidanceText: '좋아요!',
             qualityScore, blurScore, coverageRatio, isReadyToCapture };

  } finally {
    [src, gray, blurred, edges, contours, hierarchy, lap, mean, stddev].forEach(m => m.delete());
  }
}

// ── HUD 오버레이 헬퍼 ────────────────────────────────────────────────────────
function drawGuidanceOverlay(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  guidance: Guidance,
  text: string,
  qualityScore: number,
) {
  const color: Record<Guidance, string> = {
    stabilize: '#ff5e57',
    no_target: '#ff9f43',
    too_far:   '#ff9f43',
    ready:     '#05c46b',
  };

  // 상단 HUD 배경
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, canvas.width, 48);

  // 가이드 텍스트
  ctx.fillStyle = color[guidance];
  ctx.font      = 'bold 16px sans-serif';
  ctx.fillText(text, 12, 22);

  // 품질 점수 바 (ready 상태에서만 표시)
  if (guidance === 'ready' && qualityScore > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(12, 30, canvas.width - 24, 10);
    ctx.fillStyle = color.ready;
    ctx.fillRect(12, 30, (canvas.width - 24) * (qualityScore / 100), 10);
    ctx.fillStyle = '#fff';
    ctx.font      = '11px monospace';
    ctx.fillText(`품질 ${qualityScore}%`, canvas.width - 60, 39);
  }
}
```

### VideoAnalysis.tsx 변경 — 자동 촬영 트리거

```ts
// rAF 루프에서 readyCountRef를 관리하고 isReadyToCapture 시 자동 촬영
const readyCountRef = useRef(0);

// processFrame 호출 후
const result = processFrame(video, canvas, readyCountRef.current);

if (result.guidance === 'ready') {
  readyCountRef.current += 1;
  if (result.isReadyToCapture) {
    readyCountRef.current = 0; // 리셋
    captureCurrentFrame();     // 자동 촬영
  }
} else {
  readyCountRef.current = 0;   // ready 끊기면 초기화
}
```

> **[!NOTE]** 자동 촬영 후 guidance가 다시 'ready'가 되어야 다음 프레임 촬영 가능.
> 동일 구도 중복 촬영 방지를 위해 촬영 후 1.5초 쿨다운 권장.

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

## Phase 8 — AudioCapture.tsx (화면 없음 전용 — 오디오만 녹음)

> **[!NOTE]** 이 컴포넌트는 PC가 완전히 켜지지 않아 카메라로 찍을 화면이 없는 경우 전용입니다.
> 일반적인 비프음/팬소음 진단은 `VideoAnalysis.tsx`의 통합 촬영을 사용하세요.
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

## Phase 11 — QRDisplay.tsx (Electron — QR 생성 + 스캔 대기)

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

## Phase 11 — QRScanner.tsx (PWA — QR 스캔 + 세션 참여)

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

---

## Phase 7-B — 라이브 카메라 가이드 모드

> **핵심 설계 원칙**
> - OpenCV: **연속 3프레임** 히스토그램 변화 감지 + CLAHE 전처리만 담당. BIOS 텍스트 OCR은 Gemini Vision에 위임.
> - "라이브"의 실체: 변화 감지 → 2초 쿨다운 → Gemini 전송 → 5~10초 후 응답. 진짜 실시간 스트리밍 아님.
> - EventSource는 GET만 지원 → POST 본문(프레임+히스토리) 전송 시 `fetch()` + `ReadableStream` 사용.
> - UX 공백 해소: `STATIC_FIRST_GUIDE[context]` 즉시 표시 → 3단계 피드백(캡처됨/분석중/완료) → stale guide 경고.
> - `useLiveFrameCapture`는 `currentHistRef`를 반환 — LiveGuideMode가 stale guide 비교에 사용. `[완료]` 태그는 반드시 `accumulated.includes()` 로 검사 (청크 분할 대응).

---

### Phase 7-B — `src/types/index.ts` 추가 타입

```typescript
// ── Live Camera Guide Mode ──────────────────────────────────────────────────
export type GuideContext =
  | 'BIOS_ENTRY'        // BIOS 진입 키 안내 (F2/Del/F10/F12)
  | 'BOOT_MENU'         // USB·SSD 부팅 우선순위 설정
  | 'WINDOWS_INSTALL'   // 파티션 설정 → 드라이버 설치
  | 'BIOS_RESET'        // Load Defaults 위치 찾기
  | 'SECURE_BOOT';      // CSM / Secure Boot 변경

export interface GuideMessage {
  role: 'user' | 'model';
  text: string;
}

export interface GuideSession {
  sessionId: string;
  context: GuideContext;
  status: 'ACTIVE' | 'DONE';
}

// GuideController.java FrameRequest DTO와 1:1 대응
export interface FrameRequest {
  frameBase64: string;
  history: GuideMessage[];
}
```

---

### Phase 7-B — `src/hooks/useLiveFrameCapture.ts`

```typescript
import { useEffect, useRef, useCallback } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const cv: any;

interface Options {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  // histSnapshot: 전송 당시 히스토그램 클론 — stale guide 감지에 사용. 호출자가 delete() 책임
  onFrameChange: (base64: string, histSnapshot: any) => void;
  enabled: boolean;
  histThreshold?: number;    // 유사도 임계값. default 0.92 — 낮을수록 민감
  cooldownMs?: number;       // 최소 전송 간격(ms). default 2000
  changeFrames?: number;     // 연속 변화 감지 필요 프레임 수. default 3 (false positive 방지)
}

// OpenCV 역할: 변화 감지(compareHist) + CLAHE 전처리만.
// BIOS 텍스트 OCR은 Gemini Vision에 위임 — 별도 OCR 파이프라인 불필요.
export default function useLiveFrameCapture({
  videoRef,
  canvasRef,
  onFrameChange,
  enabled,
  histThreshold = 0.92,
  cooldownMs = 2000,
  changeFrames = 3,
}: Options) {
  const rafRef = useRef<number>(0);
  const prevHistRef = useRef<any>(null);
  const lastSentRef = useRef<number>(0);
  const claheRef = useRef<any>(null); // CLAHE 객체: useRef로 1회 생성, 언마운트 시 delete()
  // 연속 3프레임 변화 감지 카운트 — 손 떨림/Rolling Shutter false positive 차단
  const changeCountRef = useRef(0);
  // 최신 프레임 히스토그램 — stale guide 감지 시 LiveGuideMode가 읽음 (delete() 책임은 이 훅)
  const currentHistRef = useRef<any>(null);

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const ctx = canvas.getContext('2d')!;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    // Mat 선언을 try 바깥에서 하면 finally에서 .delete() 보장 불가 → 반드시 내부에서 선언
    const src = cv.matFromImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
    const gray = new cv.Mat();
    const enhanced = new cv.Mat();
    const hist = new cv.Mat();
    const mask = new cv.Mat(); // calcHist mask — 빈 Mat으로 전체 영역 사용

    try {
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      // CLAHE — BIOS 저대비 화면 보정. clipLimit 2.0, tileSize 8×8
      if (!claheRef.current) {
        claheRef.current = new cv.CLAHE(2.0, new cv.Size(8, 8));
      }
      claheRef.current.apply(gray, enhanced);

      // 히스토그램 계산 후 0~1 정규화
      cv.calcHist([enhanced], [0], mask, hist, [256], [0, 256]);
      cv.normalize(hist, hist, 0, 1, cv.NORM_MINMAX);

      // 최신 프레임 히스토그램 항상 갱신 — stale guide 감지 시 LiveGuideMode가 읽음
      currentHistRef.current?.delete();
      currentHistRef.current = hist.clone();

      const now = Date.now();

      if (prevHistRef.current) {
        const similarity = cv.compareHist(prevHistRef.current, hist, cv.HISTCMP_CORREL);
        const cooledDown = now - lastSentRef.current > cooldownMs;

        if (similarity < histThreshold && cooledDown) {
          changeCountRef.current++;
          // 연속 changeFrames(기본 3)프레임 모두 변화 감지 시만 전송
          // → 손 떨림/Rolling Shutter/iOS 자동초점 false positive 차단
          if (changeCountRef.current >= changeFrames) {
            changeCountRef.current = 0;
            prevHistRef.current.delete();
            prevHistRef.current = hist.clone();
            lastSentRef.current = now;
            // histSnapshot: stale guide 감지용 클론 — 호출자(LiveGuideMode)가 delete() 책임
            const histSnapshot = hist.clone();
            // 전처리 이미지(enhanced) 아닌 원본(canvas) 전송 — Gemini 텍스트 인식률 보장
            onFrameChange(canvas.toDataURL('image/jpeg', 0.8).split(',')[1], histSnapshot);
          }
        } else {
          // 변화 없는 프레임 1개라도 끼이면 카운트 리셋 (실제 전환과 아티팩트 구별)
          changeCountRef.current = 0;
        }
      } else {
        // 첫 프레임: 이전 히스토그램 없음 → 즉시 전송
        prevHistRef.current = hist.clone();
        lastSentRef.current = now;
        const histSnapshot = hist.clone();
        onFrameChange(canvas.toDataURL('image/jpeg', 0.8).split(',')[1], histSnapshot);
      }
    } finally {
      // JS GC는 WASM 힙 미회수 → 예외 발생해도 반드시 해제
      [src, gray, enhanced, hist, mask].forEach(m => m.delete());
    }

    rafRef.current = requestAnimationFrame(processFrame);
  }, [videoRef, canvasRef, onFrameChange, histThreshold, cooldownMs]);

  useEffect(() => {
    if (!enabled) return;
    rafRef.current = requestAnimationFrame(processFrame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      // CLAHE + 이전 히스토그램 + 현재 히스토그램 Mat 모두 해제
      prevHistRef.current?.delete();
      prevHistRef.current = null;
      currentHistRef.current?.delete();
      currentHistRef.current = null;
      claheRef.current?.delete();
      claheRef.current = null;
    };
  }, [enabled, processFrame]);

  // stale guide 감지를 위해 최신 히스토그램을 외부에 노출
  return { currentHistRef };
}
```

---

### Phase 7-B — `src/hooks/useGeminiLiveGuide.ts`

```typescript
import { useState, useRef, useCallback } from 'react';
import { GuideContext, GuideMessage, GuideSession } from '../types';

interface Return {
  session: GuideSession | null;
  streamText: string;
  isStreaming: boolean;
  startSession: (context: GuideContext) => Promise<void>;
  sendFrame: (base64: string, histSnapshot?: any) => void;
  endSession: () => void;
}

const API_BASE = process.env.REACT_APP_API_URL ?? 'http://localhost:8080';
// 히스토리 최대 6턴 슬라이딩 — 토큰 누적 방지
const MAX_HISTORY = 6;

export default function useGeminiLiveGuide(): Return {
  const [session, setSession] = useState<GuideSession | null>(null);
  const [streamText, setStreamText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const historyRef = useRef<GuideMessage[]>([]);
  // 동시 전송 방지: 이전 응답 완료 전 새 프레임 무시
  const isSendingRef = useRef(false);
  // AbortController: endSession 또는 언마운트 시 진행 중 Gemini 스트림 즉시 취소
  const abortRef = useRef<AbortController | null>(null);

  const startSession = useCallback(async (context: GuideContext) => {
    const res = await fetch(`${API_BASE}/api/guide/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context }),
    });
    const { sessionId } = await res.json() as { sessionId: string };
    setSession({ sessionId, context, status: 'ACTIVE' });
    historyRef.current = [];
  }, []);

  const endSession = useCallback(() => {
    if (!session) return;
    abortRef.current?.abort(); // 진행 중 Gemini 스트림 즉시 취소 (AbortError → catch에서 무시)
    abortRef.current = null;
    // fire-and-forget — 응답 대기 불필요
    fetch(`${API_BASE}/api/guide/${session.sessionId}`, { method: 'DELETE' });
    setSession(s => s ? { ...s, status: 'DONE' } : null);
    historyRef.current = [];
    setStreamText('');
  }, [session]);

  const sendFrame = useCallback(async (base64: string) => {
    if (!session || isSendingRef.current) return;
    abortRef.current = new AbortController(); // 매 전송마다 새 controller 생성
    isSendingRef.current = true;
    setIsStreaming(true);
    setStreamText('');

    let accumulated = '';
    try {
      const response = await fetch(`${API_BASE}/api/guide/${session.sessionId}/frame`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frameBase64: base64,
          history: historyRef.current.slice(-MAX_HISTORY),
        }),
        signal: abortRef.current.signal, // AbortController 연결
      });

      if (!response.body) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // SSE 포맷 파싱: "data: {text}\n\n"
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') {
            // 히스토리에 모델 응답 추가 후 슬라이딩
            historyRef.current = [
              ...historyRef.current,
              { role: 'model', text: accumulated },
            ].slice(-MAX_HISTORY);
            // [완료] 태그: 청크 분할 대응을 위해 반드시 누적 문자열에서 검사
            // (청크별 data === '[완료]' 단순 비교 금지 — 분할 시 탐지 실패)
            if (accumulated.includes('[완료]')) endSession();
            return;
          }
          accumulated += data;
          setStreamText(accumulated);
        }
      }
    } catch (e) {
      // AbortError는 endSession() 또는 언마운트에 의한 정상 취소 — 무시
      if ((e as Error).name !== 'AbortError') console.error('[useGeminiLiveGuide] sendFrame error:', e);
    } finally {
      isSendingRef.current = false;
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [session, endSession]);

  return { session, streamText, isStreaming, startSession, sendFrame, endSession };
}
```

---

### Phase 7-B — `src/components/mobile/LiveGuideMode.tsx`

```typescript
import { useRef, useState, useCallback, useEffect } from 'react';
import { GuideContext } from '../../types';
import GuideContextSelector from './GuideContextSelector';
import GuideBubble from './GuideBubble';
import useLiveFrameCapture from '../../hooks/useLiveFrameCapture';
import useGeminiLiveGuide from '../../hooks/useGeminiLiveGuide';
import useOpenCV from '../../hooks/useOpenCV';
import styles from './LiveGuideMode.module.css';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const cv: any;

// GuideContext별 첫 안내 — 세션 시작 즉시 표시, Gemini 응답 도착 시 교체
// 세션 시작 → 첫 Gemini 응답까지 최대 10초 공백으로 초보자 혼란 방지
const STATIC_FIRST_GUIDE: Record<GuideContext, string> = {
  BIOS_ENTRY:       'PC 재시작 후 제조사 로고가 뜨면 Del 또는 F2 키를 빠르게 눌러주세요.',
  BOOT_MENU:        '재시작 후 F8, F11, F12 중 하나를 눌러보세요 (제조사마다 다름).',
  WINDOWS_INSTALL:  'USB가 연결됐는지 확인 후 카메라를 화면에 비춰주세요.',
  BIOS_RESET:       'BIOS 진입 후 F9 (Load Defaults) 또는 Setup Defaults 항목을 찾아주세요.',
  SECURE_BOOT:      'BIOS 진입 후 Boot 또는 Security 탭으로 이동해주세요.',
};

type CaptureState = 'idle' | 'captured' | 'analyzing' | 'done';

export default function LiveGuideMode() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [guideContext, setGuideContext] = useState<GuideContext | null>(null);
  const { ready: cvReady } = useOpenCV();

  // 3단계 피드백 상태 (idle → captured → analyzing → done)
  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sentAtRef = useRef<number>(0);

  // stale guide 감지 — 응답 도착 시 전송 당시 화면과 현재 화면 비교
  const [staleGuide, setStaleGuide] = useState(false);
  const capturedHistRef = useRef<any>(null); // 전송 당시 히스토그램 클론 (delete() 이 컴포넌트 책임)

  const { session, streamText, isStreaming, startSession, sendFrame, endSession } =
    useGeminiLiveGuide();

  // 프레임 전송 핸들러 — useLiveFrameCapture의 onFrameChange 콜백
  const handleFrameCapture = useCallback((base64: string, histSnapshot: any) => {
    if (!base64) return;

    // 1단계: 캡처됨 (즉시)
    setCaptureState('captured');
    setStaleGuide(false);
    capturedHistRef.current?.delete();
    capturedHistRef.current = histSnapshot; // 전송 당시 히스토그램 보관

    sentAtRef.current = Date.now();
    setElapsedMs(0);

    // 0.5초 후 2단계: 분석 중 + 경과 시간 타이머 시작
    setTimeout(() => {
      setCaptureState('analyzing');
      elapsedTimerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - sentAtRef.current);
      }, 1000);
    }, 500);

    sendFrame(base64);
  }, [sendFrame]);

  // rAF 루프: OpenCV 준비 + 세션 활성 시만 시작
  // currentHistRef: 매 프레임 갱신되는 최신 히스토그램 (stale guide 비교에 사용)
  const { currentHistRef } = useLiveFrameCapture({
    videoRef,
    canvasRef,
    onFrameChange: handleFrameCapture,
    enabled: !!session && session.status === 'ACTIVE' && cvReady,
  });

  // 3단계: 응답 도착 감지 → stale guide 비교
  useEffect(() => {
    if (isStreaming || captureState !== 'analyzing') return;

    // 경과 타이머 종료
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    setCaptureState('done');

    // 전송 당시 히스트 vs 현재 히스트 비교 → 0.7 미만이면 화면이 바뀐 것
    if (capturedHistRef.current && currentHistRef.current) {
      const similarity: number = cv.compareHist(
        capturedHistRef.current,
        currentHistRef.current,
        cv.HISTCMP_CORREL,
      );
      setStaleGuide(similarity < 0.7);
    }

    capturedHistRef.current?.delete();
    capturedHistRef.current = null;
  }, [isStreaming, captureState, currentHistRef]);

  const handleContextSelect = useCallback(async (context: GuideContext) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    });
    streamRef.current = stream;
    videoRef.current!.srcObject = stream;
    setGuideContext(context);
    await startSession(context);
  }, [startSession]);

  const handleEnd = useCallback(() => {
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    capturedHistRef.current?.delete();
    capturedHistRef.current = null;
    endSession();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setGuideContext(null);
    setCaptureState('idle');
  }, [endSession]);

  // 언마운트 cleanup
  useEffect(() => {
    return () => {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
      capturedHistRef.current?.delete();
      capturedHistRef.current = null;
    };
  }, []);

  // 경과 시간 보조 메시지
  const elapsedSec = Math.round(elapsedMs / 1000);
  const elapsedMsg =
    elapsedMs > 7000 ? '거의 다 됐어요...' :
    elapsedMs > 3000 ? 'BIOS는 천천히 조작해도 괜찮아요. 잠시만요!' :
    null;

  if (!guideContext || !session) {
    return <GuideContextSelector onSelect={handleContextSelect} />;
  }

  return (
    <div className={styles.container}>
      {/* 카메라 뷰 — 전체 배경 */}
      <video ref={videoRef} autoPlay playsInline muted className={styles.camera} />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* 3단계 피드백 오버레이 */}
      {captureState === 'captured' && (
        <div className={styles.captureBadge}>📸 캡처됨</div>
      )}
      {captureState === 'analyzing' && (
        <div className={styles.statusBadge}>
          <span className={styles.spinner} aria-hidden="true" />
          ⏳ Gemini 분석 중... ({elapsedSec}초)
          {elapsedMsg && <span className={styles.elapsedMsg}>{elapsedMsg}</span>}
        </div>
      )}
      {captureState === 'idle' && (
        <div className={styles.statusBadge}>✓ 대기 중 — 화면 변화를 감지하면 자동 분석해요</div>
      )}

      {/* 하단 가이드 패널 */}
      <div className={styles.bottomSheet}>
        {/* stale guide 경고 — 응답이 구버전 화면 기준일 때 */}
        {staleGuide && (
          <div className={styles.staleWarning}>
            ⚠️ 화면이 바뀐 것 같아요. 현재 화면을 다시 비춰주세요.
          </div>
        )}

        {/* streamText 없으면 STATIC_FIRST_GUIDE 즉시 표시, 응답 도착 시 자연스럽게 교체 */}
        <GuideBubble
          text={streamText || STATIC_FIRST_GUIDE[guideContext]}
          isStreaming={isStreaming}
          subText={captureState === 'done' && !staleGuide ? '이 화면 기준 안내' : undefined}
        />

        <div className={styles.actions}>
          {/* 수동 분석 — 현재 프레임 즉시 전송 */}
          <button
            className={styles.btnSecondary}
            onClick={() => {
              const snap = currentHistRef.current?.clone() ?? null;
              const base64 = canvasRef.current
                ?.toDataURL('image/jpeg', 0.8).split(',')[1] ?? '';
              handleFrameCapture(base64, snap);
            }}
            disabled={isStreaming}
          >
            지금 바로 분석
          </button>
          <button className={styles.btnDanger} onClick={handleEnd}>
            가이드 종료
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

### Phase 7-B — `src/components/mobile/GuideBubble.tsx`

```typescript
import styles from './GuideBubble.module.css';

interface Props {
  text: string;
  isStreaming: boolean;
  subText?: string; // "이 화면 기준 안내" 등 응답 도착 시 표시
}

// 스트리밍 타이핑 효과 — text는 청크 누적값 또는 STATIC_FIRST_GUIDE, isStreaming 중 커서 표시
export default function GuideBubble({ text, isStreaming, subText }: Props) {
  return (
    <div className={styles.bubble}>
      <span className={styles.avatar}>🤓</span>
      <div className={styles.content}>
        {text}
        {isStreaming && <span className={styles.cursor} aria-hidden="true" />}
        {subText && !isStreaming && (
          <span className={styles.subText}>{subText}</span>
        )}
      </div>
    </div>
  );
}
```

```css
/* GuideBubble.module.css */
.bubble {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  padding: var(--space-4);
}

.avatar {
  font-size: 24px;
  flex-shrink: 0;
}

.content {
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: var(--line-height-normal);
  color: var(--color-text-primary);
  white-space: pre-wrap;
}

/* 타이핑 커서 */
.cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: var(--color-accent);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: blink 0.8s step-end infinite;
}

@keyframes blink {
  50% { opacity: 0; }
}

/* "이 화면 기준 안내" 서브텍스트 */
.subText {
  display: block;
  margin-top: var(--space-1);
  font-size: 12px;
  color: var(--color-text-hint);
}
```

---

### Phase 7-B — `src/components/mobile/GuideContextSelector.tsx`

```typescript
import { GuideContext } from '../../types';
import styles from './GuideContextSelector.module.css';

const GUIDE_OPTIONS: { value: GuideContext; label: string; desc: string }[] = [
  { value: 'BIOS_ENTRY',      label: 'BIOS 진입',        desc: '제조사별 진입 키 (F2/Del/F12)' },
  { value: 'BOOT_MENU',       label: '부팅 순서 변경',   desc: 'USB·SSD 우선순위 설정' },
  { value: 'WINDOWS_INSTALL', label: 'Windows 설치',     desc: '파티션 설정 → 드라이버 설치' },
  { value: 'BIOS_RESET',      label: 'BIOS 초기화',      desc: 'Load Defaults 위치 찾기' },
  { value: 'SECURE_BOOT',     label: 'Secure Boot 설정', desc: 'CSM / Secure Boot 변경' },
];

interface Props {
  onSelect: (context: GuideContext) => void;
}

export default function GuideContextSelector({ onSelect }: Props) {
  return (
    <div className={styles.container}>
      <h2 className={styles.title}>어떤 작업을 도와드릴까요?</h2>
      <p className={styles.hint}>
        카메라로 화면을 비추면 AI가 단계별로 안내해드려요.
        <br />
        <strong>모니터에서 30~50cm 거리에서 정면으로 비춰주세요.</strong>
      </p>
      {GUIDE_OPTIONS.map(opt => (
        <button
          key={opt.value}
          className={styles.optionBtn}
          onClick={() => onSelect(opt.value)}
        >
          <span className={styles.label}>{opt.label}</span>
          <span className={styles.desc}>{opt.desc}</span>
        </button>
      ))}
    </div>
  );
}
```

---

### Phase 7-B — `backend/.../controller/GuideController.java`

```java
@RestController
@RequestMapping("/api/guide")
@RequiredArgsConstructor
public class GuideController {

    private final LiveGuideService liveGuideService;

    // 가이드 세션 시작 — context 전달, sessionId 반환
    @PostMapping("/start")
    public ResponseEntity<Map<String, String>> startSession(
            @RequestBody Map<String, String> body) {
        String sessionId = liveGuideService.createSession(body.get("context"));
        return ResponseEntity.ok(Map.of("sessionId", sessionId));
    }

    // 프레임 분석 — SSE 스트리밍 응답
    // EventSource는 GET만 지원 → 클라이언트는 fetch() + ReadableStream으로 수신
    @PostMapping(value = "/{sessionId}/frame", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter analyzeFrame(
            @PathVariable String sessionId,
            @RequestBody FrameRequest req) {
        // 60초 타임아웃 — Gemini 응답이 느려도 조기 종료 방지
        SseEmitter emitter = new SseEmitter(60_000L);
        liveGuideService.streamFrameAnalysis(sessionId, req, emitter);
        return emitter;
    }

    // 가이드 세션 종료 (수동 또는 [완료] 태그 감지 시 클라이언트 자동 호출)
    @DeleteMapping("/{sessionId}")
    public ResponseEntity<Void> endSession(@PathVariable String sessionId) {
        liveGuideService.endSession(sessionId);
        return ResponseEntity.noContent().build();
    }
}
```

```java
// FrameRequest.java — GuideController 전용 DTO
public record FrameRequest(
    String frameBase64,
    List<GuideMessage> history
) {}

public record GuideMessage(
    String role,   // "user" | "model"
    String text
) {}
```

---

### Phase 7-B — `backend/.../service/LiveGuideService.java`

```java
@Service
@Slf4j
public class LiveGuideService {

    private final GeminiService geminiService;
    // 인메모리 세션 맵 — DB 영속화 불필요 (재시작 시 소멸 허용)
    private final Map<String, GuideSessionState> sessions = new ConcurrentHashMap<>();
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();

    public LiveGuideService(GeminiService geminiService) {
        this.geminiService = geminiService;
    }

    public String createSession(String context) {
        String sessionId = UUID.randomUUID().toString();
        sessions.put(sessionId, new GuideSessionState(context));
        // 15분 후 자동 소멸
        scheduler.schedule(() -> sessions.remove(sessionId), 15, TimeUnit.MINUTES);
        return sessionId;
    }

    public void streamFrameAnalysis(String sessionId, FrameRequest req, SseEmitter emitter) {
        GuideSessionState state = sessions.get(sessionId);
        if (state == null) {
            emitter.completeWithError(new IllegalStateException("가이드 세션을 찾을 수 없어요"));
            return;
        }

        // Gemini 호출은 별도 스레드 — 컨트롤러 스레드 블로킹 방지
        CompletableFuture.runAsync(() -> {
            try {
                String systemPrompt = buildSystemPrompt(state.context());
                geminiService.streamGuideResponse(
                    systemPrompt,
                    req.history(),
                    req.frameBase64(),
                    chunk -> {
                        try {
                            // "data: {chunk}\n\n" SSE 포맷으로 전송
                            emitter.send(SseEmitter.event().data(chunk));
                        } catch (IOException e) {
                            emitter.completeWithError(e);
                        }
                    }
                );
                emitter.send(SseEmitter.event().data("[DONE]"));
                emitter.complete();
            } catch (Exception e) {
                log.error("Guide frame analysis failed: {}", e.getMessage());
                emitter.completeWithError(e);
            }
        });
    }

    public void endSession(String sessionId) {
        sessions.remove(sessionId);
    }

    private String buildSystemPrompt(String context) {
        String goal = switch (context) {
            case "BIOS_ENTRY"      -> "BIOS 진입 (제조사별 키: F2/Del/F10/F12)";
            case "BOOT_MENU"       -> "USB·SSD 부팅 우선순위 변경";
            case "WINDOWS_INSTALL" -> "Windows 설치 — 파티션 설정부터 드라이버 설치까지";
            case "BIOS_RESET"      -> "BIOS Load Defaults (초기화) 위치 찾기";
            case "SECURE_BOOT"     -> "CSM / Secure Boot 설정 변경";
            default                -> context;
        };
        return """
            당신은 PC 수리 도우미 '옆집 컴공생'입니다. 사용자가 카메라로 PC 화면을 비추고 있어요.
            현재 목표: %s
            규칙:
            - 화면에 보이는 내용을 먼저 파악하세요.
            - 다음에 해야 할 행동 1가지만 짧게 안내하세요 (2문장 이내).
            - 현재 화면이 목표 완료 상태라면 반드시 '[완료]' 태그를 포함하세요.
            - 한국어, 친근한 공대생 말투 (존댓말 사용), 전문용어는 괄호로 설명.
            - 화면이 흐리거나 반사가 심하면 "화면을 좀 더 정면에서 비춰주세요" 라고만 안내하세요.
            """.formatted(goal);
    }

    // 세션 상태 내부 레코드
    record GuideSessionState(String context) {}
}
```

---

### Phase 7-B — `src/components/mobile/LiveGuideMode.module.css`

```css
.container {
  position: relative;
  width: 100%;
  height: 100dvh;
  background: #000;
  overflow: hidden;
}

.camera {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 좌상단 상태 인디케이터 */
.statusBadge {
  position: absolute;
  top: var(--space-4);
  left: var(--space-4);
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 13px;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-pill);
  backdrop-filter: blur(8px);
}

.statusBadge.analyzing {
  color: var(--color-conf-mid);
  animation: diagPulse 1s infinite;
}

/* 하단 가이드 패널 */
.bottomSheet {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  max-height: 55dvh;
  background: var(--color-bg-base);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  padding: var(--space-5) var(--space-4);
  padding-bottom: max(var(--space-6), env(safe-area-inset-bottom));
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.15);
  overflow-y: auto;
}

.actions {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.btnSecondary {
  flex: 1;
  background: var(--color-bg-input);
  color: var(--color-text-primary);
  border-radius: var(--radius-pill);
  padding: var(--space-3) var(--space-4);
  font-weight: var(--font-weight-bold);
  border: none;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.btnSecondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btnDanger {
  flex: 1;
  background: var(--color-conf-low-bg);
  color: var(--color-conf-low);
  border-radius: var(--radius-pill);
  padding: var(--space-3) var(--space-4);
  font-weight: var(--font-weight-bold);
  border: none;
  cursor: pointer;
  transition: background var(--transition-fast);
}
```

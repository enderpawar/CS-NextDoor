# 코드 스니펫 — Phase별 구현 레퍼런스

> **진단 모드 분리 원칙**
> - Mobile PWA  → 하드웨어 진단 (카메라/마이크 입력)
> - Desktop Electron → 소프트웨어 진단 (OS 시스템 데이터 수집)

---

## Phase 4 — eventLogReader.js (Windows 이벤트 로그)

```js
const { execSync } = require('child_process');

// Windows Event Log에서 최근 에러/경고 수집
function getEventLogs(maxEvents = 30) {
  try {
    const ps = `
      Get-WinEvent -LogName System -MaxEvents ${maxEvents} |
      Where-Object { $_.Level -le 2 } |
      Select-Object TimeCreated, Id, LevelDisplayName, Message |
      ConvertTo-Json
    `;
    const raw = execSync(`powershell -Command "${ps}"`, { encoding: 'utf8' });
    return JSON.parse(raw);
  } catch {
    return [];  // 권한 부족 또는 비-Windows 환경
  }
}

// Application 로그 (앱 크래시, 드라이버 오류)
function getAppLogs(maxEvents = 20) {
  try {
    const ps = `
      Get-WinEvent -LogName Application -MaxEvents ${maxEvents} |
      Where-Object { $_.Level -le 2 } |
      Select-Object TimeCreated, Id, ProviderName, Message |
      ConvertTo-Json
    `;
    const raw = execSync(`powershell -Command "${ps}"`, { encoding: 'utf8' });
    return JSON.parse(raw);
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
    String cpuLoad,
    Map<String, Object> temperature,
    Map<String, Object> memory,
    List<Map<String, Object>> topProcesses,
    List<Map<String, Object>> eventLogs
) {}
```

---

## Phase 7 — VideoAnalysis.jsx (영상 핵심 프레임 추출)

```jsx
import { useRef, useState } from 'react';

// 영상에서 N초 간격으로 프레임을 캡처해 Base64 배열로 반환
export default function VideoAnalysis({ onFramesReady }) {
  const videoRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const chunksRef = useRef([]);

  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    });
    videoRef.current.srcObject = stream;
    setRecording(true);
  };

  const stop = () => {
    const frames = extractFrames(videoRef.current, { intervalSec: 1.5, maxFrames: 5 });
    videoRef.current?.srcObject?.getTracks().forEach(t => t.stop());
    setRecording(false);
    onFramesReady(frames);  // Base64[] 전달
  };

  return (
    <div>
      <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%' }} />
      {!recording
        ? <button onClick={start}>🎥 영상 촬영 시작</button>
        : <button onClick={stop}>⏹️ 촬영 종료 + 분석</button>
      }
    </div>
  );
}

function extractFrames(videoEl, { intervalSec, maxFrames }) {
  const canvas = document.createElement('canvas');
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  const ctx = canvas.getContext('2d');
  const frames = [];

  // 현재 시점 프레임만 추출 (실시간 촬영의 경우)
  for (let i = 0; i < maxFrames; i++) {
    ctx.drawImage(videoEl, 0, 0);
    frames.push(canvas.toDataURL('image/jpeg', 0.7));
  }
  return frames;
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
  const [fps, setFps] = useState(60);
  const [drops, setDrops] = useState([]); // { timestamp, fps } 배열
  const rafRef = useRef(null);
  const lastTimeRef = useRef(performance.now());
  const frameCountRef = useRef(0);

  const start = useCallback(() => {
    const tick = (now) => {
      frameCountRef.current++;
      const elapsed = now - lastTimeRef.current;

      if (elapsed >= 1000) {
        const currentFps = Math.round((frameCountRef.current * 1000) / elapsed);
        setFps(currentFps);

        // 30fps 미만 = 심각한 드랍
        if (currentFps < 30) {
          setDrops(prev => [...prev.slice(-19), {
            timestamp: new Date().toLocaleTimeString(),
            fps: currentFps,
          }]);
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

  // Long Task 감지 (50ms 이상 블로킹)
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

    // Phase 4 확장: 이미지 + 오디오 멀티모달
    public String diagnoseMultimodal(String base64Image, byte[] audioBytes, String symptom) {
        List<Map<String, Object>> parts = new ArrayList<>(List.of(
            Map.of("text", "증상: " + symptom),
            Map.of("inline_data", Map.of("mime_type", "image/jpeg", "data", base64Image))
        ));
        if (audioBytes != null) {
            parts.add(Map.of("inline_data", Map.of(
                "mime_type", "audio/webm",
                "data", Base64.getEncoder().encodeToString(audioBytes)
            )));
        }
        Map<String, Object> requestBody = Map.of(
            "contents", List.of(Map.of("parts", parts))
        );
        return extractText(restTemplate.postForObject(GEMINI_URL + "?key=" + apiKey, requestBody, Map.class));
    }

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

    @PostMapping("/image")
    public ResponseEntity<DiagnosisResponse> diagnoseImage(
            @RequestParam("image") MultipartFile image,
            @RequestParam("symptom") String symptom) throws IOException {

        String base64 = Base64.getEncoder().encodeToString(image.getBytes());
        String result = diagnosisService.diagnose(base64, symptom);
        return ResponseEntity.ok(new DiagnosisResponse(result));
    }

    @PostMapping("/multimodal")
    public ResponseEntity<DiagnosisResponse> diagnoseMultimodal(
            @RequestParam("image") MultipartFile image,
            @RequestParam(value = "audio", required = false) MultipartFile audio,
            @RequestParam("symptom") String symptom) throws IOException {

        String base64Image = Base64.getEncoder().encodeToString(image.getBytes());
        byte[] audioBytes = audio != null ? audio.getBytes() : null;
        String result = diagnosisService.diagnoseMultimodal(base64Image, audioBytes, symptom);
        return ResponseEntity.ok(new DiagnosisResponse(result));
    }
}
```

## Phase 1 — CameraView.jsx (기본)

```jsx
import { useRef, useState } from 'react';

export default function CameraView({ onCapture }) {
  const videoRef = useRef(null);
  const [streaming, setStreaming] = useState(false);

  const startCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
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

  return (
    <div className="camera-view">
      <video ref={videoRef} autoPlay playsInline />
      {!streaming
        ? <button onClick={startCamera}>카메라 켜기</button>
        : <button onClick={capture}>📸 촬영</button>
      }
    </div>
  );
}
```

---

## Phase 2 — useOpenCV.js

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
    private final PriceToolProvider priceTool;

    private static final String SYSTEM_PROMPT = """
        당신은 '옆집 컴공생' AI입니다.
        말투: 친근한 공대생처럼. 기술 근거는 정확하게.
        답변 형식: [원인 추정] → [해결 방법] → [추가 확인 사항]
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
            .tools(ToolCallbacks.from(manualTool, priceTool))  // Spring AI 1.x 공식 패턴
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

## Phase 4 — AudioCapture.jsx

```jsx
import { useRef, useState } from 'react';

export default function AudioCapture({ onAudioReady }) {
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [recording, setRecording] = useState(false);

  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    recorder.ondataavailable = e => chunksRef.current.push(e.data);
    recorder.onstop = () => {
      onAudioReady(new Blob(chunksRef.current, { type: 'audio/webm' }));
      chunksRef.current = [];
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

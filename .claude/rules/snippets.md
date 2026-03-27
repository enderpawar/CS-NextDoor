# 비자명 함정 패턴 — 구현 시 반드시 참고

> 전체 Phase별 코드 스니펫: `docs/snippets.md`

---

## [IPC] React Strict Mode 이중 등록 방지

```js
// preload.js의 ipcRenderer.on()은 Strict Mode에서 2회 등록됨 → 콜백 2번 호출
// on() 직전 removeAllListeners() 선행 필수
window.electronAPI.removeSystemListener(); // removeAllListeners('system-update')
window.electronAPI.onSystemUpdate(cb);
```

---

## [OpenCV] Mat 메모리 — try/finally 필수

```js
// JS GC는 WASM 힙 미회수 → 예외 발생 시 .delete() 미실행으로 누수 누적
const src = cv.matFromImageData(imageData);
const gray = new cv.Mat(); const edges = new cv.Mat();
const contours = new cv.MatVector(); const hierarchy = new cv.Mat();
try {
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  // ... 처리 로직
} finally {
  [src, gray, edges, contours, hierarchy].forEach(m => m.delete());
}
```

---

## [OpenCV] WASM 초기화 — 2단계 비동기

```js
// script.onload만으로는 부족 — cv.onRuntimeInitialized 콜백 후에야 cv.Mat() 사용 가능
script.onload = () => {
  window.cv['onRuntimeInitialized'] = () => setReady(true); // 이 콜백 전까지 사용 금지
};
```

---

## [MediaRecorder] iOS 오디오 포맷 + AEC 비활성화

```js
// iOS Safari: audio/webm 미지원 → audio/mp4 필수
const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';

// 비프음 보존: AEC/노이즈억제 비활성화 (활성화 시 비프음 주파수 제거됨)
getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });

// Gemini 전송 시 실제 녹음 mimeType과 반드시 일치
```

---

## [PowerShell] execSync 블로킹 + JSON 단일 객체 버그

```js
// execSync → 메인 프로세스 블로킹. exec + Promise 래핑 필수
const execAsync = promisify(require('child_process').exec);

// ConvertTo-Json: 이벤트 1개면 배열 아닌 객체 반환 → .map() 에러
const parsed = JSON.parse(stdout);
const events = Array.isArray(parsed) ? parsed : [parsed]; // 정규화 필수

// ExecutionPolicy 제한 환경 대응
`powershell -ExecutionPolicy Bypass -Command "..."`
```

---

## [Spring] Gemini extractText() null 방어

```java
// 현재 null 방어 없음 — 404/401/빈 응답 시 NPE 발생
private String extractText(Map<String, Object> response) {
  if (response == null) throw new DiagnosisException("Gemini 응답 없음");
  var candidates = (List<Map<String, Object>>) response.get("candidates");
  if (candidates == null || candidates.isEmpty()) throw new DiagnosisException("Gemini 후보 없음");
  var parts = (List<Map<String, Object>>) ((Map<String,Object>) candidates.get(0).get("content")).get("parts");
  return (String) parts.get(0).get("text");
}
```

---

## [Spring] JSONB vs TEXT — Hibernate 6 타입 충돌

```java
// String 필드 + columnDefinition="jsonb" → 삽입 시 오류
// ERROR: column is of type jsonb but expression is of type character varying
// 권장: TEXT로 변경
@Column(columnDefinition = "TEXT")  // jsonb 대신
private String aiDiagnosis;
```

---

## [PWA] 독립 모드 분기 — useRuntimeMode 확장

```js
// URL에 ?session= 파라미터 없으면 standalone (PC 부팅 불가 진입)
// standalone: WS 연결 없음, QR UI 숨김, HTTP 응답만으로 결과 수신
export function useRuntimeMode() {
  if (!window.electronAPI) {
    const hasSession = new URLSearchParams(location.search).has('session');
    return hasSession ? 'pwa-session' : 'pwa-standalone';
  }
  return 'electron';
}
```

---

## [Session] authToken QR 인코딩 + 1회 폐기

```java
// sessionId만으로 접근 가능하면 타인 세션 하이재킹 위험
// QR: ${PWA_BASE}/scan?session=UUID&token=TOKEN
// X-Session-Token 헤더 검증 후 토큰 즉시 폐기
String authToken = generateSecureToken(); // SecureRandom 8자리 alphanumeric
// 최초 검증 후 DB에서 토큰 null 처리
```

---

## [FPS] 베이스라인 대비 드랍 감지 (절대값 아님)

```js
// 절대값 30fps 기준 X → 베이스라인 대비 20% 이상 드랍 감지
// 143fps→100fps(30% 드랍) 감지 / 30fps→25fps는 정상으로 처리
const baseline = fpsHistory.slice(0,-1).reduce((a,b)=>a+b,0) / (fpsHistory.length-1);
if ((baseline - currentFps) / baseline > 0.2) { /* 드랍 기록 */ }
```

---

## [MCP] Silent Failure 대응

```java
// @Tool 등록됐어도 AI가 실제 호출 안 할 수 있음 (로그에 에러 없음)
// System Prompt에 명시 필수:
// "증상에 관련 부품 모델명이 있으면 반드시 get_manual_info()를 먼저 호출할 것"
```

---

## [Live Guide] EventSource vs fetch() 스트리밍

```ts
// ❌ EventSource는 GET만 지원 — 프레임 Base64 + 히스토리를 POST 본문으로 보낼 수 없음
// ✅ fetch() + ReadableStream으로 POST SSE 수신
const response = await fetch(`/api/guide/${sessionId}/frame`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ frameBase64, history }),
});
const reader = response.body!.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value, { stream: true });
  for (const line of chunk.split('\n')) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') return;
      setStreamText(prev => prev + data);
    }
  }
}
```

---

## [Live Guide] CLAHE 객체 + 이전 히스토그램 Mat 수명 관리

```ts
// CLAHE: 생성 비용이 크므로 useRef로 1회 생성, 언마운트 시 delete()
// prevHistRef: 교체 전 반드시 이전 것 delete() 후 clone()
if (!claheRef.current) {
  claheRef.current = new cv.CLAHE(2.0, new cv.Size(8, 8));
}
// ... processFrame 내부 ...
prevHistRef.current?.delete();          // 이전 히스토그램 해제
prevHistRef.current = hist.clone();     // 새 히스토그램 복사본 보관

// useEffect cleanup
return () => {
  cancelAnimationFrame(rafRef.current);
  prevHistRef.current?.delete();
  prevHistRef.current = null;
  claheRef.current?.delete();
  claheRef.current = null;
};
```

---

## [Live Guide] isSendingRef 동시 전송 차단

```ts
// rAF 루프(동기)와 fetch 응답(비동기)은 별개 타이밍
// 이전 응답 완료 전 변화 감지 시 중복 전송 방지
const isSendingRef = useRef(false);

const sendFrame = async (base64: string) => {
  if (!session || isSendingRef.current) return; // 전송 중이면 무시
  isSendingRef.current = true;
  try {
    // ... fetch 스트리밍 ...
  } finally {
    isSendingRef.current = false; // 완료 or 오류 시 반드시 해제
  }
};
```

---

## [Live Guide] SseEmitter 비동기 처리 패턴

```java
// SseEmitter 기본 타임아웃 30초 → 60초로 연장 필수
// Gemini 호출은 CompletableFuture.runAsync() — 컨트롤러 스레드 블로킹 방지
SseEmitter emitter = new SseEmitter(60_000L);
CompletableFuture.runAsync(() -> {
  try {
    geminiService.streamGuideResponse(prompt, history, frameBase64, chunk -> {
      try { emitter.send(SseEmitter.event().data(chunk)); }
      catch (IOException e) { emitter.completeWithError(e); }
    });
    emitter.send(SseEmitter.event().data("[DONE]"));
    emitter.complete();
  } catch (Exception e) {
    emitter.completeWithError(e);
  }
});
return emitter;
```

---

## [Live Guide] `[완료]` 태그 — 누적 버퍼 검사 (청크 분할 대응)

```ts
// ❌ 청크별 단순 검사: [완료]가 두 청크에 걸쳐 분할되면 탐지 실패
if (data === '[완료]') { ... }  // 절대 금지

// ✅ 누적 문자열에서 검사: 청크 분할 여부와 무관하게 항상 정확
let accumulated = '';
// SSE 스트림 수신 루프 내부:
accumulated += data;
setStreamText(accumulated);

// [DONE] 수신 시 최종 판단
if (data === '[DONE]') {
  if (accumulated.includes('[완료]')) {
    endSession();  // 세션 자동 종료 + isSendingRef 해제
  }
  return;
}
```

---

## [Live Guide] GuideContext 정적 선행 안내

```ts
// LiveGuideMode.tsx 상단 상수 — Gemini 응답 전 즉시 표시할 컨텍스트별 첫 안내
// GuideBubble의 fallback text를 이 값으로 교체 (기존 "화면을 비춰주세요" 대체)
const STATIC_FIRST_GUIDE: Record<GuideContext, string> = {
  BIOS_ENTRY:       'PC 재시작 후 제조사 로고가 뜨면 Del 또는 F2 키를 빠르게 눌러주세요.',
  BOOT_MENU:        '재시작 후 F8, F11, F12 중 하나를 눌러보세요 (제조사마다 다름).',
  WINDOWS_INSTALL:  'USB가 연결됐는지 확인 후 카메라를 화면에 비춰주세요.',
  BIOS_RESET:       'BIOS 진입 후 F9 (Load Defaults) 또는 Setup Defaults 항목을 찾아주세요.',
  SECURE_BOOT:      'BIOS 진입 후 Boot 또는 Security 탭으로 이동해주세요.',
};

// GuideBubble 사용 시:
// streamText가 비어있으면 정적 안내 표시, Gemini 응답이 오면 자연스럽게 대체됨
<GuideBubble
  text={streamText || STATIC_FIRST_GUIDE[guideContext]}
  isStreaming={isStreaming}
/>
```

---

## [Live Guide] 히스토그램 3프레임 연속 안정화 (false positive 방지)

```ts
// useLiveFrameCapture.ts — changeCountRef 추가
// 손 떨림 / Rolling Shutter / iOS 자동 초점으로 인한 1~2프레임 false positive 차단
const changeCountRef = useRef(0);

// processFrame 내부 — 기존 단발 감지를 3프레임 연속으로 교체
if (prevHistRef.current) {
  const similarity = cv.compareHist(prevHistRef.current, hist, cv.HISTCMP_CORREL);
  const cooledDown = now - lastSentRef.current > cooldownMs;

  if (similarity < histThreshold && cooledDown) {
    changeCountRef.current++;
    if (changeCountRef.current >= 3) {  // 연속 3프레임 모두 변화 감지 시만 전송
      changeCountRef.current = 0;
      prevHistRef.current.delete();
      prevHistRef.current = hist.clone();
      lastSentRef.current = now;
      onFrameChange(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
    }
  } else {
    changeCountRef.current = 0;  // 변화 없는 프레임 1개라도 끼이면 리셋
  }
}

// cleanup 시 리셋 (useEffect return):
// changeCountRef는 ref라 별도 cleanup 불필요 — 언마운트 시 자동 소멸
```

---

## [Live Guide] AbortController — 언마운트 시 fetch 취소

```ts
// useGeminiLiveGuide.ts — abortRef 추가
const abortRef = useRef<AbortController | null>(null);

const endSession = useCallback(() => {
  if (!session) return;
  abortRef.current?.abort();  // 진행 중 Gemini 스트림 즉시 취소
  fetch(`${API_BASE}/api/guide/${session.sessionId}`, { method: 'DELETE' });
  setSession(s => s ? { ...s, status: 'DONE' } : null);
  historyRef.current = [];
  setStreamText('');
}, [session]);

const sendFrame = useCallback(async (base64: string) => {
  if (!session || isSendingRef.current) return;
  abortRef.current = new AbortController();  // 매 전송마다 새 controller
  isSendingRef.current = true;
  try {
    const response = await fetch(`${API_BASE}/api/guide/${session.sessionId}/frame`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frameBase64: base64, history: historyRef.current.slice(-MAX_HISTORY) }),
      signal: abortRef.current.signal,  // ← AbortController 연결
    });
    // ... 스트리밍 처리 ...
  } catch (e) {
    if ((e as Error).name !== 'AbortError') console.error(e);  // abort는 정상 흐름 — 무시
  } finally {
    isSendingRef.current = false;   // abort 후에도 finally 실행 보장
    setIsStreaming(false);
    abortRef.current = null;
  }
}, [session, endSession]);
```

---

## [Live Guide] stale guide — 응답 도착 시 시간차 경고

```ts
// LiveGuideMode.tsx — 프레임 전송 시 capturedHistRef 저장, 응답 도착 시 비교
// onFrameChange 시그니처 확장: base64 + 히스토그램 클론 함께 전달
// useLiveFrameCapture Options 타입 수정:
//   onFrameChange: (base64: string, histSnapshot: any) => void

const capturedHistRef = useRef<any>(null);

const handleFrameCapture = useCallback((base64: string, histSnapshot: any) => {
  capturedHistRef.current?.delete();        // 이전 캡처 히스토그램 해제
  capturedHistRef.current = histSnapshot;   // 전송 당시 히스토그램 보관 (WASM)
  sendFrame(base64);
}, [sendFrame]);

// isStreaming이 true → false 전환 시 (응답 도착) 시간차 비교
useEffect(() => {
  if (isStreaming || !capturedHistRef.current || !currentHistRef.current) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const similarity: number = (cv as any).compareHist(
    capturedHistRef.current,
    currentHistRef.current,
    cv.HISTCMP_CORREL,
  );

  if (similarity < 0.7) {
    setStaleGuide(true);  // ⚠️ 경고 버블 표시
  } else {
    setStaleGuide(false);
  }

  capturedHistRef.current.delete();
  capturedHistRef.current = null;
}, [isStreaming]);

// TSX — GuideBubble 위에 조건부 경고 표시
{staleGuide && (
  <div className={styles.staleWarning}>
    ⚠️ 화면이 바뀐 것 같아요. 현재 화면을 다시 비춰주세요.
  </div>
)}
```

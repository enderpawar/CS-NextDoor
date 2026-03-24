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
const baseline = fpsHistory.slice(0,-1).reduce((a,b)=>a+b,0) / (history.length-1);
if ((baseline - currentFps) / baseline > 0.2) { /* 드랍 기록 */ }
```

---

## [MCP] Silent Failure 대응

```java
// @Tool 등록됐어도 AI가 실제 호출 안 할 수 있음 (로그에 에러 없음)
// System Prompt에 명시 필수:
// "증상에 관련 부품 모델명이 있으면 반드시 get_manual_info()를 먼저 호출할 것"
```

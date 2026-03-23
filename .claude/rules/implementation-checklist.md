# 구현 전 체크리스트

> Phase 시작 전 해당 항목을 체크하지 않으면 구현 도중 블로킹될 수 있습니다.

---

## 🔴 High Risk — Phase 시작 전 반드시 확인

### [ ] 1. Gemini API 모델 접근 권한 (Phase 1 전)
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_GEMINI_API_KEY"
```
- `gemini-3.1-pro-preview` 목록에 있으면 OK
- 없으면 `gemini-2.0-flash`로 `GeminiService.java`의 `GEMINI_URL` 상수 수정

### [ ] 2. JSONB vs TEXT 컬럼 전략 결정 (Phase 1 전 — 설계 확정)
- Hibernate 6(Spring Boot 3.x 기본)에서 `String` 필드 + `columnDefinition="jsonb"` 조합은 삽입 오류 발생
  - PostgreSQL JDBC가 타입을 `character varying`으로 추론 → `ERROR: column is of type jsonb but expression is of type character varying`
- **권장**: `@Column(columnDefinition = "TEXT")`로 변경 (JSONB 인덱싱 불필요하면 TEXT가 단순)
- JSONB가 꼭 필요하면 `AttributeConverter` 구현 후 `@Convert` 적용
- **이 결정은 Phase 10이 아닌 Phase 1 설계 시점에 내려야 한다** — 나중에 바꾸면 `ALTER TABLE` 마이그레이션 필요

### [ ] 3. GeminiService.extractText() null 방어 추가 (Phase 1 전)
- 현재 스니펫의 `extractText()`는 null 방어 없음
- 모델명 오류(404) / API 키 만료(401) / 빈 응답 시 `NullPointerException` 또는 `ClassCastException` 발생
- Phase 1 구현 시 null 체크 후 `throw new DiagnosisException("Gemini 응답 오류")` 처리 필수

### [ ] 4. Windows CPU 온도 null 전파 처리 (Phase 3 전)
- `systeminformation cpuTemperature()` → WMI 의존, AMD/일부 OEM 환경에서 `null` 반환
- UI: `null`이면 "측정 불가" 표시
- **Gemini 전송 시**: `temperature` 필드가 `null`이면 JSON에서 제외하고 프롬프트에 명시
  ```
  "온도 데이터를 수집할 수 없는 환경입니다. 온도 관련 진단은 생략해주세요."
  ```
- 온도 null이어도 Phase 진행 가능 — 막히면 무시하고 계속

### [ ] 5. PWA HTTPS 환경 준비 (Phase 6 전)
- `getUserMedia` + Service Worker = HTTPS 필수 (localhost 제외)
- 모바일 실기기 테스트 시 ngrok 터널링 필요
  ```bash
  ngrok http 3000
  # → https://<id>.ngrok.io 로 모바일 접속
  ```
- iOS Safari 주의: 카메라 권한 매번 재요청, `audio/webm` 미지원 (실 기기에서만 확인 가능)

---

## 🟡 Medium Risk — 해당 Phase 도달 시 확인

### [ ] 6. Electron CORS `app://` 허용 (Phase 2 연동 시)
- Electron 앱 오리진 = `app://` 또는 `file://`
- Spring Boot CORS 설정에 추가:
  ```java
  @CrossOrigin(origins = {"http://localhost:3000", "app://*", "file://*"})
  ```

### [ ] 7. Electron IPC 리스너 React Strict Mode 이중 등록 (Phase 2 전)
- React 18 Strict Mode에서 `useEffect`가 2회 실행 → `ipcRenderer.on()`이 이중 등록됨
- `preload.js`의 `onSystemUpdate` 패턴은 `ipcRenderer.on()` 사용 → 콜백이 2번 호출됨
- 해결: `ipcRenderer.removeAllListeners('system-update')`를 `on()` 직전에 호출 후 재등록

### [ ] 8. PowerShell execSync 동기 블로킹 + JSON 배열 정규화 (Phase 4 전)
- `execSync`는 Electron 메인 프로세스를 블로킹 — `Get-WinEvent` 실행 시 수 초간 UI 프리징
- 비동기로 변환 필요: `exec` + Promise 래핑
- **JSON 단일 객체 버그**: 이벤트 1개일 때 `ConvertTo-Json`이 배열 대신 객체 반환 → `.map()` 에러
  ```js
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [parsed]; // 정규화 필수
  ```
- `ExecutionPolicy: Restricted` 환경: `powershell -ExecutionPolicy Bypass -Command "..."`

### [ ] 9. OpenCV.js WASM 초기화 타이밍 + Mat 메모리 (Phase 6~7)
- WASM 로드 2단계 비동기: `script.onload` → `cv.onRuntimeInitialized` 콜백 전까지 `cv.Mat()` 사용 불가
- WASM 파일 ~8MB → `sw.js` `PRECACHE`에 `/opencv.js` 포함 필수
- **Mat 메모리 누수**: `processFrame`의 Mat 5개는 예외 발생 시 `.delete()` 미실행 → WASM 힙 누수
  - JS GC는 WASM 힙 메모리를 회수하지 못함 → 탐지 안 된 채 누적됨
  - 반드시 `try/finally` 블록으로 `.delete()` 보장
- rAF 루프는 컴포넌트 언마운트 시 `cancelAnimationFrame` + `getTracks().forEach(t => t.stop())` 필수

### [ ] 10. Service Worker 캐시 버전 관리 (Phase 6 전)
- `CACHE = 'nextdoorcs-v1'` 고정 시 배포 후 구버전 캐시가 새 API와 충돌
- 배포마다 `nextdoorcs-v2`, `v3`... 으로 버전 올리는 전략 필요

### [ ] 11. MediaRecorder iOS 오디오 포맷 분기 (Phase 8 전)
- Chrome/Edge: `audio/webm` ✅ / iOS Safari: `audio/mp4` ✅
- **iOS 비율이 높은 모바일 타겟에서 이 분기는 핵심 경로**
  ```js
  const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
  new MediaRecorder(stream, { mimeType });
  ```
- Gemini API 전송 시 mime type 명시 필수 (`audio/webm` 또는 `audio/mp4`)

### [ ] 12. Spring AI BOM 버전 고정 + MCP Silent Failure (Phase 9 전)
- `pom.xml` `dependencyManagement`에 `spring-ai-bom` 버전 명시
  ```xml
  <artifactId>spring-ai-bom</artifactId>
  <version>1.0.0</version>
  ```
- **MCP Silent Failure**: `@Tool` 등록은 됐지만 AI가 실제로 툴을 호출하지 않는 경우 발생
  - 원인: Gemini Function Calling 스키마와 Spring AI 생성 FunctionDeclaration 불일치
  - 로그에 에러 없음 — AI 응답에 매뉴얼 정보 포함 여부로만 확인 가능
  - 해결: System Prompt에 툴 호출 조건 명시
    ```
    증상에 관련 부품 모델명이 있으면 반드시 get_manual_info()를 먼저 호출하세요.
    ```

---

## 🟢 Low Risk — 구현 중 참고

### [ ] 13. Electron 배포 코드 서명 (최종 빌드 시)
- Windows `.exe` 코드 서명 없으면 SmartScreen 경고 팝업
- 개인/학습용이면 무시 가능 — 실제 배포 시 EV 인증서 필요

### [ ] 14. useRuntimeMode HMR 분기 오탐 (개발 중)
- Electron 개발 모드 HMR 중 `window.electronAPI`가 일시적으로 undefined → PWA 모드로 잘못 분기
- 개발 환경 한정 이슈 — 배포 빌드에서는 미발생

### [ ] 15. Docker PostgreSQL 연결 준비 타이밍 (Phase 10)
- `depends_on`은 컨테이너 시작만 보장, PostgreSQL 연결 준비 완료는 보장 안 함
- Spring Boot 기동 시 연결 실패 가능 → `SPRING_DATASOURCE_HIKARI_CONNECTION-TIMEOUT` 설정 권장

---

## Phase별 체크 요약

| Phase | 확인 항목 |
|---|---|
| **1** | Gemini 모델 접근 권한, JSONB vs TEXT 결정, extractText null 방어 |
| **2** | Electron CORS `app://`, IPC Strict Mode 이중 등록 |
| **3** | CPU 온도 null → Gemini 프롬프트 처리 |
| **4** | PowerShell async 변환 + JSON 배열 정규화 |
| **6** | PWA HTTPS(ngrok), SW 캐시 버전 관리, OpenCV PRECACHE |
| **7** | OpenCV try/finally Mat.delete(), rAF cleanup |
| **8** | MediaRecorder mimeType 분기 (iOS 필수) |
| **9** | Spring AI BOM 버전 고정, MCP Silent Failure 대응 |
| **10** | Docker PostgreSQL 연결 타이밍 |
---

## 🚀 Render 배포 체크리스트

### [ ] R1. JVM 메모리 제한 설정 (배포 전)
- Render 무료 티어 512MB → Spring Boot + Spring AI는 빠듯함
- `render.yaml` 또는 환경변수에 추가:
  ```
  JAVA_OPTS=-Xmx350m -Xss512k -XX:MaxMetaspaceSize=100m
  ```

### [ ] R2. 환경변수 Render 대시보드 설정
- `GEMINI_API_KEY` — Gemini API 키
- `SPRING_DATASOURCE_URL` — Supabase PostgreSQL URL
  ```
  jdbc:postgresql://db.xxx.supabase.co:5432/postgres
  ```
- `SPRING_DATASOURCE_USERNAME` / `PASSWORD` — Supabase 접속 정보
- `ALLOWED_ORIGINS` — `https://your-app.vercel.app,app://*`

### [ ] R3. CORS — Vercel 도메인 허용
```java
@CrossOrigin(origins = {"${ALLOWED_ORIGINS}"})
```
- 환경변수로 오리진을 주입해야 dev/prod 분리 가능

### [ ] R4. 슬립 방지 (무료 티어 15분 비활동 시 슬립)
- UptimeRobot 무료 계정 → 14분마다 헬스체크 GET 요청 설정
  ```
  GET https://your-app.onrender.com/actuator/health
  ```
- `spring-boot-starter-actuator` 의존성 추가 필요

### [ ] R5. WebSocket Render 지원 확인
- Render는 WebSocket 지원하나, 무료 티어 슬립 시 연결 끊김
- 클라이언트에서 `onclose` 시 자동 재연결 로직 필수:
  ```js
  stompClient.onDisconnect = () => setTimeout(connect, 3000);
  ```

### [ ] R6. render.yaml 작성 (GitHub 자동 배포)
```yaml
services:
  - type: web
    name: nextdoorcs-backend
    runtime: java
    buildCommand: cd backend && ./mvnw clean package -DskipTests
    startCommand: java $JAVA_OPTS -jar backend/target/*.jar
    envVars:
      - key: GEMINI_API_KEY
        sync: false
      - key: SPRING_DATASOURCE_URL
        sync: false
```

---

## 🔗 Phase 11 — 크로스 플랫폼 세션 체크리스트

### [ ] P11-1. QR 코드 라이브러리 설치
```bash
npm install qrcode react-qr-code    # Electron QR 표시
npm install jsqr                     # PWA QR 스캔 (BarcodeDetector 미지원 환경 폴백)
```

### [ ] P11-2. WebSocket STOMP 의존성 추가
```bash
npm install @stomp/stompjs sockjs-client  # 프론트엔드
```
```xml
<!-- pom.xml -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-websocket</artifactId>
</dependency>
```

### [ ] P11-3. 세션 만료 처리
- QR 스캔 없이 방치된 세션 자동 만료 필요
- `DiagnosisSession.expiresAt` 필드 + 스케줄러로 정리:
  ```java
  @Scheduled(fixedDelay = 60000)
  public void expireSessions() { ... }
  ```

### [ ] P11-4. 모바일 QR 스캔 — BarcodeDetector 지원 여부
- Chrome Android: ✅ / iOS Safari 17+: ✅ / 구형 브라우저: ❌
- 미지원 시 `jsQR` + canvas 폴백 필요 (useQRScanner 훅에서 분기)

### [ ] P11-5. 통합 진단 트리거 조건
- SW 스냅샷 + HW 영상 **둘 다 도착했을 때만** Gemini 호출
- 한쪽만 도착한 상태에서 타임아웃 시 처리 전략 결정 필요
  - 권장: 5분 대기 후 도착한 데이터만으로 단독 진단


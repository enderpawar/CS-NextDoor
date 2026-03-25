# 구현 전 체크리스트

> Phase 시작 전 해당 항목을 체크하지 않으면 구현 도중 블로킹될 수 있습니다.

---

## 🔴 High Risk — Phase 시작 전 반드시 확인

### [ ] 0. API 비용 쿼터 설계 (Phase 1 전 — 공개 전 필수)
- 멀티모달 요청(JPEG 10프레임 + 오디오 + 시스템 스냅샷) = 입력 토큰 대량 소모
- **IP 기반 일일 진단 횟수 제한** 미적용 시 공개 후 비용 폭증 위험
- 구현: Spring `@RateLimiter` + Redis (또는 인메모리 카운터로 MVP 우선 처리)
- 초과 시 응답: `429 Too Many Requests` + "오늘 진단 횟수를 초과했어요 (일 5회 제한)"

### [ ] 1. Gemini API 모델 접근 권한 (Phase 1 전)
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_KEY"
```
- `gemini-3.1-pro-preview` 목록에 있으면 OK
- 없으면 `gemini-2.0-flash`로 `GeminiService.java`의 `GEMINI_URL` 상수 수정

### [ ] 2. JSONB vs TEXT 컬럼 전략 결정 (Phase 1 전 — 설계 확정)
- Hibernate 6(Spring Boot 3.x 기본)에서 `String` 필드 + `columnDefinition="jsonb"` 조합은 삽입 오류 발생
  - PostgreSQL JDBC가 타입을 `character varying`으로 추론 → `ERROR: column is of type jsonb but expression is of type character varying`
- **권장**: `@Column(columnDefinition = "TEXT")`로 변경 (JSONB 인덱싱 불필요하면 TEXT가 단순함)
- JSONB가 꼭 필요하면 `AttributeConverter` 구현 후 `@Convert` 적용
- **이 결정은 Phase 10이 아닌 지금 내려야 한다** — 나중에 바꾸면 `ALTER TABLE` 마이그레이션 필요

### [ ] 3. GeminiService.extractText() null 방어 추가 (Phase 1 전)
- 현재 스니펫의 `extractText()`는 null 방어 없음
- 모델명 오류(404) / API 키 만료(401) / 빈 응답 시 `NullPointerException` 또는 `ClassCastException` 발생
- 반드시 null 체크 후 `throw new DiagnosisException("Gemini 응답 오류")` 처리

### [ ] 4. Windows CPU 온도 null 전파 처리 (Phase 3 전)
- `systeminformation cpuTemperature()` → WMI 의존, AMD/일부 OEM 환경에서 `null` 반환
- UI: `null`이면 "측정 불가" 표시
- **Gemini 전송 시**: `temperature` 필드가 `null`이면 JSON에서 제외하거나 프롬프트에 명시 (`"온도 데이터 수집 불가, 온도 관련 진단 생략"`)
- 온도 null이어도 Phase 진행 가능 — 막히면 무시하고 계속

### [ ] 5. PWA HTTPS 환경 준비 (Phase 6 전)
- `getUserMedia` + Service Worker = HTTPS 필수 (localhost 제외)
- 모바일 실기기 테스트 시 ngrok 터널링 필요 (`ngrok http 3000`)
- iOS Safari 주의: 카메라 권한 매번 재요청, `audio/webm` 미지원 (실 기기에서만 확인 가능)

### [ ] 5-1. PWA 독립 진입 경로 구현 (Phase 6 전)
- **PC 부팅 불가 시** Electron 없이 PWA 직접 접속 → `/api/diagnosis/hardware` 단독 호출
- `useRuntimeMode`에 `'standalone'` 모드 추가: URL에 `?session=` 파라미터 없으면 독립 모드로 분기
- 독립 모드에서는 WS 연결 없이 HTTP 응답으로만 결과 수신 — QR 세션 관련 UI 숨김
- `QRScanner.jsx` 와 `ShootingGuide.jsx` 는 독립 모드에서도 동작해야 함 (세션 무관)

---

## 🟡 Medium Risk — 해당 Phase 도달 시 확인

### [ ] 6. Electron CORS `app://` 허용 (Phase 2 연동 시)
- Electron 앱 오리진 = `app://` 또는 `file://`
- Spring Boot CORS 설정에 추가: `@CrossOrigin(origins = {"http://localhost:3000", "app://*", "file://*"})`

### [ ] 7-0. 클립보드 이미지 붙여넣기 IPC (Phase 2 전)
- 증상 입력창에서 Ctrl+V로 스크린샷/사진 첨부 지원
- **렌더러(Web API 방식)**: `paste` 이벤트 → `e.clipboardData.items`에서 `image/*` 추출 → `File` → Base64
- **대안(Electron API)**: `preload.js`에 `readClipboardImage` 노출 → `ipcMain.handle('clipboard-image', () => clipboard.readImage().toDataURL())`
- 권장: Web API 방식 우선 (IPC 불필요). Electron `clipboard` 모듈은 `nativeImage` 형식 처리 시에만 사용
- 이미지 첨부 시 입력창 하단에 썸네일 미리보기 표시
- 진단 payload: 텍스트 증상과 함께 `clipboardImage: base64String` 필드로 전송 → 백엔드에서 Gemini multipart 요청에 포함
- 첨부 이미지는 `/api/diagnosis/hypotheses` 요청 body에 포함 (별도 업로드 엔드포인트 불필요)

### [ ] 7. Electron IPC 리스너 React Strict Mode 이중 등록 (Phase 2 전)
- React 18 Strict Mode에서 `useEffect`가 2회 실행 → `ipcRenderer.on()`이 이중 등록됨
- `preload.js`의 `onSystemUpdate` 패턴은 `ipcRenderer.on()` 사용 → 콜백이 2번 호출됨
- 해결: `ipcRenderer.removeAllListeners('system-update')`를 `on()` 직전에 호출 후 재등록

### [ ] 7-1. macOS Event Log 대체 수집 (Phase 4 — macOS 지원 시)
- Windows: `Get-WinEvent` (기존) / macOS: `log show --predicate 'eventType == logEvent' --last 1h`
- macOS `unified log`는 JSON 출력 지원 안 함 → `log show` 텍스트 파싱 필요
- `process.platform === 'darwin'` 분기로 플랫폼별 수집 함수 분리
- macOS GPU 온도·사용률은 `systeminformation`으로 부분 지원 (NVIDIA 미지원)

### [ ] 8. PowerShell execSync 동기 블로킹 + JSON 배열 정규화 (Phase 4 전)
- `execSync`는 Electron 메인 프로세스를 블로킹 — `Get-WinEvent` 실행 시 수 초간 UI 프리징
- 비동기로 변환 필요: `exec` + Promise 래핑
- **JSON 단일 객체 버그**: 이벤트 1개일 때 `ConvertTo-Json`이 배열 대신 객체 반환 → `.map()` 에러. 정규화: `Array.isArray(parsed) ? parsed : [parsed]`
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
- CI/CD가 있다면 빌드 시 자동 버전 주입 권장

### [ ] 10-0. 가설 상태 추적기 (Phase 5 전 — HypothesisTracker)
- `HypothesisTracker.jsx`: 가설 A/B/C를 순서대로 카드 표시. 각 카드에 "시도 중 / 완료 / 실패" 상태 표시
- 가설 우선순위: Gemini 응답에 `priority` 필드 추가 요청 → 낮은 위험도·직접 시도 가능한 것부터 정렬
- 현재 시도 중인 가설을 재현 모드 진입 시 자동 전달 (`selectedHypothesis` 필드)
- **모든 가설 소진 판단**: 마지막 가설이 "실패" 처리되면 재현 모드 또는 HW 전환 버튼 자동 활성화
- 사용자가 AI 판단 외에 **수동으로 HW 에스컬레이션** 버튼을 누를 수 있는 UX 필수

### [ ] 10-0-1. 재현 실패 분기 처리 (Phase 5 전 — PatternSelector)
- 재현 종료 후 delta가 임계값 미만 (CPU 변화 5%p 이하, 메모리 변화 200MB 이하) → 재현 실패 판단
- `GET /api/diagnosis/patterns {eventLog}` 호출 → 이벤트 로그에서 유사 패턴 추출
- `PatternSelector.jsx`: 추출된 패턴 목록 카드로 표시 → 사용자가 증상과 가장 유사한 패턴 선택
- 선택된 패턴을 `symptom` 대체 텍스트로 사용해 `/api/diagnosis/hypotheses` 재호출 (재진단)
- 패턴 없을 경우: "간헐적 증상이라 지금 당장 파악이 어려워요. 증상이 다시 나타나면 알려줘요" 안내

### [ ] 10-0-2. 신뢰도 표시 UI (Phase 5 전 — DiagnosisConfidence)
- Gemini 응답에 `confidence: 0.0~1.0` 필드 포함 요청 (System Prompt에 명시)
- `DiagnosisConfidence.jsx`: 원형 게이지 + % 숫자 표시
  - 80%+ → 초록 "높은 확신도"
  - 60~79% → 주황 "보통 확신도"
  - 60% 미만 → 빨강 + "수리기사 상담 권장" 배너 자동 표시
- 가설 카드마다 개별 신뢰도 표시 + 최종 진단 결과에도 표시

### [ ] 10-0-3. 복합 원인 계속 진단 경로 (Phase 5 전)
- 결과 화면에 "이게 전부가 아닐 수 있어요" 버튼 상시 노출
- 클릭 시 이전 진단 컨텍스트(가설, delta, HW 결과)를 유지한 채 Electron SW 재진단 요청
- 역방향 에스컬레이션 시 백엔드에 `previousDiagnosisId` 포함 → Gemini가 이전 결과를 참고해 보완 진단

### [ ] 10-1. 베이스라인 이상 상태 감지 (Phase 5 전)
- 재현 모드 시작 시 베이스라인 수집 직후 이미 비정상 여부 판단
  - CPU 90%+ / 메모리 95%+ / 디스크 I/O 포화 → 경고: "지금 상태가 이미 비정상이에요. 이 상태를 기준으로 측정할게요"
- 절대값 delta 대신 **상대 변화율(%) 기준**으로 이상 판단하도록 Gemini 프롬프트 수정
  - 예: "베이스라인 CPU 92%, 재현 중 94% → 변화 없음 / 베이스라인 30%, 재현 중 95% → 급격한 증가"

### [ ] 11. MediaRecorder iOS 오디오 포맷 분기 (Phase 8 전)
- Chrome/Edge: `audio/webm` ✅ / iOS Safari: `audio/mp4` ✅
- mimeType 분기: `MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'`
- **video+audio 동시 스트림 시 AEC 문제** — iOS 일부 버전에서 후면 카메라+마이크 동시 요청 시 자동 에코 제거로 비프음이 잘려나감. audio constraint에 `echoCancellation: false, noiseSuppression: false, autoGainControl: false` 명시 필수
- `audio/mp4`를 Gemini API에 전송할 때 mime type 명시 필수 (`audio/mp4`로 전달)

### [ ] 11-0. 네트워크 장애 폴백 (Phase 6 전)
- Spring 서버 응답 실패(타임아웃 5초) 시 Service Worker 캐시에서 이전 진단 패턴 반환
- 오프라인 모드 안내: "서버 연결이 안 됐어요. 이전 유사 진단 기준으로 참고 안내드릴게요"
- `/api/diagnosis/hypotheses` 실패 시 `diagnosisApi.js`에서 캐시된 마지막 응답 표시 (stale-while-revalidate)
- 네트워크 복구 후 자동 재시도 — 사용자가 다시 버튼 누를 필요 없음

### [ ] 11-0-1. 독립 모드 정확도 경고 UI (Phase 6 전)
- PWA 독립 모드 진입 시 첫 화면에 경고 카드 표시:
  "SW 데이터 없이 카메라/마이크만으로 분석해요. 정확도가 낮을 수 있어요."
- 진단 결과 상단에도 동일 경고 + `DiagnosisConfidence` 수치와 함께 표시
- 결과 화면에 "PC가 켜지면 Electron으로 SW 보완 진단을 해보세요" 안내 링크

### [ ] 11-1. BIOS 제조사 자동 감지 + 선택 UX (Phase 8 전)
- **세션 모드**: Electron에서 `systeminformation.bios()` → `{ vendor, version }` 수집 → 세션 생성 시 `biosType` 함께 저장
  - vendor 값 매핑: `"American Megatrends"` → AMI, `"Phoenix"` → Phoenix, `"Award"` → Award
  - PWA 세션 참여 시 서버에서 `biosType` 자동 수신 → `BiosTypeSelector`에 자동 선택 상태로 표시 (사용자 확인만)
- **독립 모드 또는 감지 실패**: `BiosTypeSelector.jsx`에서 수동 선택 (선택 없이 녹음 불가)
- 선택값을 `biosType` 필드로 백엔드 전송 → Gemini 프롬프트: `"BIOS 제조사: {biosType}. 해당 표준으로 비프음 코드 해석"`
- `get_manual_info(biosType, errorCode)` MCP 호출 시 `biosType` 필수 파라미터로 전달

### [ ] 11-2. 촬영 가이드 컴포넌트 (Phase 7 전)
- `ShootingGuide.jsx`: 부위별 권장 촬영 위치 다이어그램 표시
  - 메인보드 전체 → 커패시터 클로즈업 → RAM 슬롯 → GPU → 전원부 순서 안내
  - 권장 거리: 20~30cm / 조명: 플래시 ON 권장
- 촬영 시작 전 가이드 확인 단계 필수 (건너뛰기 허용하되 경고 표시)
- 독립 모드와 세션 모드 모두 동일 가이드 사용

### [ ] 11-2-1. 세션 만료 연장 + QR 수동 입력 폴백 (Phase 11 전)
- QR 표시 화면에 만료 카운트다운 타이머 표시 (5:00 → 0:00)
- 만료 1분 전 경고: "1분 남았어요! 준비가 더 필요하면 연장할 수 있어요"
- **연장**: `POST /api/session/{id}/extend` → 서버에서 `expiresAt + 5분` 갱신 (1회 한정). 이미 연장한 세션은 재연장 불가
- **수동 입력 폴백**: QR 스캔이 안 될 때를 위한 "코드 직접 입력" 옵션 → 6자리 단축 코드(서버가 세션 생성 시 별도 생성한 난수, DB `short_code` 컬럼 저장) 입력 → 서버에서 매핑 후 token 재발급

### [ ] 11-3. 세션 인증 토큰 (Phase 11 전)
- 현재 sessionId(UUID)만으로 세션 접근 가능 → 타인 세션 하이재킹 위험
- Phase 11 구현 시: 세션 생성 시 서버가 단기 토큰 발급 (`authToken = SecureRandom 8자리 alphanumeric`)
- QR 인코딩: `${PWA_BASE}/scan?session=UUID&token=TOKEN`
- PWA가 `/api/session/{id}/hardware` 요청 시 `X-Session-Token` 헤더 포함 → 서버에서 검증
- 토큰은 최초 검증 시 1회 폐기 + 세션 만료(5분)와 함께 소멸

### [ ] 12. Spring AI BOM 버전 고정 + MCP Silent Failure (Phase 9 전)
- `pom.xml` `dependencyManagement`에 `spring-ai-bom` 버전 명시 (`<version>1.0.0</version>`)
- **MCP Silent Failure**: `@Tool` 등록은 됐지만 AI가 실제로 툴을 호출하지 않는 경우 발생
  - 원인: Gemini Function Calling 스키마와 Spring AI가 생성하는 FunctionDeclaration 불일치
  - 로그에 에러 없음 — AI 응답에 매뉴얼 정보 포함 여부로만 확인 가능
  - 해결: System Prompt에 툴 호출 조건 명시 (`"증상에 관련 부품 모델명이 있으면 반드시 get_manual_info()를 먼저 호출"`)


---

## 🟢 Low Risk — 구현 중 참고

### [ ] 12-1. 사후 확인 피드백 루프 (Phase 10 전)
- `POST /api/diagnosis/{id}/feedback` DTO: `{ status: "RESOLVED" | "UNRESOLVED", note?: string }`
- `usePostDiagnosis.js`: 진단 완료 후 24시간 타이머 → 인앱 알림 "아직도 문제가 있나요?" 표시
  - PWA Push Notification 미지원 환경 → 다음 앱 실행 시 표시 (localStorage 타임스탬프 비교)
- UNRESOLVED 응답 시: 이전 `diagnosisId` + 피드백 텍스트를 컨텍스트로 포함해 `hypotheses` 재호출
- `SolutionKnowledge.successCount` 업데이트: RESOLVED 피드백 시 해당 솔루션 카운트 +1 → 향후 가설 우선순위에 반영

### [ ] 13-0. GPU 진단 데이터 한계 명시 (Phase 3)
- `systeminformation`은 GPU 모델명 + VRAM만 수집. GPU 사용률·온도 수집 불가
- GPU 관련 증상(게임 프리징, 화면 아티팩트) 진단 시 Gemini 프롬프트에 명시:
  `"GPU 상세 모니터링 데이터(사용률/온도) 수집 불가. 가용 데이터: 모델명, VRAM"`
- 사용자에게도 UI에 "GPU 온도는 HWMonitor 등 별도 툴로 확인 필요" 안내

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
| **1** | **API 비용 쿼터 설계**, Gemini 모델 접근 권한, JSONB vs TEXT 결정, extractText null 방어 |
| **2** | Electron CORS `app://`, IPC Strict Mode 이중 등록, **클립보드 이미지 붙여넣기** |
| **3** | CPU 온도 null → Gemini 프롬프트 처리, **GPU 데이터 한계 명시** |
| **4** | PowerShell async 변환 + JSON 배열 정규화, **macOS log 대체 수집** |
| **5** | **HypothesisTracker + 수동 HW 전환**, **재현 실패 → PatternSelector**, **DiagnosisConfidence UI**, **복합 원인 계속 진단**, 베이스라인 이상 감지 |
| **6** | PWA HTTPS(ngrok), SW 캐시 버전 관리, OpenCV PRECACHE, **독립 진입 경로**, **오프라인 폴백**, **독립 모드 정확도 경고** |
| **7** | OpenCV try/finally Mat.delete(), rAF cleanup, **ShootingGuide.jsx** |
| **8** | **BIOS 자동 감지 (systeminformation.bios) + 수동 선택 폴백**, MediaRecorder mimeType + AEC 비활성화 |
| **9** | Spring AI BOM 버전 고정, MCP Silent Failure 대응, `biosType` MCP 파라미터 추가 |
| **10** | Docker PostgreSQL 연결 타이밍, **사후 확인 피드백 루프 (usePostDiagnosis)** |
| **11** | **세션 연장 + 6자리 수동 입력 폴백**, 세션 인증 토큰 (QR + authToken), WebSocket 재연결 |

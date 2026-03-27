# 구현 전 체크리스트

> Phase 시작 전 해당 항목 미확인 시 구현 도중 블로킹 가능. 코드 패턴은 `snippets.md` 참조.

---

## 🔴 High Risk — Phase 시작 전 반드시 확인

### [ ] 0. API 비용 쿼터 설계 (Phase 1 전)
- 멀티모달 요청 = 입력 토큰 대량 소모 → IP 기반 일일 5회 제한 미설정 시 비용 폭증
- Spring `@RateLimiter` + 인메모리 카운터(MVP) → 초과 시 `429` 반환

### [ ] 1. Gemini API 모델 접근 권한 (Phase 1 전)
- `gemini-3.1-pro-preview` 미접근 시 `gemini-2.0-flash`로 `GEMINI_URL` 상수 교체
- `curl .../v1beta/models?key=YOUR_KEY` 로 목록 확인

### [ ] 2. JSONB vs TEXT 컬럼 전략 (Phase 1 전 — 이후 변경 시 ALTER TABLE 필요)
- Hibernate 6 + `columnDefinition="jsonb"` → 삽입 시 타입 불일치 오류 발생
- **권장**: `@Column(columnDefinition = "TEXT")` 사용. JSONB 인덱싱 필요 시 `AttributeConverter` 적용

### [ ] 3. GeminiService.extractText() null 방어 (Phase 1 전)
- 현재 null 방어 없음 → 404/401/빈 응답 시 NPE. `snippets.md` 패턴 적용 필수

### [ ] 4. CPU 온도 null 전파 처리 (Phase 3 전)
- AMD/일부 OEM에서 `cpuTemperature()` → `null` 반환 → UI "측정 불가" + Gemini 프롬프트에서 온도 필드 제외

### [ ] 5. PWA HTTPS 환경 준비 (Phase 6 전)
- `getUserMedia` + SW = HTTPS 필수. 실기기 테스트 시 `ngrok http 3000` 필요
- iOS Safari: 카메라 권한 매번 재요청, `audio/webm` 미지원 → 실기기에서만 확인 가능

### [ ] 5-1. PWA 독립 진입 경로 (Phase 6 전)
- URL `?session=` 파라미터 없으면 `standalone` 모드 → WS 연결 없이 HTTP 응답으로만 동작
- `useRuntimeMode`에 `'pwa-standalone'` 분기 추가. 관련 패턴: `snippets.md`

---

## 🟡 Medium Risk — 해당 Phase 도달 시 확인

### [ ] 6. Electron CORS `app://` 허용 (Phase 2)
- Electron 오리진 = `app://` 또는 `file://` → Spring CORS에 명시 필요

### [ ] 7. Electron IPC Strict Mode 이중 등록 (Phase 2)
- React 18 Strict Mode에서 `ipcRenderer.on()` 2회 등록 → `removeAllListeners()` 선행 필수. `snippets.md` 참조

### [ ] 7-0. 클립보드 이미지 붙여넣기 (Phase 2)
- `paste` 이벤트 → `clipboardData.items`에서 `image/*` 추출 → Base64 → `/api/diagnosis/hypotheses` body에 포함
- Web API 방식 우선 (IPC 불필요). 입력창 하단 썸네일 미리보기 필수

### [ ] 7-1. macOS Event Log 대체 수집 (Phase 4 — macOS 지원 시)
- `Get-WinEvent` 대신 `log show` 텍스트 파싱. `process.platform === 'darwin'` 분기로 분리

### [ ] 8. PowerShell execSync 블로킹 + JSON 배열 정규화 (Phase 4)
- `execSync` → UI 프리징. `exec` + Promise 래핑 필수
- 이벤트 1개 시 `ConvertTo-Json`이 객체 반환 → `Array.isArray(parsed) ? parsed : [parsed]` 정규화

### [ ] 9. OpenCV.js WASM 초기화 타이밍 + Mat 메모리 (Phase 6~7)
- `script.onload` → `cv.onRuntimeInitialized` 2단계 완료 후에만 `cv.Mat()` 사용 가능
- Mat은 `try/finally`로 `.delete()` 보장. `opencv.js` SW PRECACHE 포함 필수

### [ ] 10. Service Worker 캐시 버전 관리 (Phase 6)
- `CACHE = 'nextdoorcs-v1'` 고정 시 구버전 캐시와 새 API 충돌 → 배포마다 버전 증가

### [ ] 10-0. HypothesisTracker — 가설 상태 추적 (Phase 5)
- 가설 A/B/C 카드별 "시도 중 / 완료 / 실패" 상태 + 수동 HW 에스컬레이션 버튼 필수
- Gemini 응답에 `priority` + `confidence` 필드 포함 요청 (System Prompt에 명시)

### [ ] 10-0-1. 재현 실패 → PatternSelector 분기 (Phase 5)
- delta 임계값 미만(CPU 5%p↓, 메모리 200MB↓) → 재현 실패 판단 → `GET /api/diagnosis/patterns` 호출
- 패턴 없을 경우: "간헐적 증상이라 지금 당장 파악이 어려워요" 안내

### [ ] 10-0-2. DiagnosisConfidence UI (Phase 5)
- `confidence < 0.6` → 빨강 + "수리기사 상담 권장" 배너 자동 표시. 가설 카드마다 개별 표시

### [ ] 10-0-3. 복합 원인 계속 진단 (Phase 5)
- 결과 화면에 "이게 전부가 아닐 수 있어요" 버튼 상시 노출
- 클릭 시 `previousDiagnosisId` 포함 → Gemini 보완 진단

### [ ] 10-1. 베이스라인 이상 상태 감지 (Phase 5)
- 베이스라인 수집 직후 CPU 90%+ / 메모리 95%+ 시 경고 표시
- delta는 절대값 아닌 상대 변화율(%) 기준으로 Gemini 프롬프트 작성

### [ ] 11. MediaRecorder iOS 오디오 포맷 분기 (Phase 8)
- `isTypeSupported('audio/webm')` 분기로 iOS에서 `audio/mp4` 선택. `snippets.md` 참조
- AEC 비활성화(`echoCancellation: false` 등) 필수 — 비프음 주파수 제거 방지

### [ ] 11-0. 네트워크 장애 폴백 (Phase 6)
- 서버 타임아웃 5초 → SW 캐시에서 이전 진단 패턴 반환 (stale-while-revalidate)
- 복구 후 자동 재시도 — 사용자 재시도 불필요

### [ ] 11-0-1. 독립 모드 정확도 경고 UI (Phase 6)
- 진입 시 "SW 데이터 없이 분석" 경고 카드 + 결과 상단에도 표시

### [ ] 11-1. BIOS 제조사 자동 감지 + 수동 폴백 (Phase 8)
- 세션 모드: `systeminformation.bios().vendor` → `biosType` 세션 저장 → PWA 자동 수신
- 독립 모드 또는 감지 실패: `BiosTypeSelector` 수동 선택 (선택 없이 녹음 불가)

### [ ] 11-2. ShootingGuide 컴포넌트 (Phase 7)
- 메인보드→커패시터→RAM→GPU→전원부 순서 다이어그램. 권장 거리 20~30cm, 플래시 ON

### [ ] 11-2-1. 세션 연장 + 수동 입력 폴백 (Phase 11)
- 만료 1분 전 경고 + `POST /api/session/{id}/extend` (+5분, 1회 한정)
- QR 스캔 실패 시 6자리 단축 코드(`short_code`) 수동 입력 → 서버 매핑 후 token 재발급

### [ ] 11-3. 세션 인증 토큰 (Phase 11)
- sessionId(UUID)만으론 하이재킹 위험 → `authToken` 8자리 SecureRandom 발급
- QR: `?session=UUID&token=TOKEN`. `X-Session-Token` 헤더 검증 후 1회 폐기

### [ ] 12. Spring AI BOM 버전 고정 + MCP Silent Failure (Phase 9)
- `pom.xml`에 `spring-ai-bom` 버전 명시 필수
- MCP Silent Failure: 로그 없이 툴 미호출 → System Prompt에 호출 조건 명시로 대응

---

## 🟢 Low Risk — 구현 중 참고

### [ ] 12-1. 사후 확인 피드백 루프 (Phase 10)
- 진단 완료 후 24시간 타이머 → "아직 문제 있나요?" 인앱 알림
- RESOLVED: `successCount +1` / UNRESOLVED: 이전 컨텍스트 포함 재진단

### [ ] 13-0. GPU 진단 데이터 한계 명시 (Phase 3)
- `systeminformation`은 GPU 모델명 + VRAM만 수집. 사용률·온도 불가 → Gemini 프롬프트 + UI에 명시

### [ ] 13. Electron 배포 코드 서명 (최종 빌드)
- 서명 없으면 SmartScreen 경고. 개인용 무시 가능 — 실 배포 시 EV 인증서 필요

### [ ] 14. useRuntimeMode HMR 분기 오탐 (개발 중)
- HMR 중 `window.electronAPI` 일시 undefined → PWA로 오탐. 개발 환경 한정, 배포 빌드 무관

### [ ] 15. Docker PostgreSQL 연결 준비 타이밍 (Phase 10)
- `depends_on`은 시작만 보장 → `HIKARI_CONNECTION-TIMEOUT` 설정으로 재시도 보장

---

## 🟡 Phase 7-B — 라이브 카메라 가이드 모드

### [ ] 16. EventSource vs fetch() 스트리밍 (Phase 7-B 전)
- `EventSource`는 GET만 지원 → 프레임 Base64 POST 불가. `fetch()` + `ReadableStream` 필수. `snippets.md` 참조

### [ ] 17. OpenCV CLAHE + prevHist 수명 관리 (Phase 7-B 전)
- `claheRef`: `useRef` 1회 생성, 언마운트 시 `delete()`. `prevHistRef`: 교체 전 `delete()` 후 `clone()`

### [ ] 18. isSendingRef 동시 전송 차단 (Phase 7-B 전)
- rAF(동기)와 fetch(비동기) 별개 타이밍 → `isSendingRef` true 시 새 프레임 무시. `finally`에서 해제

### [ ] 19. SseEmitter 60초 타임아웃 + 비동기 처리 (Phase 7-B 전)
- 기본 30초 → 조기 종료 위험. `new SseEmitter(60_000L)` + `CompletableFuture.runAsync()` 필수

### [ ] 20. 가이드 세션 인메모리 관리 (Phase 7-B 전)
- `ConcurrentHashMap` + `@Scheduled` 15분 만료 스케줄. DB 영속화 불필요

### [ ] 21. iOS 카메라 권한 유지 (Phase 7-B 전)
- 포커스 이탈 시 스트림 강제 종료 → 가이드 모드 중 내부 라우팅 금지. 모달/오버레이로만 UI 처리

### [ ] 22. BIOS 화면 촬영 안내 (Phase 7-B 전)
- 30~50cm 정면 촬영, 주변 조명 ON 안내. CLAHE 전처리로 저대비 보완하나 극단적 어두움은 한계

### [ ] 22-1. `[완료]` 태그 청크 분할 대응 (Phase 7-B 전)
- SSE 청크 경계에서 태그 분할 가능 → 청크별 검사 금지. **`accumulated.includes('[완료]')`** 로 최종 판단
- `snippets.md` `[Live Guide] [완료] 태그 누적 버퍼 검사` 참조

### [ ] 22-2. GuideContext 정적 선행 안내 (Phase 7-B 전)
- 세션 시작 → 첫 Gemini 응답 최대 10초 공백 → `STATIC_FIRST_GUIDE[context]` 즉시 표시
- Gemini 응답 도착 시 교체. `GuideBubble` fallback text를 이 값으로 설정
- `snippets.md` `[Live Guide] GuideContext 정적 선행 안내` 참조

### [ ] 22-3. 3단계 즉각 피드백 UI (Phase 7-B 전)
- 공백 5~10초 동안 단계별 피드백 필수: 📸 캡처됨(0.5초) → ⏳ 분석 중+경과시간 → 응답 표시
- 3초: "잠시만요!", 7초: "거의 다 됐어요" 보조 메시지. `captureState` + `elapsedTimerRef` 관리
- `snippets.md` `[Live Guide] 3단계 즉각 피드백 UI` 참조

### [ ] 22-4. 히스토그램 3프레임 연속 확인 (Phase 7-B 전)
- 단발 감지 → 손 떨림/Rolling Shutter false positive 발생. `changeCountRef`로 연속 3프레임 확인
- 변화 없는 프레임 1개라도 끼이면 카운트 리셋. `snippets.md` `[Live Guide] 히스토그램 3프레임 연속 안정화` 참조

### [ ] 22-5. AbortController — 언마운트 시 fetch 취소 (Phase 7-B 전)
- 언마운트/`endSession()` 시 진행 중 스트림 즉시 취소. `AbortError`는 catch에서 무시
- `snippets.md` `[Live Guide] AbortController` 참조

### [ ] 22-6. stale guide 시간차 경고 (Phase 7-B 전)
- 응답 대기 중 화면 전환 → 구버전 화면 기준 안내 도착 위험
- 응답 도착 시 `capturedHistRef` vs 현재 히스토그램 비교. 유사도 < 0.7 → 경고 버블
- `capturedHistRef` 사용 후 반드시 `delete()`. `snippets.md` `[Live Guide] stale guide` 참조

---

## Phase별 체크 요약

| Phase | 확인 항목 |
|---|---|
| **1** | **API 비용 쿼터 설계**, Gemini 모델 접근 권한, JSONB vs TEXT 결정, extractText null 방어 |
| **2** | Electron CORS `app://`, IPC Strict Mode 이중 등록, **클립보드 이미지 붙여넣기** |
| **3** | CPU 온도 null → Gemini 프롬프트 처리, **GPU 데이터 한계 명시** |
| **4** | PowerShell async 변환 + JSON 배열 정규화, macOS log 대체 수집 |
| **5** | **HypothesisTracker + 수동 HW 전환**, **재현 실패 → PatternSelector**, **DiagnosisConfidence UI**, **복합 원인 계속 진단**, 베이스라인 이상 감지 |
| **6** | PWA HTTPS(ngrok), SW 캐시 버전 관리, OpenCV PRECACHE, **독립 진입 경로**, **오프라인 폴백**, **독립 모드 정확도 경고** |
| **7** | OpenCV try/finally Mat.delete(), rAF cleanup, **ShootingGuide** |
| **7-B** | fetch() 스트리밍, CLAHE/prevHist 수명 관리, isSendingRef, SseEmitter 60초, iOS 카메라 권한, **`[완료]` 버퍼 검사**, **정적 선행 안내**, **3단계 피드백 UI**, **3프레임 히스토그램**, **AbortController**, **stale guide 경고** |
| **8** | **BIOS 자동 감지 + 수동 폴백**, MediaRecorder mimeType + AEC 비활성화 |
| **9** | Spring AI BOM 버전 고정, MCP Silent Failure 대응 |
| **10** | Docker PostgreSQL 연결 타이밍, **사후 확인 피드백 루프** |
| **11** | **세션 연장 + 6자리 수동 입력 폴백**, 세션 인증 토큰 (QR + authToken) |

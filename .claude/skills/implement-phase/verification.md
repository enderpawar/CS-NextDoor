# Phase별 빌드 & 검증 체크리스트

> SKILL.md 6단계에서 참조. 해당 Phase 블록을 실행하여 완료 조건을 검증합니다.

---

### Phase 1 — 백엔드 Gemini API

```bash
# 빌드 & 단위 테스트
cd backend
./mvnw clean install
./mvnw test

# 서버 실행
./mvnw spring-boot:run

# 통합 검증 — 하드웨어 진단 엔드포인트
curl -X POST http://localhost:8080/api/diagnosis/hardware \
  -F "image=@test.jpg" \
  -F "symptom=부팅이 안 됩니다"
# ✅ 기대값: {"cause": "...", "solution": "...", "confidence": 0.xx}

# 통합 검증 — 소프트웨어 진단 엔드포인트
curl -X POST http://localhost:8080/api/diagnosis/hypotheses \
  -H "Content-Type: application/json" \
  -d '{"symptom":"부팅 후 블루스크린","systemSnapshot":{"cpu":{"usage":92},"memory":{"used":14000000000,"total":16000000000}}}'
# ✅ 기대값: {"diagnosisId":"...","hypotheses":[{"priority":"A",...}],"immediateAction":"..."}
```

**완료 기준**: 두 엔드포인트 모두 한국어 AI 진단 결과 JSON 반환

---

### Phase 2 — Electron 앱 셋업

```bash
# 의존성 설치
npm install

# 개발 모드 실행 (백엔드도 함께 켜두기)
npm run electron:dev

# DevTools 콘솔 (Ctrl+Shift+I) 에서 IPC 검증
await window.electronAPI.getSystemInfo()
# ✅ 기대값: { cpu: {...}, memory: {...}, gpu: {...}, disk: {...} }

# 보안 설정 확인 (main.ts)
# ✅ contextIsolation: true
# ✅ nodeIntegration: false

# 클립보드 이미지 붙여넣기 검증
# ✅ 증상 입력창에 Ctrl+V → 이미지 썸네일 표시
```

**완료 기준**: Electron 창 실행 + `getSystemInfo()` 정상 반환 + 클립보드 붙여넣기 동작

---

### Phase 3 — 시스템 모니터

```bash
npm run electron:dev

# UI 육안 검증
# ✅ CPU 사용률 (%) 실시간 표시
# ✅ GPU 모델명 + VRAM 표시 (사용률·온도는 수집 불가 — UI에 명시)
# ✅ 메모리 used / total (GB) 표시
# ✅ CPU 온도 (°C) 표시 — null이면 "측정 불가" 표시
# ✅ 2초 간격으로 수치 업데이트

# 콘솔에서 주기적 업데이트 확인
# ✅ system-update IPC 이벤트 2초마다 수신되는지 확인
```

**완료 기준**: `SystemDashboard`에 CPU/메모리 실시간 수치 + GPU 한계 안내 표시

---

### Phase 4 — 프로세스 + 이벤트 그로

```bash
npm run electron:dev

# 프로세스 목록 검증
# ✅ CPU 점유율 상위 10개 프로세스 표시
# ✅ 메모리 사용량 기준 정렬 가능

# 이벤트 로그 검증 (Windows PowerShell로 직접 비교)
powershell "Get-WinEvent -LogName System -MaxEvents 20 | Where-Object {$_.Level -le 2}"
# ✅ UI의 에러/경고 목록과 일치하는지 확인

# 백엔드 전송 검증
curl -X POST http://localhost:8080/api/diagnosis/hypotheses \
  -H "Content-Type: application/json" \
  -d @electron/test/system-snapshot.json
# ✅ 이벤트 로그 에러 기반 원인 분석 결과 반환
```

**완료 기준**: 프로세스 목록 + 이벤트 로그 에러 표시 + AI 분석 요청 정상

---

### Phase 5 — 소프트웨어 Gemini 진단 풀 플로우

```bash
npm run electron:dev

# 1. 가설 추적기 검증
# ✅ 증상 입력 + "진단 요청" → HypothesisTracker에 가설 A/B/C 카드 표시
# ✅ 각 카드: 우선순위(A/B/C) + 신뢰도(%) + "시도 중 / 완료 / 실패" 상태 버튼
# ✅ confidence < 0.6 → 빨강 + "수리기사 상담 권장" 배너 자동 표시
# ✅ "이게 전부가 아닐 수 있어요" 버튼 → previousDiagnosisId 포함 재진단

# 2. 재현 모드 검증
# ✅ 가설 소진 후 재현 모드 진입 → 베이스라인 수집
# ✅ CPU 90%+ 또는 메모리 95%+ 시 "비정상 베이스라인" 경고 표시
# ✅ 재현 성공(delta 임계값 초과) → /api/diagnosis/software 전송 → 확정 결과
# ✅ 재현 실패(delta 미달) → PatternSelector → 유사 패턴 제안

# PatternSelector 분기 API 검증 (재현 실패 시나리오)
curl -X POST http://localhost:8080/api/diagnosis/patterns \
  -H "Content-Type: application/json" \
  -d '{"eventLog":[{"id":41,"levelDisplayName":"Error","message":"커널 오류"}]}'
# ✅ 유사 패턴 목록 반환 — 빈 배열이면 "간헐적 증상이라 지금 당장 파악이 어려워요" 안내 표시 확인

# 3. 수동 HW 에스컬레이션
# ✅ "하드웨어 점검 필요" 버튼 → Phase 11 QR 세션 진입
```

**완료 기준**: 가설 카드 + 신뢰도 UI + 재현 모드 + PatternSelector 분기 모두 동작

---

### Phase 6 — PWA 셋업 + 카메라

```bash
# PWA 개발 서버
npm run pwa:dev   # http://localhost:3000

# 모바일 브라우저 접속 (같은 Wi-Fi)
# http://<PC IP>:3000

# 검증 항목
# ✅ 후면 카메라 권한 요청 팝업 표시
# ✅ 후면 카메라 (facingMode: environment) 스트림 표시
# ✅ "홈 화면에 추가" 배너 표시 (manifest.json 정상)
# ✅ URL에 ?session= 없으면 standalone 모드 → WS 연결 없이 동작
# ✅ standalone 진입 시 "SW 데이터 없이 분석" 경고 카드 표시

# Lighthouse PWA 점수 확인 (Chrome DevTools → Lighthouse)
# ✅ PWA 점수 80점 이상
# ✅ Service Worker 등록 완료

# 오프라인 테스트
# ✅ 네트워크 차단 후 앱 재접속 → 캐시된 UI 로드
# ✅ API 요청 실패 시 5초 후 자동 재시도
```

**완료 기준**: 후면 카메라 스트림 + Lighthouse PWA 80점 + 독립 모드 분기 동작

---

### Phase 7 — OpenCV 오버레이 + 촬영 가이드

```bash
npm run pwa:dev

# OpenCV 로드 확인 (브라우저 콘솔)
window.cv
# ✅ undefined가 아닌 OpenCV 객체 반환

# 육안 검증
# ✅ 카메라 위에 초록 윤곽선 박스 오버레이
# ✅ 큰 사각형 컴포넌트 감지 시 "부품 감지됨" 레이블
# ✅ ShootingGuide: 메인보드→커패시터→RAM→GPU→전원부 순서 다이어그램 표시
# ✅ 권장 거리 20~30cm, 플래시 ON 안내 표시

# 영상 분석 검증
# ✅ "영상 진단" 모드에서 1~2초 간격 프레임 자동 캡처
# ✅ 복수 프레임 배열 전송 → AI 연속 분석 결과

curl -X POST http://localhost:8080/api/diagnosis/hardware \
  -F "image=@mainboard.jpg" \
  -F "symptom=메인보드 상태 확인"
# ✅ AI가 이미지 내 부품 상태 분석
```

**완료 기준**: OpenCV 오버레이 + ShootingGuide 다이어그램 + 이미지 전송 → AI 진단 결과

---

### Phase 7-B — 라이브 카메라 가이드 모드

```bash
npm run pwa:dev

# 1. 가이드 세션 시작 검증
# ✅ GuideContextSelector에서 컨텍스트 선택 (BIOS_ENTRY / BOOT_MENU 등 5종)
# ✅ 선택 즉시 STATIC_FIRST_GUIDE[context] 텍스트 표시 (Gemini 응답 전 공백 제거)

curl -X POST http://localhost:8080/api/guide/start \
  -H "Content-Type: application/json" \
  -d '{"context":"BIOS_ENTRY"}'
# ✅ 기대값: {"sessionId":"..."}

# 2. 히스토그램 변화 감지 → 전송 흐름 검증
# ✅ 카메라를 천천히 움직이면 "📸 캡처됨" 배지 표시 (0.5초)
# ✅ 이후 "⏳ 분석 중" + 경과 시간 타이머 표시
# ✅ 3초 경과 시 "잠시만요!", 7초 경과 시 "거의 다 됐어요" 보조 메시지
# ✅ Gemini 응답 도착 → GuideBubble에 타이핑 효과로 표시

# 3. SSE 스트리밍 검증
curl -X POST http://localhost:8080/api/guide/{sessionId}/frame \
  -H "Content-Type: application/json" \
  -d '{"frameBase64":"<base64>","history":[]}' \
  --no-buffer
# ✅ text/event-stream 응답 + 청크 분할 스트리밍

# 4. 비용 제어 검증
# ✅ 동일 화면 유지 시 추가 전송 없음 (히스토그램 유사도 0.92 이상)
# ✅ 연속 3프레임 변화 감지 후에만 전송 (손 떨림 false positive 차단)
# ✅ 이전 응답 완료 전 새 프레임 무시 (isSendingRef 동작)

# 5. 세션 종료 검증
# ✅ Gemini 응답에 [완료] 포함 → 자동 세션 종료 (누적 버퍼 기준)
# ✅ 종료 버튼 클릭 → DELETE /api/guide/{id} 호출 + 카메라 스트림 중단

curl -X DELETE http://localhost:8080/api/guide/{sessionId}
# ✅ 204 No Content

# 6. stale guide 경고 검증
# ✅ 응답 대기 중 화면 전환 → "화면이 바뀐 것 같아요" 경고 버블 표시
```

**완료 기준**: 컨텍스트 선택 → 정적 안내 즉시 표시 → 화면 변화 감지 → 3단계 피드백 → SSE 수신 → [완료] 자동 종료

---

### Phase 8 — BIOS 감지 + 오디오 진단

```bash
npm run electron:dev
npm run pwa:dev

# 1. BIOS 제조사 자동 감지 검증 (세션 모드)
# ✅ Electron: systeminformation.bios().vendor → 세션에 biosType 저장
# ✅ PWA: 세션 연결 후 BIOS 제조사 자동 표시 (수동 선택 불필요)

# 2. BIOS 수동 선택 폴백 검증 (독립 모드 또는 감지 실패)
# ✅ BiosTypeSelector에 AMI / Award / Phoenix / 기타 선택지 표시
# ✅ 선택 없이 녹음 버튼 비활성화

# 3. 오디오 진단 검증
curl -X POST http://localhost:8080/api/diagnosis/hardware \
  -F "audio=@beep_3short.webm" \
  -F "audioMimeType=audio/webm" \
  -F "biosType=AMI" \
  -F "symptom=부팅 시 짧은 비프음 3번"
# ✅ 기대값: "짧은 비프음 3번은 RAM 오류를 의미해..."

# PWA UI 검증
# ✅ 마이크 권한 요청 팝업
# ✅ 녹음 중 시각적 피드백 (파형 또는 타이머)
# ✅ 녹음 완료 → 자동 전송 → AI 분석 결과
# ✅ iOS Safari: audio/mp4 포맷으로 녹음됨 (webm 미지원)
```

**완료 기준**: BIOS 자동 감지 + 수동 폴백 + 녹음 → 비프음 패턴 분석 결과 30초 내 수신

---

### Phase 9 — MCP 툴 연동

```bash
cd backend && ./mvnw test

# MCP 툴 호출 로그 확인 (Spring Boot 로그)
# ✅ "Calling tool: get_manual_info" 로그 출력

# AI 응답에 툴 결과 포함 확인
curl -X POST http://localhost:8080/api/diagnosis/hardware \
  -F "image=@mainboard.jpg" \
  -F "symptom=ASUS B760 메인보드 3번 비프음"
# ✅ 응답에 매뉴얼 출처 URL 포함
```

**완료 기준**: AI 응답에 매뉴얼 정보 포함

---

### Phase 10 — DB 진단 이력

```bash
cd backend && ./mvnw test

# 진단 후 DB 레코드 확인
psql -U postgres -d nextdoorcs \
  -c "SELECT id, symptom_description, created_at FROM diagnosis_history ORDER BY created_at DESC LIMIT 3;"
# ✅ 방금 진단한 레코드 존재

# 이력 API 검증
curl http://localhost:8080/api/diagnosis/history/{sessionId}
# ✅ 진단 이력 JSON 배열 반환

# 사후 확인 피드백 검증
curl -X POST http://localhost:8080/api/diagnosis/{id}/feedback \
  -H "Content-Type: application/json" \
  -d '{"status":"RESOLVED"}'
# ✅ successCount +1 확인 (DB 조회)
```

**완료 기준**: 진단 요청 → DB 레코드 생성 → 이력 API 정상 조회 → 피드백 반영

---

### Phase 11 — 크로스 플랫폼 세션

```bash
# 백엔드 실행 (WebSocket 지원 포함)
cd backend && ./mvnw spring-boot:run

# 1. Electron 앱 실행 → QR 코드 표시 확인
npm run electron:dev

# 2. 세션 생성 API 검증
curl -X POST http://localhost:8080/api/session/create
# ✅ 기대값: {"sessionId":"...","authToken":"...","shortCode":"000000","expiresAt":"..."}

# 3. PWA 모바일에서 QR 스캔 후 세션 상태 확인
curl http://localhost:8080/api/session/{sessionId}/status
# ✅ {"status": "SW_READY"} 또는 "HW_READY"

# 4. WebSocket 이벤트 수신 확인 (브라우저 콘솔)
# ✅ SW_READY → HW_READY → DONE 순서로 이벤트 수신

# 5. 세션 연장 + 수동 입력 폴백 검증
# ✅ 만료 1분 전 경고 배너 표시
curl -X POST http://localhost:8080/api/session/{id}/extend
# ✅ expiresAt +5분 갱신 (1회 한정)
# ✅ 6자리 shortCode 수동 입력 → 정상 연결

# 6. 통합 진단 결과 확인
# ✅ DiagnosisResult 카드에 SW + HW 통합 분석 결과 표시

# 세션 만료 스케줄러 확인 (Spring Boot 로그)
# ✅ "@Scheduled expireSessions" 로그 1분마다 출력
```

**완료 기준**: QR 표시 → PWA 스캔 → WebSocket 연결 → 양측 데이터 제출 → 통합 진단 결과 수신

---
name: implement-phase
description: 옆집 컴공생 프로젝트의 특정 Phase를 구현하고 빌드/검증합니다. Phase 번호(1~10)를 인자로 받습니다.
argument-hint: <phase-number> (1~10)
---

# 옆집 컴공생 — Phase $ARGUMENTS 구현

CLAUDE.md와 `.claude/rules/snippets.md`를 참고하여 **Phase $ARGUMENTS**를 구현합니다.
반드시 완료 조건을 통과한 후 다음 Phase로 진행합니다.

---

## Phase 목표 & 완료 조건 요약

| Phase | 환경 | 목표 | 완료 조건 |
|---|---|---|---|
| **1** | 공통 | 백엔드 Gemini API | `curl` POST → AI 진단 JSON 수신 |
| **2** | Electron | 앱 셋업 + IPC | 창 실행 + `getSystemInfo()` 객체 반환 |
| **3** | Electron | 시스템 모니터 | UI에 CPU/GPU/온도 실시간 표시 |
| **4** | Electron | 프로세스 + 이벤트 로그 | 고부하 프로세스 목록 + 이벤트 에러 표시 |
| **5** | Electron | SW 진단 Gemini 연동 | 시스템 스냅샷 전송 → AI 진단 결과 수신 |
| **6** | PWA | PWA 셋업 + 카메라 | 모바일 후면 카메라 스트림 표시 |
| **7** | PWA | OpenCV 오버레이 + 영상 분석 | 부품 윤곽 박스 표시 + 프레임 추출 전송 |
| **8** | PWA | 비프음/팬소음 오디오 진단 | 녹음 전송 → 비프음 패턴 분석 결과 |
| **9** | 공통 | MCP 툴 연동 | AI 응답에 매뉴얼 출처 + 부품 가격 포함 |
| **10** | 공통 | DB 진단 이력 | 진단 후 DB 레코드 생성 확인 |

---

## 공통 구현 순서

1. `.claude/rules/snippets.md`에서 해당 Phase 스니펫 확인 (Read 도구로 직접 열기)
2. `.claude/rules/data-model.md`에서 관련 엔티티 확인 (Phase 10, Read 도구로 직접 열기)
3. `.claude/rules/implementation-checklist.md`에서 해당 Phase 확인 항목 점검
4. CLAUDE.md `Project Structure` 기준으로 파일 생성/수정
5. 빌드 → 단위 테스트 → 통합 검증 (아래 체크리스트 순서 준수)
6. 완료 조건 통과 확인 후 다음 Phase 진행

---

## Phase별 빌드 & 검증 체크리스트

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
# ✅ 기대값: {"result": "어, 이거 내가 봐줄게..."}

# 통합 검증 — 소프트웨어 진단 엔드포인트
curl -X POST http://localhost:8080/api/diagnosis/software \
  -H "Content-Type: application/json" \
  -d '{"cpuLoad":"92","temperature":{"cpu":95},"topProcesses":[{"name":"Chrome","cpu":45}]}'
# ✅ 기대값: CPU 과부하/과열 원인 분석 텍스트
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
# ✅ 기대값: { cpu: {...}, memory: {...}, gpu: {...}, temperature: {...} }

# 보안 설정 확인 (main.js)
# ✅ contextIsolation: true
# ✅ nodeIntegration: false
```

**완료 기준**: Electron 창 실행 + DevTools에서 `getSystemInfo()` 정상 반환

---

### Phase 3 — 시스템 모니터

```bash
npm run electron:dev

# UI 육안 검증
# ✅ CPU 사용률 (%) 실시간 표시
# ✅ GPU 모델명 + 사용률 표시
# ✅ 메모리 used / total (GB) 표시
# ✅ CPU 온도 (°C) 표시 — null이면 WMI 권한 문제
# ✅ 2초 간격으로 수치 업데이트

# 콘솔에서 주기적 업데이트 확인
# system-update IPC 이벤트 2초마다 수신되는지 확인
```

**완료 기준**: `SystemDashboard`에 CPU/메모리 실시간 수치 정상 표시

---

### Phase 4 — 프로세스 + 이벤트 로그

```bash
npm run electron:dev

# 프로세스 목록 검증
# ✅ CPU 점유율 상위 10개 프로세스 표시
# ✅ 메모리 사용량 기준 정렬 가능

# 이벤트 로그 검증 (Windows PowerShell로 직접 비교)
powershell "Get-WinEvent -LogName System -MaxEvents 20 | Where-Object {$_.Level -le 2}"
# ✅ UI의 에러/경고 목록과 일치하는지 확인

# 백엔드 전송 검증
curl -X POST http://localhost:8080/api/diagnosis/software \
  -H "Content-Type: application/json" \
  -d @electron/test/system-snapshot.json
# ✅ 이벤트 로그 에러 기반 원인 분석 결과 반환
```

**완료 기준**: 프로세스 목록 + 이벤트 로그 에러 표시 + AI 분석 요청 정상

---

### Phase 5 — 소프트웨어 Gemini 진단 연동

```bash
npm run electron:dev

# E2E 검증 — 전체 흐름
# 1. Electron 실행 → 데이터 자동 수집
# 2. "AI 진단 요청" 버튼 클릭
# 3. Spring Boot → Gemini 호출
# 4. DiagnosisResult 카드에 결과 표시

# ✅ 수집 데이터가 Spring Boot 로그에 수신되는지 확인
# ✅ Gemini 응답에 구체적 해결 방법 포함 여부
# ✅ 응답 시간 30초 이내
```

**완료 기준**: 버튼 클릭 → 30초 내 AI 소프트웨어 진단 결과 카드 표시

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

# Lighthouse PWA 점수 확인 (Chrome DevTools → Lighthouse)
# ✅ PWA 점수 80점 이상
# ✅ Service Worker 등록 완료

# 오프라인 테스트
# 네트워크 차단 후 앱 재접속 → 캐시된 UI 로드 확인
```

**완료 기준**: 후면 카메라 스트림 표시 + Lighthouse PWA 80점 이상

---

### Phase 7 — OpenCV 오버레이 + 영상 분석

```bash
npm run pwa:dev

# OpenCV 로드 확인 (브라우저 콘솔)
window.cv
# ✅ undefined가 아닌 OpenCV 객체 반환

# 육안 검증
# ✅ 카메라 위에 초록 윤곽선 박스 오버레이
# ✅ 큰 사각형 컴포넌트 감지 시 "부품 감지됨" 레이블
# ✅ 촬영 버튼 → 스틸컷 캡처 → 백엔드 전송

# 영상 분석 검증
# ✅ "영상 진단" 모드에서 1~2초 간격 프레임 자동 캡처
# ✅ 복수 프레임 배열 전송 → AI 연속 분석 결과

curl -X POST http://localhost:8080/api/diagnosis/hardware \
  -F "image=@mainboard.jpg" \
  -F "symptom=메인보드 상태 확인"
# ✅ AI가 이미지 내 부품 상태 분석
```

**완료 기준**: OpenCV 오버레이 렌더링 + 이미지 전송 → AI 하드웨어 진단 결과

---

### Phase 8 — 비프음/팬소음 오디오 진단

```bash
# 오디오 파일 전송 테스트
curl -X POST http://localhost:8080/api/diagnosis/hardware \
  -F "audio=@beep_3short.webm" \
  -F "symptom=부팅 시 짧은 비프음 3번"
# ✅ 기대값: "짧은 비프음 3번은 RAM 오류를 의미해..."

# PWA UI 검증
# ✅ 마이크 권한 요청 팝업
# ✅ 녹음 중 시각적 피드백 (파형 또는 타이머)
# ✅ 녹음 완료 → 자동 전송 → AI 분석 결과
```

**완료 기준**: 녹음 → 전송 → 비프음 패턴 분석 결과 30초 내 수신

---

### Phase 9 — MCP 툴 연동

```bash
cd backend && ./mvnw test

# MCP 툴 호출 로그 확인 (Spring Boot 로그)
# ✅ "Calling tool: get_manual_info" 로그 출력
# ✅ "Calling tool: get_part_price" 로그 출력

# AI 응답에 툴 결과 포함 확인
curl -X POST http://localhost:8080/api/diagnosis/hardware \
  -F "image=@mainboard.jpg" \
  -F "symptom=ASUS B760 메인보드 3번 비프음"
# ✅ 응답에 매뉴얼 출처 URL 포함
# ✅ 응답에 관련 부품 최저가 포함
```

**완료 기준**: AI 응답에 매뉴얼 정보 + 가격 데이터 포함

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
```

**완료 기준**: 진단 요청 → DB 레코드 생성 → 이력 API 정상 조회

---

## 공통 주의사항

- **Gemini 모델명**: `gemini-3.1-pro-preview`
- **Electron 보안**: `contextIsolation: true`, `nodeIntegration: false` 반드시 유지
- **PWA HTTPS**: `getUserMedia` + Service Worker는 HTTPS 필수 (localhost 제외)
- **OpenCV.js**: Mat 사용 후 `.delete()` 메모리 해제 필수
- **영상 전송**: 영상 전체 X, 1~2초 간격 핵심 프레임만 추출해서 전송
- **온도 null**: CPU 온도가 null이면 일부 Windows 환경 WMI 미지원 → 무시하고 진행
- **환경변수**: `.env`에 `GEMINI_API_KEY` 설정 후 시작

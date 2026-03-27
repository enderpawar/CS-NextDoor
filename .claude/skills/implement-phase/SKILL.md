---
name: implement-phase
description: 옆집 컴공생 프로젝트의 특정 Phase를 구현하고 빌드/검증합니다. Phase 번호(1~11, 7-B 포함)를 인자로 받습니다.
argument-hint: <phase-number> (1~11, 7-B)
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
| **5** | Electron | SW 진단 풀 플로우 | 가설 A/B/C 카드 표시 + 재현 모드 + 신뢰도 UI |
| **6** | PWA | PWA 셋업 + 카메라 | 모바일 후면 카메라 스트림 표시 |
| **7** | PWA | OpenCV 오버레이 + 촬영 가이드 | 부품 윤곽 박스 + ShootingGuide + 프레임 전송 |
| **7-B** | PWA | 라이브 카메라 가이드 모드 | BIOS 화면 비추기 → 단계별 안내 SSE 수신 |
| **8** | PWA | BIOS 감지 + 오디오 진단 | BIOS 제조사 자동 감지 + 녹음 → 비프음 분석 |
| **9** | 공통 | MCP 툴 연동 | AI 응답에 매뉴얼 출처 포함 |
| **10** | 공통 | DB 진단 이력 | 진단 후 DB 레코드 생성 확인 |
| **11** | 공통 | 크로스 플랫폼 세션 | QR 스캔 → WebSocket 연결 → 통합 진단 결과 수신 |

---

## 공통 구현 순서

> 순서가 실무 위험 우선순위와 일치해야 한다. checklist High Risk를 먼저 확인해야 구현 도중 블로킹을 방지할 수 있다.

1. `.claude/rules/implementation-checklist.md` 해당 Phase 🔴 High Risk 항목 선확인 — 미확인 시 구현 도중 블로킹 가능
2. `.claude/rules/api-endpoints.md` + `.claude/rules/workflow.md` 로 흐름·분기 확인
3. `.claude/rules/data-model.md` 관련 엔티티 확인 (JSONB/TEXT 전략은 Phase 1부터 해당)
4. `.claude/rules/snippets.md` 해당 Phase 스니펫 확인
5. CLAUDE.md `Project Structure` 기준으로 파일 생성/수정
6. 빌드 → 단위 테스트 → 통합 검증 (`verification.md` 해당 Phase 블록 실행)
7. 완료 조건 + 분기 시나리오 통과 확인 후 다음 Phase 진행

> Phase별 bash 검증 명령어는 `.claude/skills/implement-phase/verification.md`를 Read하여 확인합니다.

---

## 공통 주의사항

- **Gemini 모델명**: `gemini-3.1-pro-preview` — 미접근 시 `gemini-2.0-flash` 대체
- **Electron 보안**: `contextIsolation: true`, `nodeIntegration: false` 반드시 유지
- **PWA HTTPS**: `getUserMedia` + Service Worker는 HTTPS 필수 (localhost 제외)
- **OpenCV.js**: Mat 사용 후 `try/finally`로 `.delete()` 메모리 해제 필수
- **영상 전송**: 영상 전체 X, 1~2초 간격 핵심 프레임만 추출해서 전송
- **CPU 온도 null**: AMD/일부 OEM에서 null 반환 → "측정 불가" 표시, 진행 중단 X
- **환경변수**: `.env`에 `GEMINI_API_KEY`, `SPRING_DATASOURCE_URL` 설정 후 시작
- **디자인 토큰**: `src/styles/tokens.css` CSS 변수 사용, 하드코딩 금지

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

> 정본: `CLAUDE.md` Phase Roadmap 표 — 여기에 중복 정의하지 않음.
> 각 Phase의 목표·핵심 파일은 CLAUDE.md를 참조할 것.
> **현재 진행 상태**: `CLAUDE.md` "Phase 진행 상태" 표 확인 — 미완료 Phase 중 가장 낮은 번호부터 시작.

---

## Phase 1 전 스캐폴딩 (디렉토리 미존재 시)

Phase 1을 시작하기 전에 아래 디렉토리/파일이 없으면 먼저 생성합니다:

| 경로 | 생성 방법 |
|---|---|
| `backend/` | Spring Initializr: `spring-boot-starter-web`, `spring-ai-vertex-ai-gemini`, `spring-boot-starter-data-jpa`, `postgresql`, `spring-boot-starter-websocket`, `lombok` 포함 |
| `electron/main.ts` | Electron 진입점 (BrowserWindow 생성) |
| `electron/preload.ts` | contextBridge IPC 브리지 |
| `src/App.tsx` | React 라우터 루트 |
| `src/main.tsx` | ReactDOM.createRoot 진입점 |
| `pwa/public/sw.js` | Service Worker (plain JS, TS 빌드 제외) |
| `.env` | `GEMINI_API_KEY=`, `SPRING_DATASOURCE_URL=`, `ALLOWED_ORIGINS=http://localhost:3000` |

> 각 파일의 보일러플레이트는 `docs/snippets.md`의 해당 섹션을 참조합니다.

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

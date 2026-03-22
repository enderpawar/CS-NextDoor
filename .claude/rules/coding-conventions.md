# 코딩 컨벤션

## Java (Spring Boot 백엔드)

- 패키지: `com.nextdoorcs.<layer>` (controller / service / agent / mcp / entity)
- 클래스명: PascalCase (`DiagnosisService`, `RepairAgent`)
- 메서드명: camelCase (`diagnoseHardware`, `getTopProcesses`)
- 상수: UPPER_SNAKE_CASE (`GEMINI_URL`, `MAX_EVENTS`)
- DTO: Java Record 사용 (`record SoftwareSnapshotRequest(...)`)
- 의존성 주입: `@RequiredArgsConstructor` + final 필드 (생성자 주입)
- 응답 래핑: `ResponseEntity<DiagnosisResponse>` 통일

## JavaScript / React (프론트엔드)

- 컴포넌트: PascalCase (`SystemDashboard.jsx`, `CameraView.jsx`)
- 훅: camelCase + `use` 접두사 (`useSystemInfo`, `useOpenCV`)
- 유틸 함수: camelCase (`extractFrames`, `getEventLogs`)
- 파일 위치:
  - Electron 전용 → `src/components/desktop/`
  - PWA 전용 → `src/components/mobile/`
  - 공용 → `src/components/shared/`
  - 훅 → `src/hooks/`
- `export default` 사용 (named export 지양)
- `useRef` + `useEffect` cleanup 필수 (`cancelAnimationFrame`, `getTracks().forEach(t => t.stop())`)

## Electron (메인 프로세스)

- IPC 핸들러명: kebab-case (`get-system-info`, `system-update`)
- `contextIsolation: true`, `nodeIntegration: false` 항상 유지
- `contextBridge.exposeInMainWorld('electronAPI', {...})` 패턴 고정
- `Push-Location` / `Pop-Location` 사용 (Set-Location 금지)

## OpenCV.js

- Mat 객체 사용 후 반드시 `.delete()` 호출
- `[src, gray, edges, contours, hierarchy].forEach(m => m.delete())` 패턴으로 일괄 해제

## 공통

- 주석: 비즈니스 로직 설명 위주, 자명한 코드엔 생략
- 에러 처리: try/catch 후 빈 배열/null 반환 (UI에서 null 처리)
- AI 진단 결과 타입: `{ result: string }` 또는 `DiagnosisResponse` 래퍼

# 코딩 컨벤션

## Java (Spring Boot 백엔드)

- 패키지: `com.nextdoorcs.<layer>` (controller / service / agent / mcp / entity)
- 클래스명: PascalCase (`DiagnosisService`, `RepairAgent`)
- 메서드명: camelCase (`diagnoseHardware`, `getTopProcesses`)
- 상수: UPPER_SNAKE_CASE (`GEMINI_URL`, `MAX_EVENTS`)
- DTO: Java Record 사용 (`record SoftwareSnapshotRequest(...)`)
- 의존성 주입: `@RequiredArgsConstructor` + final 필드 (생성자 주입)
- 응답 래핑: `ResponseEntity<DiagnosisResponse>` 통일

## TypeScript / React (프론트엔드)

- 컴포넌트: PascalCase + `.tsx` 확장자 (`SystemDashboard.tsx`, `CameraView.tsx`)
- 훅: camelCase + `use` 접두사 + `.ts` 확장자 (`useSystemInfo.ts`, `useOpenCV.ts`)
- 유틸 함수: camelCase (`extractFrames`, `getEventLogs`)
- 파일 위치:
  - Electron 전용 → `src/components/desktop/`
  - PWA 전용 → `src/components/mobile/`
  - 공용 → `src/components/shared/`
  - 훅 → `src/hooks/`
  - 공유 타입 → `src/types/index.ts`
- `export default` 사용 (named export 지양)
- `useRef` + `useEffect` cleanup 필수 (`cancelAnimationFrame`, `getTracks().forEach(t => t.stop())`)
- **타입 정의 원칙**:
  - API 응답 타입은 `src/types/index.ts`에 interface로 중앙 관리
  - `any` 사용 금지 — OpenCV `cv.*` API 예외 (`// eslint-disable-next-line @typescript-eslint/no-explicit-any` 주석 명시)
  - Props 타입은 컴포넌트 파일 내 inline interface로 정의 (`interface Props { ... }`)
  - `React.FC` 미사용 — 함수 선언 직접 타이핑 (`export default function Foo({ bar }: Props)`)
- **IPC 브리지 타입**:
  - `src/types/electron.d.ts`에 `ElectronAPI` interface 정의 → `window.electronAPI` 타입 보장
  - `declare global { interface Window { electronAPI: ElectronAPI } }`

## Electron (메인 프로세스)

- 파일 확장자: `.ts` (`main.ts`, `preload.ts`, `systemMonitor.ts`)
- IPC 핸들러명: kebab-case (`get-system-info`, `system-update`)
- `contextIsolation: true`, `nodeIntegration: false` 항상 유지
- `contextBridge.exposeInMainWorld('electronAPI', {...})` 패턴 고정
- `Push-Location` / `Pop-Location` 사용 (Set-Location 금지)
- IPC 채널 타입은 `src/types/ipc.ts`에 상수로 관리 (`export const IPC = { GET_SYSTEM_INFO: 'get-system-info' } as const`)

## OpenCV.js

- OpenCV WASM API(`cv.*`)는 공식 TS 타입 정의 미완성 → `declare const cv: any` 로컬 선언 사용
- Mat 객체 사용 후 반드시 `.delete()` — JS GC는 WASM 힙 미회수
- `[src, gray, edges, contours, hierarchy].forEach(m => m.delete())` 패턴으로 일괄 해제 (try/finally 보장)
- 파라미터 고정 객체(CLAHE 등)는 `useRef`로 1회 생성 후 재사용, 언마운트 시 `delete()`

## 공통

- 주석: 비즈니스 로직 설명 위주, 자명한 코드엔 생략
- 에러 처리: try/catch 후 빈 배열/null 반환 (UI에서 null 처리)
- AI 진단 결과 타입: `src/types/index.ts`의 `DiagnosisResponse` interface 사용
- `tsconfig.json` 핵심 옵션: `strict: true`, `allowJs: false`, `noUncheckedIndexedAccess: true`

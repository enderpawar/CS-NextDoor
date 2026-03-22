# 도메인 용어 정리

| 용어 | 설명 |
|---|---|
| **BIOS POST** | Power-On Self Test. PC 부팅 시 메인보드가 RAM·GPU 등 하드웨어를 자가 진단하는 과정 |
| **비프음(Beep Code)** | POST 실패 시 메인보드 스피커로 내는 경고음. 패턴(길이/횟수)으로 오류 유형 구분 (예: 짧게 3번 = RAM 오류) |
| **멀티모달(Multimodal)** | 텍스트·이미지·오디오 등 여러 형태의 데이터를 동시에 처리하는 AI 능력 |
| **MCP (Model Context Protocol)** | AI 모델이 외부 도구(API, DB 등)를 표준화된 방식으로 호출하는 프로토콜. Anthropic 주도 |
| **Spring AI** | Spring Boot에서 AI 모델(Gemini, Claude, GPT 등)을 연동하는 공식 라이브러리. `@Tool` 어노테이션으로 MCP 도구 등록 |
| **OpenCV Canny** | 이미지에서 경계선(엣지)을 검출하는 알고리즘. PC 부품 윤곽선 인식에 사용 |
| **컨투어(Contour)** | OpenCV에서 이미지 내 객체의 외곽선을 나타내는 점의 집합 |
| **OpenCV Mat** | OpenCV에서 이미지 데이터를 담는 행렬(Matrix) 객체. 처리 후 `.delete()` 로 메모리 해제 필수 |
| **Base64** | 바이너리(이미지/오디오)를 텍스트로 인코딩하는 방식. Gemini API 전송 시 사용 |
| **RAG** | Retrieval-Augmented Generation. AI가 외부 지식베이스를 검색해 답변 정확도를 높이는 기법. Phase 3 MCP와 유사 개념 |
| **JPA Entity** | Java Persistence API. DB 테이블을 Java 클래스로 매핑하는 ORM 구조 |
| **공임비** | 수리 기사가 부품 교체 등 작업에 청구하는 인건비 |
| **부품 카테고리** | RAM, GPU(그래픽카드), MAINBOARD(메인보드), PSU(파워서플라이), STORAGE(저장장치), CPU, COOLING |
| **Spring AI ChatClient** | Spring AI에서 LLM과 대화하는 핵심 클라이언트. `.prompt().user().tools().call()` 체이닝 패턴 사용 |
| **MediaRecorder API** | 브라우저 내장 Web API. 마이크/카메라 스트림을 녹음/녹화해 Blob으로 저장 |
| **JSONB** | PostgreSQL의 바이너리 JSON 컬럼 타입. 인덱싱 및 쿼리 성능이 일반 JSON보다 우수 |
| **PWA** | Progressive Web App. 브라우저에서 실행되지만 앱처럼 설치/오프라인 동작. manifest.json + Service Worker 필요 |
| **getDisplayMedia()** | 브라우저 API. 사용자 화면(모니터 전체 또는 특정 창)을 스트림으로 캡처. HTTPS 필수 |
| **rAF (requestAnimationFrame)** | 브라우저가 다음 화면을 그리기 전 콜백을 호출하는 API. FPS 측정에 사용 |
| **FPS 드랍** | 초당 프레임 수가 기준(60fps) 이하로 떨어지는 현상. 30fps 미만이면 사용자가 끊김을 체감 |
| **Long Task** | 브라우저 메인 스레드를 50ms 이상 블로킹하는 작업. `PerformanceObserver`로 감지 |
| **PerformanceObserver** | 브라우저 성능 타임라인 이벤트(Long Task, Navigation 등)를 구독하는 Web API |
| **Service Worker** | 브라우저 백그라운드에서 실행되는 스크립트. 네트워크 요청 가로채기 + 오프라인 캐시 담당 |
| **Adaptive Mode** | 접속 환경(Electron/PWA)에 따라 UI와 진단 방식을 자동 전환하는 설계 패턴 |
| **Electron** | Chromium + Node.js 기반 데스크톱 앱 프레임워크. 브라우저 샌드박스 없이 OS 자원 직접 접근 가능 |
| **IPC (Inter-Process Communication)** | Electron의 메인 프로세스(Node.js)와 렌더러 프로세스(React) 간 통신 채널. `ipcMain` / `ipcRenderer` 사용 |
| **contextBridge** | Electron 보안 API. preload.js에서 렌더러에 안전하게 특정 함수만 노출 (`contextIsolation: true` 필수) |
| **systeminformation** | Node.js npm 패키지. CPU 온도·사용률, GPU 정보, 메모리, 디스크 등 시스템 데이터 크로스플랫폼 수집 |
| **desktopCapturer** | Electron 내장 API. 화면/창 캡처 스트림 제공. 브라우저 `getDisplayMedia()`와 달리 HTTPS 불필요 |
| **preload.js** | Electron 렌더러 로드 전 실행되는 스크립트. Node.js ↔ React 안전한 IPC 브리지 역할 |
| **Windows Event Log** | Windows OS가 기록하는 시스템/앱/보안 이벤트 로그. PowerShell `Get-WinEvent`로 조회. BSOD·드라이버 오류 이력 포함 |
| **S.M.A.R.T** | Self-Monitoring, Analysis and Reporting Technology. HDD/SSD 자가 진단 데이터. 불량 섹터·온도·수명 예측 지표 |
| **WMI** | Windows Management Instrumentation. Windows 하드웨어/소프트웨어 정보 쿼리 인터페이스. systeminformation 내부에서 사용 |
| **BSOD** | Blue Screen of Death. Windows 커널 오류 발생 시 표시되는 블루스크린. 이벤트 로그에 덤프 파일 기록됨 |
| **facingMode: environment** | `getUserMedia` 옵션. 모바일 후면 카메라(PC 내부 촬영용) 선택 |

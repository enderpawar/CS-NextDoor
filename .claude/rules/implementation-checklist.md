# 구현 전 체크리스트

## 🔴 High Risk — Phase 시작 전 반드시 확인

### [ ] 1. Gemini API 모델 접근 권한 (Phase 1 전)
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_KEY"
```
- `gemini-3.1-pro-preview` 목록에 있으면 OK
- 없으면 `gemini-2.0-flash` 또는 `gemini-1.5-pro`로 `GeminiService.java`의 `GEMINI_URL` 수정

### [ ] 2. Windows CPU 온도 null 대응 (Phase 3 전)
- `systeminformation` `cpuTemperature()` → WMI 의존, AMD/일부 환경에서 `null`
- UI에서 `null`이면 "측정 불가" 표시, AI 진단 요청 시 해당 필드 제외
- 온도가 `null`이어도 Phase 진행 가능 — 막히면 무시하고 계속

### [ ] 3. PWA HTTPS 환경 준비 (Phase 6 전)
- `getUserMedia` + Service Worker = HTTPS 필수 (localhost 제외)
- 모바일 실기기 테스트 시 ngrok 등 터널링 필요
  ```bash
  ngrok http 3000
  # → https://<id>.ngrok.io 로 모바일 접속
  ```
- iOS Safari 주의: 카메라 권한 매번 재요청, `audio/webm` 미지원

---

## 🟡 Medium Risk — 해당 Phase 도달 시 확인

### [ ] 4. OpenCV.js Service Worker 사전 캐시 (Phase 6~7)
- WASM 파일 ~8MB → 첫 로드 5~15초
- `sw.js` `PRECACHE` 배열에 `/opencv.js` 포함 확인
  ```js
  const PRECACHE = ['/', '/index.html', '/opencv.js'];
  ```
- `useOpenCV.js`의 `onRuntimeInitialized` 콜백 전 카메라 미접근

### [ ] 5. Spring AI BOM 버전 고정 (Phase 9 전)
- `pom.xml` `dependencyManagement`에 `spring-ai-bom` 버전 명시
- `ToolCallbacks.from()` API가 버전마다 다름 → 고정 후 JavaDoc 확인
  ```xml
  <artifactId>spring-ai-bom</artifactId>
  <version>1.0.0</version>
  ```

### [ ] 6. Electron CORS `app://` 허용 (Phase 2 연동 시)
- Electron 앱 오리진 = `app://` 또는 `file://`
- Spring Boot CORS 설정에 추가:
  ```java
  @CrossOrigin(origins = {"http://localhost:3000", "app://*", "file://*"})
  ```

### [ ] 7. PowerShell ExecutionPolicy Bypass (Phase 4)
- 기업/학교 PC = `ExecutionPolicy: Restricted` → `execSync` 실패
- `eventLogReader.js` 명령어 수정:
  ```js
  execSync(`powershell -ExecutionPolicy Bypass -Command "${ps}"`)
  ```

---

## 🟢 Low Risk — 구현 중 참고

### [ ] 8. MediaRecorder 오디오 포맷 분기 (Phase 8)
- Chrome/Edge: `audio/webm` ✅ / iOS Safari: `audio/mp4` ✅
  ```js
  const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
  new MediaRecorder(stream, { mimeType });
  ```

### [ ] 9. JSONB → TEXT 변경 고려 (Phase 10)
- `DiagnosisHistory.java`의 `aiDiagnosis` 필드
- `columnDefinition = "jsonb"` + Java String → `AttributeConverter` 필요
- 단순하게 가려면 `"TEXT"`로 변경 권장:
  ```java
  @Column(columnDefinition = "TEXT")
  private String aiDiagnosis;
  ```

### [ ] 10. Electron 배포 코드 서명 (최종 빌드 시)
- Windows `.exe` 코드 서명 없으면 SmartScreen 경고 팝업
- 개인/학습용이면 무시 가능
- 실제 배포 시 EV 인증서 필요

---

## Phase별 요약

| Phase | 확인 항목 |
|---|---|
| **1** | Gemini 모델 접근 권한 확인 |
| **2** | Electron CORS `app://` 허용 |
| **3** | CPU 온도 null 처리 |
| **4** | PowerShell ExecutionPolicy Bypass |
| **6** | HTTPS 환경(ngrok) + OpenCV SW 캐시 |
| **7** | OpenCV `onRuntimeInitialized` 타이밍 |
| **8** | MediaRecorder mimeType 분기 |
| **9** | Spring AI BOM 버전 고정 |
| **10** | JSONB → TEXT 변경 검토 |

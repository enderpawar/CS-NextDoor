# API Endpoints

| Method | Endpoint | 클라이언트 | 설명 |
|---|---|---|---|
| POST | `/api/diagnosis/hardware` | PWA (독립 모드) | biosType + 이미지/영상/비프음 → HW 진단 (sessionId 불필요) |
| POST | `/api/diagnosis/hypotheses` | Electron | 증상 + 스냅샷 → 가설 A/B/C + 신뢰도% |
| POST | `/api/diagnosis/software` | Electron | baseline + delta → 가설 확정 + 신뢰도% + 해결책 |
| POST | `/api/diagnosis/patterns` | Electron | 이벤트 로그 기반 유사 패턴 제안 (재현 실패 시) |
| POST | `/api/diagnosis/{id}/feedback` | 공통 | 해결 여부 피드백 (RESOLVED / UNRESOLVED) |
| GET | `/api/diagnosis/history/{sessionId}` | 공통 | 진단 이력 조회 |
| GET | `/api/manual?model=&biosType=&code=` | 공통 | BIOS 제조사 포함 매뉴얼 조회 |
| POST | `/api/session/create` | Electron | 세션 생성 → sessionId + authToken (QR 인코딩용) |
| POST | `/api/session/{id}/extend` | Electron | 세션 만료 연장 (+5분, 1회 한정) |
| GET | `/api/session/{id}/status` | 공통 | 세션 상태 폴링 |
| POST | `/api/session/{id}/software` | Electron | SW 스냅샷 + BIOS 정보 제출 |
| POST | `/api/session/{id}/hardware` | PWA (세션 모드) | biosType + HW 영상/이미지 제출 (token 검증 필수) |
| WS | `/ws` → `/topic/session/{id}` | 공통 | 진단 결과 실시간 브로드캐스트 |

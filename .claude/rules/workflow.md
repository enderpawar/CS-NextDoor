# 시스템 워크플로우

> PC 상태에 따라 두 가지 진입점. 가설 순차 추적 → 재현(실패 시 패턴 선택) → HW 에스컬레이션(QR 연장/수동 입력) → 복합 원인 계속 진단 → 사후 확인.
>
> 상세 시퀀스 다이어그램: `.claude/rules/workflow-diagram.md`

---

## 진입 분기

| 상황 | 진입점 | 첫 화면 |
|---|---|---|
| PC 정상 부팅 | Electron | 증상 입력 + 시스템 스냅샷 자동 수집 |
| PC 부팅 불가 | PWA 직접 접속 | ⚠️ SW 데이터 없음 — 정확도 제한 안내 |

---

## SW 진단 흐름 (Electron)

1. 증상 텍스트 입력 (Ctrl+V 클립보드 이미지 첨부 가능) + BIOS 제조사 자동 감지
2. `POST /api/diagnosis/hypotheses` → 가설 A/B/C + 신뢰도% + 즉시 조치
3. **HypothesisTracker**: 가설을 우선순위대로 순차 시도. 각 시도 완료/실패 상태 추적
4. 모든 가설 소진 → **재현 모드**: 베이스라인 수집 후 문제 재현
   - 재현 성공(delta 초과) → `POST /api/diagnosis/software` → 가설 확정
   - 재현 실패(delta 미달) → `POST /api/diagnosis/patterns` → **PatternSelector** 유사 패턴 제안
5. SW 미해결 → HW 에스컬레이션: `POST /api/session/create` → QR 코드 + 만료 카운트다운(5분)
   - QR 스캔 실패 시: `POST /api/session/{id}/extend` (+5분) 또는 6자리 shortCode 수동 입력

---

## HW 진단 흐름 (PWA)

1. BIOS 제조사 확인 (세션 모드: 자동 수신 / 독립·감지 실패: BiosTypeSelector 수동 선택)
2. **ShootingGuide**: 부위별 촬영 다이어그램 + 거리/각도 안내
3. 후면 카메라 + 마이크(AEC 비활성) + OpenCV 오버레이 → VideoAnalysis 프레임 추출
4. `POST /api/diagnosis/hardware` (독립) 또는 `POST /api/session/{id}/hardware` (세션)
5. Gemini ← MCP `get_manual_info(biosType, errorCode)` → HW 진단 결과 + 신뢰도%
6. 세션 모드: WS → DONE 이벤트 → Electron에도 결과 표시

---

## Phase 7-B — 라이브 카메라 가이드 모드

> BIOS 설정·Windows 설치 등 화면 작업을 카메라로 비추면 Gemini가 단계별 안내.

**핵심 설계 원칙**:
- rAF 루프 히스토그램 비교 → **연속 3프레임 변화 감지** 시만 Gemini 전송 (false positive 차단)
- OpenCV: 변화 감지 + CLAHE 전처리만. 텍스트 인식은 Gemini Vision에 위임
- 세션 시작 즉시 `STATIC_FIRST_GUIDE[context]` 표시 → Gemini 응답 도착 시 교체
- 프레임 전송 후 3단계 피드백: 📸 캡처됨 → ⏳ 분석 중+경과시간 → 응답 도착
- 응답 도착 시 전송 당시 히스토그램 vs 현재 비교 → 유사도 < 0.7 시 stale guide 경고

**비용 제어**:

| 방법 | 효과 |
|---|---|
| 히스토그램 유사도 임계값 0.92 | 동일 화면 반복 전송 차단 |
| **연속 3프레임 변화 확인** | 손 떨림/Rolling Shutter false positive 차단 |
| 최소 전송 간격 2초 쿨다운 | 초당 다중 호출 방지 |
| `isSendingRef` 동시 전송 차단 | 이전 응답 완료 전 새 프레임 무시 |
| `AbortController` 연결 | 언마운트/종료 시 진행 중 스트림 즉시 취소 |
| 대화 히스토리 최대 6턴 슬라이딩 | 토큰 누적 방지 |
| `[완료]` 태그 누적 버퍼 기준 감지 | 청크 분할 무관 세션 자동 종료 보장 |
| 세션 최대 수명 15분 | 방치 세션 비용 차단 |

---

## 공통 완료 흐름

- 해결됨 → `POST /api/diagnosis/{id}/feedback (RESOLVED)` → 24시간 사후 확인 스케줄
- 복합 원인 의심 → "이게 전부가 아닐 수 있어요" 버튼 → `previousDiagnosisId` 포함 재진단
- 신뢰도 < 0.6 → "수리기사 상담 권장" 배너 자동 표시

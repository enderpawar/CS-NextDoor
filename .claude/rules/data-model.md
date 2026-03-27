# 데이터 모델 — JPA 엔티티 설계

---

## DiagnosisHistory.java

```java
@Entity
@Table(name = "diagnosis_history")
@Getter @Builder
@NoArgsConstructor @AllArgsConstructor
public class DiagnosisHistory {

    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = true)
    private String sessionId;          // 사용자 세션 UUID (null = PWA 독립 모드)

    private String imageUrl;           // 진단에 사용된 이미지 경로
    private String audioUrl;           // 비프음 오디오 경로 (nullable)

    @Column(columnDefinition = "TEXT")
    private String symptomDescription; // 사용자 입력 증상 텍스트

    // ✅ TEXT 확정 (Phase 1 결정). JSONB로 변경 시 ALTER TABLE 마이그레이션 필요.
    // Hibernate 6 + columnDefinition="jsonb" 조합은 삽입 시 타입 불일치 오류 발생 — TEXT 사용.
    // JSONB 인덱싱이 필요해지면 AttributeConverter + @Convert 로 전환.
    @Column(columnDefinition = "TEXT")
    private String aiDiagnosis;        // JSON { cause, solution, parts, confidence }

    @ElementCollection
    @CollectionTable(name = "diagnosis_parts")
    private List<String> partsReferenced; // ["RAM", "GPU"]

    private LocalDateTime resolvedAt;  // null = 미해결

    @CreationTimestamp
    private LocalDateTime createdAt;
}
```

---

## SolutionKnowledge.java

```java
@Entity
@Table(name = "solution_knowledge")
@Getter @Builder
@NoArgsConstructor @AllArgsConstructor
public class SolutionKnowledge {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    private PartCategory partCategory; // RAM, GPU, MAINBOARD, PSU, STORAGE

    private String symptomKeyword;     // "화면 안 나옴", "3번 비프음"
    private String errorCode;          // nullable, 비프음 패턴 또는 POST 코드

    @Column(columnDefinition = "TEXT")
    private String solution;           // 구체적 해결 방법

    private String manualReference;    // 제조사 매뉴얼 URL

    @Column(nullable = false)
    private int successCount = 0;      // 사용자 피드백 기반 해결 성공 횟수
}
```

---

## PartCategory Enum

```java
public enum PartCategory {
    RAM,        // 메모리
    GPU,        // 그래픽카드
    MAINBOARD,  // 메인보드
    PSU,        // 파워서플라이
    STORAGE,    // SSD / HDD
    CPU,        // 프로세서
    COOLING,    // 쿨러 / 서멀
    OTHER
}
```

---

## DB 스키마 요약

```sql
-- 진단 이력
CREATE TABLE diagnosis_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      VARCHAR,           -- null = PWA 독립 모드
    image_url       VARCHAR,
    audio_url       VARCHAR,
    symptom_description TEXT,
    ai_diagnosis    TEXT,              -- JSONB 아님. Hibernate 6 타입 충돌 방지
    resolved_at     TIMESTAMP,
    created_at      TIMESTAMP DEFAULT now()
);

CREATE TABLE diagnosis_parts (
    diagnosis_history_id UUID REFERENCES diagnosis_history(id),
    parts_referenced     VARCHAR
);

-- 부품별 해결 지식베이스
CREATE TABLE solution_knowledge (
    id                BIGSERIAL PRIMARY KEY,
    part_category     VARCHAR NOT NULL,
    symptom_keyword   VARCHAR,
    error_code        VARCHAR,
    solution          TEXT,
    manual_reference  VARCHAR,
    success_count     INT DEFAULT 0
);
```

---

## aiDiagnosis JSON 스키마

```json
{
  "cause": "RAM 접촉 불량으로 추정됩니다",
  "solution": "1. PC 전원 차단 후 RAM을 슬롯에서 분리
2. 금색 단자를 지우개로 닦기
3. 딸깍 소리가 날 때까지 재삽입",
  "confidence": 0.87
}
```

---

## DiagnosisSession.java

```java
@Entity
@Table(name = "diagnosis_session")
@Getter @Builder
@NoArgsConstructor @AllArgsConstructor
public class DiagnosisSession {

    @Id
    private String sessionId;          // UUID — QR 코드에 인코딩

    @Enumerated(EnumType.STRING)
    private SessionStatus status;      // WAITING / SW_READY / HW_READY / DIAGNOSING / DONE

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SessionType sessionType;   // PWA_ONLY / LINKED. QR 스캔 시 PWA_ONLY → LINKED 업그레이드

    @Column(columnDefinition = "TEXT")
    private String swSnapshot;         // Electron SW 스냅샷 (JSON). PWA_ONLY 세션에서는 null

    @Column(columnDefinition = "TEXT")
    private String hwFrames;           // PWA HW 프레임 (Base64 JSON 배열)

    @Column(columnDefinition = "TEXT")
    private String diagnosisResult;    // 통합 진단 결과

    private String authToken;          // SecureRandom 8자리 alphanumeric, 최초 검증 후 null
    private boolean tokenConsumed;     // 토큰 1회 폐기 추적 (true = 이미 사용됨)
    private String shortCode;          // 6자리 난수 문자열(000000~999999), 수동 입력 폴백용

    private LocalDateTime expiresAt;   // 생성 후 5분 만료

    @CreationTimestamp
    private LocalDateTime createdAt;

    public enum SessionStatus {
        WAITING, SW_READY, HW_READY, DIAGNOSING, DONE
    }

    public enum SessionType {
        PWA_ONLY,  // PWA 앱 시작 시 자동 생성. swSnapshot null. QR 스캔 시 LINKED로 업그레이드
        LINKED     // Electron이 생성하고 PWA가 QR로 합류한 세션. 기존 PWA_ONLY 세션은 폐기
    }
}
```

```sql
CREATE TABLE diagnosis_session (
    session_id         VARCHAR PRIMARY KEY,
    status             VARCHAR NOT NULL DEFAULT 'WAITING',
    session_type       VARCHAR NOT NULL DEFAULT 'PWA_ONLY', -- PWA_ONLY | LINKED
    sw_snapshot        TEXT,           -- LINKED 세션에서만 채워짐
    hw_frames          TEXT,
    diagnosis_result   TEXT,
    auth_token         VARCHAR,
    token_consumed     BOOLEAN DEFAULT FALSE,
    short_code         CHAR(6),
    expires_at         TIMESTAMP NOT NULL,
    created_at         TIMESTAMP DEFAULT now()
);
```

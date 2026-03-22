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

    @Column(nullable = false)
    private String sessionId;          // 사용자 세션 UUID

    private String imageUrl;           // 진단에 사용된 이미지 경로
    private String audioUrl;           // 비프음 오디오 경로 (nullable)

    @Column(columnDefinition = "TEXT")
    private String symptomDescription; // 사용자 입력 증상 텍스트

    // ⚠️ JSONB 주의: String + columnDefinition="jsonb"는 AttributeConverter 필요.
    // 간단히 쓰려면 "TEXT"로 변경. JSONB 인덱싱이 필요한 경우 JsonbConverter 구현 후 @Convert 적용.
    @Column(columnDefinition = "jsonb")
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
    session_id      VARCHAR NOT NULL,
    image_url       VARCHAR,
    audio_url       VARCHAR,
    symptom_description TEXT,
    ai_diagnosis    JSONB,
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
  "solution": "1. PC 전원 차단 후 RAM을 슬롯에서 분리\n2. 금색 단자를 지우개로 닦기\n3. 딸깍 소리가 날 때까지 재삽입",
  "parts": ["RAM"],
  "confidence": 0.87,
  "requiresProfessional": false,
  "estimatedCost": {
    "diy": 0,
    "professional": 30000
  }
}
```

package com.nextdoorcs.dto;

public record SoftwareDiagnosisResponse(
        String diagnosisId,
        String confirmedHypothesis,   // 확정된 가설 제목
        String cause,                 // 원인 설명 (한국어, 친근체)
        String solution,              // 단계별 해결 방법
        double confidence,            // 0.0~1.0. 0.6 미만 → 수리기사 권장 배너
        boolean requiresRepairShop,   // true → "수리기사 상담 권장" 배너 표시
        boolean isComplex             // true → "이게 전부가 아닐 수 있어요" SW+HW 복합 원인 의심
) {}

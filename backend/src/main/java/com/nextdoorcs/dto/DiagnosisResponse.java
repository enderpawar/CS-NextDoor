package com.nextdoorcs.dto;

import java.util.List;

// src/types/index.ts DiagnosisResponse 와 필드 일치
public record DiagnosisResponse(
        String cause,
        String solution,
        double confidence,
        List<String> parts
) {
    // 단순 텍스트 응답 래핑용 (Gemini JSON 파싱 실패 폴백)
    public static DiagnosisResponse fromText(String text) {
        return new DiagnosisResponse(text, "상세 결과를 확인해주세요.", 0.5, List.of());
    }
}

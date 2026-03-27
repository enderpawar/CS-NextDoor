package com.nextdoorcs.dto;

import java.util.Map;

public record SoftwareDiagnosisRequest(
        String diagnosisId,           // HypothesisResponse.diagnosisId — 연속 진단 추적용
        String hypothesisId,          // 검증 중인 가설 id (h1 / h2 / h3)
        String hypothesisTitle,       // 가설 제목 — Gemini 프롬프트에 포함
        String symptom,               // 원래 증상 텍스트
        Map<String, Object> baseline, // 재현 전 수집한 시스템 지표
        Map<String, Object> delta,    // 재현 후 변화량 (상대 변화율 포함)
        String previousDiagnosisId    // nullable — "이게 전부가 아닐 수 있어요" 재진단 시 포함
) {}

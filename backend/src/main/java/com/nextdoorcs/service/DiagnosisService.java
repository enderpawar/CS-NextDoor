package com.nextdoorcs.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nextdoorcs.dto.DiagnosisResponse;
import com.nextdoorcs.dto.HypothesisRequest;
import com.nextdoorcs.dto.HypothesisResponse;
import com.nextdoorcs.dto.PatternsRequest;
import com.nextdoorcs.dto.PatternsResponse;
import com.nextdoorcs.dto.SoftwareDiagnosisRequest;
import com.nextdoorcs.dto.SoftwareDiagnosisResponse;
import com.nextdoorcs.exception.DiagnosisException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class DiagnosisService {

    private final GeminiService geminiService;
    private final ObjectMapper objectMapper;

    /**
     * HW 진단: 이미지(+오디오) → Gemini → DiagnosisResponse JSON 파싱
     */
    public DiagnosisResponse diagnoseMultimodal(
            String base64Image,
            byte[] audioBytes,
            String audioMimeType,
            String symptom,
            String biosType) {

        String raw = geminiService.diagnoseMultimodal(base64Image, audioBytes, audioMimeType, symptom, biosType);
        return parseToResponse(raw, DiagnosisResponse.class);
    }

    /**
     * SW 가설 생성: 증상 + 시스템 스냅샷 → Gemini → HypothesisResponse JSON 파싱
     */
    public HypothesisResponse generateHypotheses(HypothesisRequest req) {
        String snapshotJson = serializeSnapshot(req);
        String raw = geminiService.generateHypotheses(req.symptom(), snapshotJson, req.clipboardImage());

        HypothesisResponse response = parseToResponse(raw, HypothesisResponse.class);

        // Gemini가 diagnosisId를 생략하거나 "UUID"를 그대로 반환할 경우 대체
        if (response.diagnosisId() == null || response.diagnosisId().equals("UUID")) {
            response = new HypothesisResponse(
                UUID.randomUUID().toString(),
                response.hypotheses(),
                response.immediateAction()
            );
        }
        return response;
    }

    /**
     * SW 가설 확정: 재현 성공 후 baseline + delta → Gemini → 확정 진단
     */
    public SoftwareDiagnosisResponse confirmSoftwareDiagnosis(SoftwareDiagnosisRequest req) {
        String baselineJson = serialize(req.baseline());
        String deltaJson    = serialize(req.delta());

        String raw = geminiService.confirmSoftwareDiagnosis(
            req.hypothesisTitle(), baselineJson, deltaJson, req.symptom(), req.previousDiagnosisId()
        );

        SoftwareDiagnosisResponse response = parseToResponse(raw, SoftwareDiagnosisResponse.class);

        // diagnosisId 보정
        if (response.diagnosisId() == null || response.diagnosisId().equals("UUID")) {
            response = new SoftwareDiagnosisResponse(
                req.diagnosisId() != null ? req.diagnosisId() : UUID.randomUUID().toString(),
                response.confirmedHypothesis(),
                response.cause(),
                response.solution(),
                response.confidence(),
                response.requiresRepairShop() || response.confidence() < 0.6,
                response.isComplex()
            );
        }
        return response;
    }

    /**
     * 이벤트 로그 기반 패턴 제안: 재현 실패 시 유사 패턴 Gemini에 요청
     */
    public PatternsResponse suggestPatterns(PatternsRequest req) {
        String eventLogJson = serialize(req.eventLog());
        String raw = geminiService.suggestPatterns(eventLogJson, req.symptom());

        try {
            PatternsResponse response = parseToResponse(raw, PatternsResponse.class);
            // 빈 패턴 목록 시 summary 보정
            if (response.patterns() == null || response.patterns().isEmpty()) {
                return new PatternsResponse(
                    Collections.emptyList(),
                    "간헐적 증상이라 지금 당장 파악이 어려워요"
                );
            }
            return response;
        } catch (Exception e) {
            log.warn("패턴 응답 파싱 실패 — 빈 패턴 반환. error={}", e.getMessage());
            return new PatternsResponse(Collections.emptyList(), "간헐적 증상이라 지금 당장 파악이 어려워요");
        }
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    private <T> T parseToResponse(String raw, Class<T> type) {
        // 1단계: ```json ... ``` 코드 블록 제거
        String cleaned = raw.trim();
        if (cleaned.contains("```")) {
            cleaned = cleaned.replaceAll("```[a-zA-Z]*\\n?", "").replaceAll("```", "").trim();
        }

        // 2단계: 대화형 텍스트 내 JSON 추출 — 첫 { 부터 마지막 } 까지
        int jsonStart = cleaned.indexOf('{');
        int jsonEnd   = cleaned.lastIndexOf('}');
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
            cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
        }

        try {
            return objectMapper.readValue(cleaned, type);
        } catch (Exception e) {
            log.warn("Gemini 응답 JSON 파싱 실패 — raw 텍스트로 폴백. type={}, error={}", type.getSimpleName(), e.getMessage());
            if (type == DiagnosisResponse.class) {
                @SuppressWarnings("unchecked")
                T fallback = (T) DiagnosisResponse.fromText(raw);
                return fallback;
            }
            throw new DiagnosisException("Gemini 응답 파싱 실패: " + e.getMessage());
        }
    }

    private String serializeSnapshot(HypothesisRequest req) {
        if (req.systemSnapshot() == null || req.systemSnapshot().isEmpty()) return null;
        return serialize(req.systemSnapshot());
    }

    private String serialize(Object obj) {
        if (obj == null) return "{}";
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (Exception e) {
            return "{}";
        }
    }
}

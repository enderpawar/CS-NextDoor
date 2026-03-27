package com.nextdoorcs.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nextdoorcs.dto.DiagnosisResponse;
import com.nextdoorcs.dto.HypothesisRequest;
import com.nextdoorcs.dto.HypothesisResponse;
import com.nextdoorcs.exception.DiagnosisException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

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
        try {
            return objectMapper.writeValueAsString(req.systemSnapshot());
        } catch (Exception e) {
            return null;
        }
    }
}

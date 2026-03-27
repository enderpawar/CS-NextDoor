package com.nextdoorcs.dto;

import java.util.List;
import java.util.Map;

public record PatternsRequest(
        List<Map<String, Object>> eventLog, // EventLog 목록 (JSON 직렬화)
        String symptom                       // nullable — 증상 텍스트
) {}

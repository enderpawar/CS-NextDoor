package com.nextdoorcs.dto;

import java.util.Map;

public record HypothesisRequest(
        String symptom,
        String clipboardImage,           // nullable — Base64 (data: prefix 제거 후 전달)
        Map<String, Object> systemSnapshot
) {}

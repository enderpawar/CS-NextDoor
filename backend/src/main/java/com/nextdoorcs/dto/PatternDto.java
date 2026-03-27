package com.nextdoorcs.dto;

public record PatternDto(
        String id,
        String title,
        String description,
        String matchReason,      // 이벤트 로그와 매칭된 이유
        double relevanceScore    // 0.0~1.0
) {}

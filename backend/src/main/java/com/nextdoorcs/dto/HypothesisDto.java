package com.nextdoorcs.dto;

// src/types/index.ts Hypothesis 와 필드 일치
public record HypothesisDto(
        String id,
        String title,
        String description,
        String priority,   // "A" | "B" | "C"
        double confidence, // 0.0 ~ 1.0
        String status      // "pending" | "trying" | "resolved" | "failed"
) {}

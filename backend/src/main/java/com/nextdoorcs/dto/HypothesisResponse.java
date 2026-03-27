package com.nextdoorcs.dto;

import java.util.List;

// src/types/index.ts HypothesesResponse 와 필드 일치
public record HypothesisResponse(
        String diagnosisId,
        List<HypothesisDto> hypotheses,
        String immediateAction
) {}

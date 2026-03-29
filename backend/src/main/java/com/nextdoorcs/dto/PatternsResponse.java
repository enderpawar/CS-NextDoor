package com.nextdoorcs.dto;

import java.util.List;

public record PatternsResponse(
        List<PatternDto> patterns,
        String summary   // 패턴이 없을 때: "간헐적 증상이라 지금 당장 파악이 어려워요"
) {}

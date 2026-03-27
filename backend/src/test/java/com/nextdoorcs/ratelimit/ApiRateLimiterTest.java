package com.nextdoorcs.ratelimit;

import com.nextdoorcs.exception.DiagnosisException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ApiRateLimiterTest {

    private ApiRateLimiter rateLimiter;

    @BeforeEach
    void setUp() {
        rateLimiter = new ApiRateLimiter();
        ReflectionTestUtils.setField(rateLimiter, "dailyLimit", 3);
    }

    @Test
    void checkLimit_허용범위내_예외없음() {
        assertThatCode(() -> {
            rateLimiter.checkLimit("1.2.3.4");
            rateLimiter.checkLimit("1.2.3.4");
            rateLimiter.checkLimit("1.2.3.4");
        }).doesNotThrowAnyException();
    }

    @Test
    void checkLimit_초과시_429예외() {
        rateLimiter.checkLimit("1.2.3.4");
        rateLimiter.checkLimit("1.2.3.4");
        rateLimiter.checkLimit("1.2.3.4");

        assertThatThrownBy(() -> rateLimiter.checkLimit("1.2.3.4"))
            .isInstanceOf(DiagnosisException.class)
            .satisfies(e -> {
                DiagnosisException ex = (DiagnosisException) e;
                assert ex.getHttpStatus() == 429;
            });
    }

    @Test
    void checkLimit_IP별_독립카운터() {
        rateLimiter.checkLimit("1.1.1.1");
        rateLimiter.checkLimit("1.1.1.1");
        rateLimiter.checkLimit("1.1.1.1");

        // 다른 IP는 카운터 별도
        assertThatCode(() -> rateLimiter.checkLimit("2.2.2.2"))
            .doesNotThrowAnyException();
    }

    @Test
    void resetCounters_카운터초기화() {
        rateLimiter.checkLimit("1.2.3.4");
        rateLimiter.checkLimit("1.2.3.4");
        rateLimiter.checkLimit("1.2.3.4");

        rateLimiter.resetCounters();

        // 리셋 후 다시 3회 허용
        assertThatCode(() -> {
            rateLimiter.checkLimit("1.2.3.4");
            rateLimiter.checkLimit("1.2.3.4");
            rateLimiter.checkLimit("1.2.3.4");
        }).doesNotThrowAnyException();
    }
}

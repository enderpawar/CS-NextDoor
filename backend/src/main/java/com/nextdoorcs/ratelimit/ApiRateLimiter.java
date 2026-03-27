package com.nextdoorcs.ratelimit;

import com.nextdoorcs.exception.DiagnosisException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@Component
public class ApiRateLimiter {

    @Value("${ratelimit.daily-limit:5}")
    private int dailyLimit;

    // key: IP 주소, value: 오늘 사용 횟수
    private final ConcurrentHashMap<String, AtomicInteger> counters = new ConcurrentHashMap<>();

    /**
     * IP 기반 일일 쿼터 확인. 초과 시 DiagnosisException (HTTP 429로 매핑됨)
     */
    public void checkLimit(String ip) {
        int count = counters.computeIfAbsent(ip, k -> new AtomicInteger(0))
                            .incrementAndGet();
        if (count > dailyLimit) {
            throw new DiagnosisException(
                "일일 진단 한도(" + dailyLimit + "회)를 초과했어요. 내일 다시 시도해주세요.", 429
            );
        }
    }

    // 자정마다 카운터 초기화
    @Scheduled(cron = "0 0 0 * * *")
    public void resetCounters() {
        counters.clear();
    }
}

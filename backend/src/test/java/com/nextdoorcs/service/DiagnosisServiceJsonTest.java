package com.nextdoorcs.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nextdoorcs.dto.DiagnosisResponse;
import com.nextdoorcs.dto.HypothesisResponse;
import com.nextdoorcs.exception.DiagnosisException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DiagnosisServiceJsonTest {

    private DiagnosisService service;

    @BeforeEach
    void setUp() {
        // GeminiService 없이 JSON 파싱 로직만 테스트
        service = new DiagnosisService(null, new ObjectMapper());
    }

    @Test
    void parseToResponse_순수JSON_파싱성공() throws Exception {
        String raw = "{\"cause\":\"RAM 불량\",\"solution\":\"재삽입\",\"confidence\":0.85,\"parts\":[\"RAM\"]}";

        DiagnosisResponse result = invokeParseToResponse(raw, DiagnosisResponse.class);

        assertThat(result.cause()).isEqualTo("RAM 불량");
        assertThat(result.confidence()).isEqualTo(0.85);
        assertThat(result.parts()).containsExactly("RAM");
    }

    @Test
    void parseToResponse_코드블록감싸인경우_제거후파싱() throws Exception {
        String raw = "```json\n{\"cause\":\"GPU 오류\",\"solution\":\"드라이버 재설치\",\"confidence\":0.7,\"parts\":[\"GPU\"]}\n```";

        DiagnosisResponse result = invokeParseToResponse(raw, DiagnosisResponse.class);

        assertThat(result.cause()).isEqualTo("GPU 오류");
    }

    @Test
    void parseToResponse_대화형텍스트_JSON추출() throws Exception {
        String raw = "네, 분석 결과입니다! {\"cause\":\"PSU 불량\",\"solution\":\"교체\",\"confidence\":0.9,\"parts\":[\"PSU\"]} 도움이 됐으면 해요.";

        DiagnosisResponse result = invokeParseToResponse(raw, DiagnosisResponse.class);

        assertThat(result.cause()).isEqualTo("PSU 불량");
        assertThat(result.confidence()).isEqualTo(0.9);
    }

    @Test
    void parseToResponse_파싱실패_DiagnosisResponse_폴백반환() throws Exception {
        String raw = "죄송해요, JSON으로 응답할 수 없어요.";

        DiagnosisResponse result = invokeParseToResponse(raw, DiagnosisResponse.class);

        assertThat(result.cause()).isEqualTo(raw);
        assertThat(result.confidence()).isEqualTo(0.5);
    }

    @Test
    void parseToResponse_파싱실패_HypothesisResponse_예외발생() {
        String raw = "유효하지 않은 텍스트";

        // reflection 호출이므로 InvocationTargetException 내부의 원인 확인
        assertThatThrownBy(() -> invokeParseToResponse(raw, HypothesisResponse.class))
            .cause()
            .isInstanceOf(DiagnosisException.class);
    }

    // reflection으로 private 메서드 호출
    @SuppressWarnings("unchecked")
    private <T> T invokeParseToResponse(String raw, Class<T> type) throws Exception {
        var method = DiagnosisService.class.getDeclaredMethod("parseToResponse", String.class, Class.class);
        method.setAccessible(true);
        return (T) method.invoke(service, raw, type);
    }
}

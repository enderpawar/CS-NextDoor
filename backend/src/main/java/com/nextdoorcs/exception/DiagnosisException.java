package com.nextdoorcs.exception;

public class DiagnosisException extends RuntimeException {

    private final int httpStatus;

    public DiagnosisException(String message) {
        super(message);
        this.httpStatus = 500;
    }

    public DiagnosisException(String message, int httpStatus) {
        super(message);
        this.httpStatus = httpStatus;
    }

    public DiagnosisException(String message, Throwable cause) {
        super(message, cause);
        this.httpStatus = 500;
    }

    public int getHttpStatus() {
        return httpStatus;
    }
}

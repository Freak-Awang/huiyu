package com.im.common.exception;

import lombok.Getter;

/**
 * ?????BusinessException normalizes business failures into predictable API responses.
 */
@Getter
public class BusinessException extends RuntimeException {
    private final int code;

    public BusinessException(int code, String message) {
        super(message);
        this.code = code;
    }

    public BusinessException(String message) {
        super(message);
        this.code = 500;
    }
}

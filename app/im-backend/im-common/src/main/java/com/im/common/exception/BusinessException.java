package com.im.common.exception;

import lombok.Getter;

/**
 * 业务异常，将业务校验失败规范化，由全局异常处理器转换为可预期的API错误响应。
 */
@Getter
public class BusinessException extends RuntimeException {
    private final int code; // 业务错误码（通常与HTTP状态码对应）

    /**
     * 构造指定错误码的业务异常。
     *
     * @param code    业务错误码
     * @param message 错误提示信息
     */
    public BusinessException(int code, String message) {
        super(message);
        this.code = code;
    }

    /**
     * 构造指定错误码并携带原始异常的业务异常。
     *
     * @param code    业务错误码
     * @param message 错误提示信息
     * @param cause   原始异常
     */
    public BusinessException(int code, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
    }

    /**
     * 构造默认400错误码的业务异常。
     *
     * @param message 错误提示信息
     */
    public BusinessException(String message) {
        super(message);
        this.code = 400;
    }
}

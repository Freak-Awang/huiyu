package com.im.common.exception;

import com.im.common.result.Result;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.UUID;

/**
 * 全局异常处理器，统一拦截并转换各类异常为标准错误响应，避免向客户端泄露内部异常细节。
 * 5xx错误会生成errorId便于日志追踪。
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /**
     * 处理业务异常，按业务错误码映射HTTP状态码；5xx错误隐藏内部信息并记录errorId。
     *
     * @param e 业务异常
     * @return 标准错误响应
     */
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<Result<?>> handleBusinessException(BusinessException e) {
        HttpStatus status = resolveStatus(e.getCode());
        String message = status.is5xxServerError() ? "Internal server error" : e.getMessage();
        if (status.is5xxServerError()) {
            String errorId = UUID.randomUUID().toString();
            log.error("Business failure, errorId={}", errorId, e);
            message += " (errorId=" + errorId + ")";
        }
        return ResponseEntity.status(status).body(Result.error(e.getCode(), message));
    }

    /**
     * 处理参数校验异常，聚合所有字段校验失败信息返回400响应。
     *
     * @param e 参数校验异常
     * @return 包含字段错误明细的400响应
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Result<?>> handleValidationException(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .map(err -> err.getField() + ": " + err.getDefaultMessage())
                .reduce((a, b) -> a + "; " + b)
                .orElse("Request validation failed");
        return ResponseEntity.badRequest().body(Result.error(400, message));
    }

    /**
     * 兜底处理未捕获异常，记录完整堆栈并返回带errorId的500响应。
     *
     * @param e 未捕获异常
     * @return 500错误响应
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Result<?>> handleException(Exception e) {
        String errorId = UUID.randomUUID().toString();
        log.error("Unhandled request failure, errorId={}", errorId, e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Result.error(500, "Internal server error (errorId=" + errorId + ")"));
    }

    /**
     * 将业务错误码解析为HTTP状态码，无法识别时按500处理。
     *
     * @param code 业务错误码
     * @return 对应的HTTP状态码
     */
    private HttpStatus resolveStatus(int code) {
        HttpStatus status = HttpStatus.resolve(code);
        return status != null ? status : HttpStatus.INTERNAL_SERVER_ERROR;
    }
}

package com.im.common.result;

import lombok.Data;

/**
 * 统一响应结果封装，规范后端API返回的数据结构。
 *
 * @param <T> 业务数据类型
 */
@Data
public class Result<T> {
    private int code; // 业务状态码（200成功，其余为错误码）
    private String message; // 提示信息
    private T data; // 业务数据

    private Result() {}

    protected Result(int code, String message, T data) {
        this.code = code;
        this.message = message;
        this.data = data;
    }

    /**
     * 构建携带业务数据的成功响应。
     *
     * @param data 业务数据
     * @param <T>  业务数据类型
     * @return 成功响应结果
     */
    public static <T> Result<T> success(T data) {
        return new Result<>(200, "success", data);
    }

    /**
     * 构建无业务数据的成功响应。
     *
     * @param <T> 业务数据类型
     * @return 成功响应结果
     */
    public static <T> Result<T> ok() {
        return new Result<>(200, "success", null);
    }

    /**
     * 构建指定错误码的失败响应。
     *
     * @param code    错误码
     * @param message 错误提示信息
     * @param <T>     业务数据类型
     * @return 失败响应结果
     */
    public static <T> Result<T> error(int code, String message) {
        return new Result<>(code, message, null);
    }

    /**
     * 构建默认500错误码的失败响应。
     *
     * @param message 错误提示信息
     * @param <T>     业务数据类型
     * @return 失败响应结果
     */
    public static <T> Result<T> error(String message) {
        return new Result<>(500, message, null);
    }
}

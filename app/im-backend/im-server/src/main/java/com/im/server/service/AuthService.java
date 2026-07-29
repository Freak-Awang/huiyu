package com.im.server.service;

import com.im.common.dto.LoginRequest;
import com.im.common.dto.LoginResponse;
/**
 * 认证服务接口：定义登录、登出、Token 刷新等身份认证业务契约。
 */
public interface AuthService {

    /**
     * 用户登录认证。
     *
     * @param request 登录请求（用户名、密码）
     * @return 登录响应（Token、用户信息）
     * @throws com.im.common.exception.BusinessException 用户名或密码错误、用户被禁用时抛出
     */
    LoginResponse login(LoginRequest request);

    /**
     * 用户登出，吊销当前 Token 并关闭关联 WebSocket 会话。
     *
     * @param token 当前认证 Token
     */
    void logout(String token);

    /**
     * 刷新认证 Token，吊销旧 Token 并签发新 Token。
     *
     * @param token 当前认证 Token
     * @return 新的登录响应
     */
    LoginResponse refresh(String token);
}

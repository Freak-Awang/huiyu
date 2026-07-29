package com.im.server.security;

/**
 * 已认证用户信息。
 * <p>
 * 封装 JWT Token 验证通过后的用户身份信息，
 * 包括用户 ID、用户名、角色和 Token 版本号。
 * </p>
 *
 * @param userId       用户 ID
 * @param username     用户名
 * @param role         用户角色
 * @param tokenVersion Token 版本号
 */
public record AuthenticatedUser(
        Long userId,
        String username,
        String role,
        Integer tokenVersion) {
}

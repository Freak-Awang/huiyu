package com.im.common.util;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

/**
 * JWT工具类，负责令牌的生成、校验与解析，供各后端模块共享使用。
 * 令牌有效期7天，密钥通过配置注入并在启动时做强校验。
 */
@Component
public class JwtUtil {

    /** 内置的不安全默认密钥，仅用于检测并阻止其在生产环境使用 */
    private static final String INSECURE_DEFAULT_SECRET =
            "im-secret-key-" + "needs-changing-in-production-2024!";

    @Value("${jwt.secret:}")
    private String secret; // JWT签名密钥

    /** 令牌有效期：7天 */
    private static final long EXPIRATION = 7 * 24 * 60 * 60 * 1000L;

    /**
     * 启动时校验密钥强度，防止使用空密钥、过短密钥或默认密钥上线。
     */
    @PostConstruct
    void validateSecret() {
        if (!StringUtils.hasText(secret)
                || secret.length() < 32
                || INSECURE_DEFAULT_SECRET.equals(secret)) {
            throw new IllegalStateException("JWT_SECRET must be set to a non-default value of at least 32 characters");
        }
    }

    /**
     * 由密钥派生HMAC-SHA签名密钥。
     *
     * @return 签名密钥
     */
    private SecretKey getKey() {
        return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * 生成用户访问令牌，携带用户身份与令牌版本号。
     *
     * @param userId       用户ID
     * @param username     登录用户名
     * @param role         用户角色
     * @param tokenVersion 令牌版本号（为空时按0处理）
     * @return JWT令牌字符串
     */
    public String generateToken(Long userId, String username, String role, Integer tokenVersion) {
        Date now = new Date();
        Date expiration = new Date(now.getTime() + EXPIRATION);

        return Jwts.builder()
                .claim("userId", userId)
                .claim("username", username)
                .claim("role", role)
                .claim("tokenVersion", tokenVersion != null ? tokenVersion : 0)
                .subject(username)
                .issuedAt(now)
                .expiration(expiration)
                .signWith(getKey())
                .compact();
    }

    /**
     * 校验令牌签名与有效期是否合法。
     *
     * @param token JWT令牌
     * @return 合法返回true，否则返回false
     */
    public boolean validateToken(String token) {
        try {
            parseClaims(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * 从令牌中解析用户ID。
     *
     * @param token JWT令牌
     * @return 用户ID
     */
    public Long getUserIdFromToken(String token) {
        return parseClaims(token).get("userId", Long.class);
    }

    /**
     * 从令牌中解析登录用户名。
     *
     * @param token JWT令牌
     * @return 登录用户名
     */
    public String getUsernameFromToken(String token) {
        return parseClaims(token).getSubject();
    }

    /**
     * 从令牌中解析用户角色。
     *
     * @param token JWT令牌
     * @return 用户角色
     */
    public String getRoleFromToken(String token) {
        return parseClaims(token).get("role", String.class);
    }

    /**
     * 从令牌中解析令牌版本号，用于与用户的当前版本比对实现强制下线。
     *
     * @param token JWT令牌
     * @return 令牌版本号
     */
    public Integer getTokenVersionFromToken(String token) {
        return parseClaims(token).get("tokenVersion", Integer.class);
    }

    /**
     * 解析并验签令牌，返回载荷声明。
     *
     * @param token JWT令牌
     * @return 令牌载荷声明
     */
    private Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(getKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}

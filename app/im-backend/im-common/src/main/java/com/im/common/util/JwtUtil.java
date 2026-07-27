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
 * Intent: JwtUtil provides shared utility behavior used across backend modules.
 */
@Component
public class JwtUtil {

    private static final String INSECURE_DEFAULT_SECRET =
            "im-secret-key-" + "needs-changing-in-production-2024!";

    @Value("${jwt.secret:}")
    private String secret;

    private static final long EXPIRATION = 7 * 24 * 60 * 60 * 1000L;

    @PostConstruct
    void validateSecret() {
        if (!StringUtils.hasText(secret)
                || secret.length() < 32
                || INSECURE_DEFAULT_SECRET.equals(secret)) {
            throw new IllegalStateException("JWT_SECRET must be set to a non-default value of at least 32 characters");
        }
    }

    private SecretKey getKey() {
        return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

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

    public boolean validateToken(String token) {
        try {
            parseClaims(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public Long getUserIdFromToken(String token) {
        return parseClaims(token).get("userId", Long.class);
    }

    public String getUsernameFromToken(String token) {
        return parseClaims(token).getSubject();
    }

    public String getRoleFromToken(String token) {
        return parseClaims(token).get("role", String.class);
    }

    public Integer getTokenVersionFromToken(String token) {
        return parseClaims(token).get("tokenVersion", Integer.class);
    }

    private Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(getKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}

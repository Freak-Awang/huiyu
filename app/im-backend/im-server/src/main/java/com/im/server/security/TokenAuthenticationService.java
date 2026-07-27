package com.im.server.security;

import com.im.common.entity.SysUser;
import com.im.common.exception.BusinessException;
import com.im.common.util.JwtUtil;
import com.im.server.mapper.UserMapper;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

@Service
public class TokenAuthenticationService {

    private final JwtUtil jwtUtil;
    private final StringRedisTemplate redisTemplate;
    private final UserMapper userMapper;

    public TokenAuthenticationService(
            JwtUtil jwtUtil,
            StringRedisTemplate redisTemplate,
            UserMapper userMapper) {
        this.jwtUtil = jwtUtil;
        this.redisTemplate = redisTemplate;
        this.userMapper = userMapper;
    }

    public AuthenticatedUser authenticate(String token) {
        try {
            if (!jwtUtil.validateToken(token)
                    || Boolean.TRUE.equals(redisTemplate.hasKey(revocationKey(token)))) {
                throw unauthorized();
            }
            Long userId = jwtUtil.getUserIdFromToken(token);
            Integer tokenVersion = jwtUtil.getTokenVersionFromToken(token);
            SysUser user = userId != null ? userMapper.selectById(userId) : null;
            int currentVersion = user != null && user.getTokenVersion() != null ? user.getTokenVersion() : 0;
            if (user == null
                    || !Integer.valueOf(1).equals(user.getStatus())
                    || tokenVersion == null
                    || tokenVersion != currentVersion) {
                throw unauthorized();
            }
            return new AuthenticatedUser(user.getId(), user.getUsername(), user.getRole(), currentVersion);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw unauthorized();
        }
    }

    public String revocationKey(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.UTF_8));
            return "blacklist:" + HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }

    private BusinessException unauthorized() {
        return new BusinessException(401, "Invalid, expired, or revoked token");
    }
}

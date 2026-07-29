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

/**
 * Token 认证服务。
 * <p>
 * 负责验证 JWT Token 的有效性：检查 Token 签名、是否被撤销（Redis 黑名单）、
 * 用户是否存在且状态正常、Token 版本是否匹配。验证通过后返回已认证用户信息。
 * </p>
 */
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

    /**
     * 验证 JWT Token 并返回已认证用户信息。
     * <p>
     * 验证流程：Token 签名有效性 → Redis 黑名单检查 → 用户存在且状态正常 → Token 版本匹配。
     * 任一环节失败均抛出 401 业务异常。
     * </p>
     *
     * @param token JWT Token 字符串
     * @return 已认证用户信息
     * @throws BusinessException Token 无效、过期或已撤销时抛出
     */
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

    /**
     * 生成 Token 撤销列表的 Redis Key。
     * <p>
     * 对 Token 做 SHA-256 哈希，避免在 Redis 中存储原始 Token。
     * </p>
     *
     * @param token JWT Token 字符串
     * @return Redis 黑名单 Key
     */
    public String revocationKey(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.UTF_8));
            return "blacklist:" + HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }

    /**
     * 构建 401 未授权业务异常。
     */
    private BusinessException unauthorized() {
        return new BusinessException(401, "Invalid, expired, or revoked token");
    }
}

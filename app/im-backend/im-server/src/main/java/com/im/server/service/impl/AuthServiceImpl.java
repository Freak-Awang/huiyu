package com.im.server.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.im.common.dto.LoginRequest;
import com.im.common.dto.LoginResponse;
import com.im.common.entity.SysUser;
import com.im.common.exception.BusinessException;
import com.im.common.util.JwtUtil;
import com.im.server.mapper.UserMapper;
import com.im.server.security.AuthenticatedUser;
import com.im.server.security.TokenAuthenticationService;
import com.im.server.service.AuthService;
import com.im.server.websocket.WebSocketSessionManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/**
 * 认证服务实现：处理登录认证、Token 签发/吊销及 WebSocket 会话联动。
 */
@Service
public class AuthServiceImpl implements AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthServiceImpl.class);
    // 兼容现有 BCrypt 版本；提前识别空值、截断、明文及非法 cost，避免误报密码不匹配。
    private static final Pattern BCRYPT_HASH = Pattern.compile(
            "\\A\\$2[ayb]?\\$(0[4-9]|[12][0-9]|3[01])\\$[./0-9A-Za-z]{53}\\z");

    @Autowired
    private UserMapper userMapper;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private StringRedisTemplate redisTemplate;

    @Autowired
    private TokenAuthenticationService tokenAuthenticationService;

    @Autowired
    private WebSocketSessionManager sessionManager;

    /**
     * 用户登录：校验用户名密码，签发 JWT Token。
     */
    @Override
    public LoginResponse login(LoginRequest request) {
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUser::getUsername, request.getUsername());
        SysUser user = userMapper.selectOne(wrapper);

        if (user == null) {
            throw loginFailed(request.getUsername(), null, "USER_NOT_FOUND");
        }
        if (!Integer.valueOf(1).equals(user.getStatus())) {
            throw loginFailed(request.getUsername(), user.getId(), "ACCOUNT_DISABLED");
        }
        if (user.getPassword() == null || !BCRYPT_HASH.matcher(user.getPassword()).matches()) {
            throw loginFailed(request.getUsername(), user.getId(), "INVALID_PASSWORD_HASH");
        }
        boolean matches;
        try {
            // 登录不应用新密码长度规则，保留历史密码的校验能力。
            matches = request.getPassword() != null
                    && passwordEncoder.matches(request.getPassword(), user.getPassword());
        } catch (IllegalArgumentException exception) {
            // 编码器异常可能包含凭证，不能将异常或其 message 写入日志。
            throw loginFailed(request.getUsername(), user.getId(), "INVALID_PASSWORD_HASH");
        }
        if (!matches) {
            throw loginFailed(request.getUsername(), user.getId(), "PASSWORD_MISMATCH");
        }

        int tokenVersion = user.getTokenVersion() != null ? user.getTokenVersion() : 0;
        String token = jwtUtil.generateToken(user.getId(), user.getUsername(), user.getRole(), tokenVersion);

        LoginResponse response = new LoginResponse();
        response.setToken(token);
        response.setUserId(user.getId());
        response.setNickname(user.getNickname());
        response.setAvatar(user.getAvatar());
        response.setSignature(user.getSignature());
        response.setRole(user.getRole());
        return response;
    }

    private BusinessException loginFailed(String username, Long userId, String reason) {
        // 限长并去除换行、控制字符，防止用户输入伪造日志记录。
        String safeUsername = username == null ? "" : username.substring(0, Math.min(username.length(), 64))
                .replaceAll("[\\p{Cntrl}\\p{Zl}\\p{Zp}]", "_");
        log.warn("Login failed: reason={}, userId={}, username={}", reason, userId, safeUsername);
        return new BusinessException(401, "用户名或密码错误");
    }

    /**
     * 用户登出：吊销 Token 并关闭该用户的所有 WebSocket 会话。
     */
    @Override
    public void logout(String token) {
        AuthenticatedUser currentUser = tokenAuthenticationService.authenticate(token);
        revoke(token);
        sessionManager.closeSessionsForUser(currentUser.userId());
    }

    /**
     * 将 Token 写入 Redis 吊销列表，有效期 7 天。
     */
    private void revoke(String token) {
        redisTemplate.opsForValue().set(
            tokenAuthenticationService.revocationKey(token),
            "1",
            Duration.ofDays(7).toMillis(),
            TimeUnit.MILLISECONDS
        );
    }

    /**
     * 刷新 Token：验证旧 Token 后吊销并签发新 Token。
     */
    @Override
    public LoginResponse refresh(String token) {
        AuthenticatedUser currentUser = tokenAuthenticationService.authenticate(token);
        SysUser user = userMapper.selectById(currentUser.userId());
        revoke(token);
        String newToken = jwtUtil.generateToken(
                user.getId(),
                user.getUsername(),
                user.getRole(),
                user.getTokenVersion() != null ? user.getTokenVersion() : 0);
        LoginResponse response = new LoginResponse();
        response.setToken(newToken);
        response.setUserId(user.getId());
        response.setNickname(user.getNickname());
        response.setAvatar(user.getAvatar());
        response.setSignature(user.getSignature());
        response.setRole(user.getRole());
        return response;
    }
}

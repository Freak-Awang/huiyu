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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

/**
 * Intent: AuthServiceImpl coordinates domain rules, persistence updates, and cross-service side effects.
 */
@Service
public class AuthServiceImpl implements AuthService {

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

    @Override
    public LoginResponse login(LoginRequest request) {
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUser::getUsername, request.getUsername());
        SysUser user = userMapper.selectOne(wrapper);

        if (user == null || user.getStatus() != 1) {
            throw new BusinessException(401, "用户名或密码错误");
        }

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new BusinessException(401, "用户名或密码错误");
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

    @Override
    public void logout(String token) {
        AuthenticatedUser currentUser = tokenAuthenticationService.authenticate(token);
        revoke(token);
        sessionManager.closeSessionsForUser(currentUser.userId());
    }

    private void revoke(String token) {
        redisTemplate.opsForValue().set(
            tokenAuthenticationService.revocationKey(token),
            "1",
            Duration.ofDays(7).toMillis(),
            TimeUnit.MILLISECONDS
        );
    }

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

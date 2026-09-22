package com.im.server.service.impl;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.common.dto.LoginRequest;
import com.im.common.dto.LoginResponse;
import com.im.common.entity.SysUser;
import com.im.common.exception.BusinessException;
import com.im.common.util.JwtUtil;
import com.im.server.mapper.UserMapper;
import com.im.server.security.TokenAuthenticationService;
import com.im.server.websocket.WebSocketSessionManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.BeanUtils;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** 真实 BCrypt/JWT，内存中的 mapper 替身仅模拟数据库非空字段更新。 */
@ExtendWith(OutputCaptureExtension.class)
class AuthPasswordFlowTest {
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(4);
    private UserMapper mapper;
    private WebSocketSessionManager sessions;
    private UserServiceImpl users;
    private AuthServiceImpl auth;
    private JwtUtil jwt;
    private SysUser stored;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        mapper = mock(UserMapper.class);
        sessions = mock(WebSocketSessionManager.class);
        users = new UserServiceImpl();
        auth = new AuthServiceImpl();
        jwt = new JwtUtil();
        ReflectionTestUtils.setField(jwt, "secret", "test-only-password-flow-jwt-secret-32-characters");
        ReflectionTestUtils.setField(users, "userMapper", mapper);
        ReflectionTestUtils.setField(users, "passwordEncoder", encoder);
        ReflectionTestUtils.setField(users, "sessionManager", sessions);
        ReflectionTestUtils.setField(users, "objectMapper", new ObjectMapper().findAndRegisterModules());
        ReflectionTestUtils.setField(auth, "userMapper", mapper);
        ReflectionTestUtils.setField(auth, "passwordEncoder", encoder);
        ReflectionTestUtils.setField(auth, "jwtUtil", jwt);
        when(mapper.selectOne(any(Wrapper.class))).thenAnswer(call -> copy(stored));
        when(mapper.selectById(10L)).thenAnswer(call -> copy(stored));
        when(mapper.insert(any(SysUser.class))).thenAnswer(call -> {
            SysUser user = call.getArgument(0);
            user.setId(10L);
            stored = copy(user);
            return 1;
        });
        when(mapper.updateById(any(SysUser.class))).thenAnswer(call -> {
            SysUser patch = call.getArgument(0);
            if (patch.getPassword() != null) stored.setPassword(patch.getPassword());
            if (patch.getNickname() != null) stored.setNickname(patch.getNickname());
            if (patch.getTokenVersion() != null) stored.setTokenVersion(patch.getTokenVersion());
            return 1;
        });
    }

    @ParameterizedTest
    @ValueSource(strings = {"abcdef", "abcdefghijk", "abcdefghijkl", "中文密码六个", " abcde "})
    void createThenLoginPreservesPassword(String password) {
        users.create(newUser(password));
        assertThat(stored.getPassword()).isNotEqualTo(password);
        assertThat(encoder.matches(password, stored.getPassword())).isTrue();
        assertThat(login(password).getUserId()).isEqualTo(10L);
        if (password.startsWith(" ")) assertLoginRejected(password.trim());
    }

    @ParameterizedTest
    @ValueSource(strings = {"$2a$", "$2b$", "$2y$"})
    void acceptsExistingBcryptVariants(String prefix) {
        stored = newUser(encoder.encode("original").replace("$2a$", prefix));
        stored.setTokenVersion(null);
        assertThat(jwt.getTokenVersionFromToken(login("original").getToken())).isZero();
    }

    @Test
    void acceptsEighteenCharacterBoundaryOnAllWritePaths() {
        users.create(newUser("a".repeat(18)));
        assertThat(login("a".repeat(18)).getUserId()).isEqualTo(10L);
        users.resetPassword(10L, "中".repeat(18));
        assertThat(login("中".repeat(18)).getUserId()).isEqualTo(10L);
        users.updatePassword(10L, "中".repeat(18), "😀".repeat(9));
        assertThat(login("😀".repeat(9)).getUserId()).isEqualTo(10L);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"abcde", "      ", "\t\n\r   ", "\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0",
            "\u3000\u3000\u3000\u3000\u3000\u3000", "\ufeff\ufeff\ufeff\ufeff\ufeff\ufeff", "\u001c\u001c\u001c\u001c\u001c\u001c"})
    void rejectsInvalidPasswordOnAllWritePaths(String password) {
        assertRejectedOnAllWritePaths(password);
    }

    @Test
    void rejectsMoreThanEighteenCharactersOnAllWritePaths() {
        for (String password : new String[]{"a".repeat(19), "中".repeat(19), "a".repeat(73), "😀".repeat(9) + "a"}) {
            assertRejectedOnAllWritePaths(password);
        }
    }

    private void assertRejectedOnAllWritePaths(String password) {
        stored = newUser(encoder.encode("original"));
        String originalHash = stored.getPassword();
        clearInvocations(mapper, sessions);
        assertBadRequest(() -> users.create(newUser(password)));
        assertBadRequest(() -> users.resetPassword(10L, password));
        assertBadRequest(() -> users.updatePassword(10L, "original", password));
        assertThat(stored.getPassword()).isEqualTo(originalHash);
        assertThat(stored.getTokenVersion()).isZero();
        verify(mapper, never()).insert(any(SysUser.class));
        verify(mapper, never()).updateById(any(SysUser.class));
        verify(sessions, never()).closeSessionsForUser(any());
    }

    @Test
    void resetAndChangePasswordRevokeOldCredentialsAndTokens() {
        users.create(newUser("original"));
        String originalToken = login("original").getToken();
        TokenAuthenticationService tokens = new TokenAuthenticationService(jwt, mock(StringRedisTemplate.class), mapper);
        assertThat(tokens.authenticate(originalToken).userId()).isEqualTo(10L);

        users.resetPassword(10L, "reset6");
        assertLoginRejected("original");
        String resetToken = login("reset6").getToken();
        assertThat(jwt.getTokenVersionFromToken(resetToken)).isEqualTo(1);
        assertThatThrownBy(() -> tokens.authenticate(originalToken)).isInstanceOf(BusinessException.class);

        users.updatePassword(10L, "reset6", "change");
        assertLoginRejected("reset6");
        assertThat(jwt.getTokenVersionFromToken(login("change").getToken())).isEqualTo(2);
        assertThatThrownBy(() -> tokens.authenticate(resetToken)).isInstanceOf(BusinessException.class);
        verify(sessions, times(2)).closeSessionsForUser(10L);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"wrong"})
    void incorrectOldPasswordDoesNotWrite(String oldPassword) {
        stored = newUser(encoder.encode("original"));
        assertBadRequest(() -> users.updatePassword(10L, oldPassword, "new-six"));
        verify(mapper, never()).updateById(any(SysUser.class));
        verify(sessions, never()).closeSessionsForUser(any());
    }

    @Test
    void historicalShortAndLongPasswordsCanStillLoginAndBeChanged() {
        stored = newUser(encoder.encode("old"));
        assertThat(login("old").getUserId()).isEqualTo(10L);
        users.updatePassword(10L, "old", "new-six");
        assertThat(login("new-six").getUserId()).isEqualTo(10L);

        stored = newUser(encoder.encode("a".repeat(19)));
        assertThat(login("a".repeat(19)).getUserId()).isEqualTo(10L);
        users.updatePassword(10L, "a".repeat(19), "new-six");
        assertThat(login("new-six").getUserId()).isEqualTo(10L);

        // 历史 BCrypt 的长密码按前 72 字节匹配；仅新密码写入禁止超长。
        stored = newUser(encoder.encode("a".repeat(72)));
        assertThat(login("a".repeat(80)).getUserId()).isEqualTo(10L);
        users.updatePassword(10L, "a".repeat(80), "new-six");
        assertThat(login("new-six").getUserId()).isEqualTo(10L);
    }

    @Test
    void profileEditsDoNotChangePassword() {
        users.create(newUser("original"));
        String hash = stored.getPassword();
        SysUser patch = new SysUser();
        patch.setId(10L);
        patch.setNickname("新昵称");
        patch.setPassword("must-not-be-written");
        users.update(patch);
        assertThat(patch.getPassword()).isNull();
        assertThat(stored.getPassword()).isEqualTo(hash);
        users.updateProfile(10L, "另一个昵称", "", "", "签名");
        assertThat(stored.getPassword()).isEqualTo(hash);
        assertThat(login("original").getUserId()).isEqualTo(10L);
    }

    @Test
    void missingAccountIsDiagnosedWithoutCredentials(CapturedOutput output) {
        assertLoginRejected("secret-input");
        assertThat(output).contains("reason=USER_NOT_FOUND", "username=sample-user");
        assertThat(output).doesNotContain("secret-input");
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(ints = {0, 2})
    void disabledOrMissingStatusIsRejected(Integer status, CapturedOutput output) {
        stored = newUser(encoder.encode("original"));
        stored.setStatus(status);
        assertLoginRejected("original");
        assertThat(output).contains("reason=ACCOUNT_DISABLED", "userId=10");
        assertThat(output).doesNotContain(stored.getPassword());
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"plaintext-secret", "$2a$10$truncated", "$2x$10$.....................................................",
            "$2a$03$.....................................................", "$2a$32$....................................................."})
    void malformedHashesAreDiagnosed(String hash, CapturedOutput output) {
        stored = newUser(hash);
        assertLoginRejected("secret-input");
        assertThat(output).contains("reason=INVALID_PASSWORD_HASH");
        assertThat(output).doesNotContain("secret-input");
        if (hash != null && !hash.isEmpty()) assertThat(output).doesNotContain(hash);
    }

    @Test
    void passwordMismatchIsDiagnosedWithoutCredentials(CapturedOutput output) {
        stored = newUser(encoder.encode("original"));
        assertLoginRejected("secret-input");
        assertThat(output).contains("reason=PASSWORD_MISMATCH");
        assertThat(output).doesNotContain("secret-input", stored.getPassword());
    }

    @Test
    void encoderExceptionIsNotLoggedOrExposed(CapturedOutput output) {
        stored = newUser(encoder.encode("original"));
        BCryptPasswordEncoder broken = mock(BCryptPasswordEncoder.class);
        when(broken.matches(any(), any())).thenThrow(new IllegalArgumentException("secret-encoder-details"));
        ReflectionTestUtils.setField(auth, "passwordEncoder", broken);
        assertLoginRejected("secret-input");
        assertThat(output).contains("reason=INVALID_PASSWORD_HASH");
        assertThat(output).doesNotContain("secret-encoder-details", "secret-input", stored.getPassword());
    }

    @Test
    void usernameCannotInjectLogLines(CapturedOutput output) {
        LoginRequest request = new LoginRequest();
        request.setUsername("bad\nforged\r\t\u2028name");
        request.setPassword("secret-input");
        assertThatThrownBy(() -> auth.login(request)).isInstanceOf(BusinessException.class);
        assertThat(output).contains("username=bad_forged___name");
        assertThat(output).doesNotContain(request.getUsername());
    }

    private LoginResponse login(String password) {
        LoginRequest request = new LoginRequest();
        request.setUsername("sample-user");
        request.setPassword(password);
        return auth.login(request);
    }

    private void assertLoginRejected(String password) {
        assertThatThrownBy(() -> login(password)).isInstanceOf(BusinessException.class)
                .hasMessage("用户名或密码错误").extracting("code").isEqualTo(401);
    }

    private void assertBadRequest(Runnable operation) {
        assertThatThrownBy(operation::run).isInstanceOf(BusinessException.class).extracting("code").isEqualTo(400);
    }

    private SysUser newUser(String password) {
        SysUser user = new SysUser();
        user.setId(10L);
        user.setUsername("sample-user");
        user.setNickname("测试用户");
        user.setStatus(1);
        user.setRole("user");
        user.setTokenVersion(0);
        user.setPassword(password);
        return user;
    }

    private static SysUser copy(SysUser user) {
        if (user == null) return null;
        SysUser result = new SysUser();
        BeanUtils.copyProperties(user, result);
        return result;
    }
}

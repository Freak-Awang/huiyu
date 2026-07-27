package com.im.server.config;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.im.common.entity.SysUser;
import com.im.server.mapper.UserMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;

@Component
public class AdminBootstrapRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminBootstrapRunner.class);

    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;

    @Value("${bootstrap.admin.username:admin}")
    private String username;

    @Value("${bootstrap.admin.password:}")
    private String password;

    public AdminBootstrapRunner(UserMapper userMapper, PasswordEncoder passwordEncoder) {
        this.userMapper = userMapper;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(ApplicationArguments args) {
        Long adminCount = userMapper.selectCount(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getRole, "admin"));
        if (adminCount != null && adminCount > 0) {
            return;
        }
        if (!StringUtils.hasText(password)) {
            log.warn("No administrator exists. Set BOOTSTRAP_ADMIN_PASSWORD for one startup to create one.");
            return;
        }
        if (password.length() < 16 || "123456".equals(password) || "admin123".equalsIgnoreCase(password)) {
            throw new IllegalStateException("BOOTSTRAP_ADMIN_PASSWORD must contain at least 16 non-default characters");
        }
        if (!username.matches("[A-Za-z0-9_.-]{3,64}")) {
            throw new IllegalStateException("BOOTSTRAP_ADMIN_USERNAME is invalid");
        }

        SysUser admin = new SysUser();
        admin.setUsername(username);
        admin.setPassword(passwordEncoder.encode(password));
        admin.setNickname("System Administrator");
        admin.setRole("admin");
        admin.setStatus(1);
        admin.setTokenVersion(0);
        admin.setCreateTime(LocalDateTime.now());
        admin.setUpdateTime(LocalDateTime.now());
        userMapper.insert(admin);
        log.warn("Created bootstrap administrator '{}'. Remove BOOTSTRAP_ADMIN_PASSWORD and rotate the password now.",
                username);
    }
}

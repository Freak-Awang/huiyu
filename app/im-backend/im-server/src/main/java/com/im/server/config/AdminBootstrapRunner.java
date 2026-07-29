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

/**
 * 管理员账号初始化引导器。
 * <p>
 * 应用启动时检查是否存在管理员账号，若不存在则根据环境变量
 * {@code BOOTSTRAP_ADMIN_USERNAME} 和 {@code BOOTSTRAP_ADMIN_PASSWORD}
 * 创建初始管理员。密码需满足安全要求（至少 16 位且非默认弱密码）。
 * </p>
 */
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

    /**
     * 应用启动后执行管理员账号初始化检查。
     *
     * @param args 应用启动参数
     */
    @Override
    public void run(ApplicationArguments args) {
        // 已存在管理员则跳过初始化
        Long adminCount = userMapper.selectCount(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getRole, "admin"));
        if (adminCount != null && adminCount > 0) {
            return;
        }
        // 未配置初始密码时仅警告，不阻断启动
        if (!StringUtils.hasText(password)) {
            log.warn("No administrator exists. Set BOOTSTRAP_ADMIN_PASSWORD for one startup to create one.");
            return;
        }
        // 密码安全校验：至少 16 位且非弱密码
        if (password.length() < 16 || "123456".equals(password) || "admin123".equalsIgnoreCase(password)) {
            throw new IllegalStateException("BOOTSTRAP_ADMIN_PASSWORD must contain at least 16 non-default characters");
        }
        // 用户名校验：3-64 位字母数字及 _ . -
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

package com.im.server.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.im.common.dto.UserProfileVO;
import com.im.common.entity.SysDept;
import com.im.common.entity.SysUser;
import com.im.common.exception.BusinessException;
import com.im.common.result.PageResult;
import com.im.server.mapper.DeptMapper;
import com.im.server.mapper.UserMapper;
import com.im.server.service.UserService;
import com.im.server.websocket.WebSocketSessionManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Intent: UserServiceImpl coordinates domain rules, persistence updates, and cross-service side effects.
 */
@Service
public class UserServiceImpl implements UserService {

    private static final Logger log = LoggerFactory.getLogger(UserServiceImpl.class);
    private static final int MAX_SIGNATURE_LENGTH = 128;

    @Autowired
    private UserMapper userMapper;

    @Autowired
    private DeptMapper deptMapper;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private WebSocketSessionManager sessionManager;

    @Autowired
    private ObjectMapper objectMapper;

    @Override
    public SysUser getById(Long id) {
        SysUser user = userMapper.selectById(id);
        if (user == null) {
            throw new RuntimeException("用户不存在");
        }
        return user;
    }

    @Override
    public UserProfileVO getProfileById(Long id) {
        return toProfileVO(getById(id));
    }

    @Override
    public List<SysUser> listByDeptId(Long deptId) {
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        if (deptId == null) {
            wrapper.isNull(SysUser::getDeptId);
        } else {
            wrapper.eq(SysUser::getDeptId, deptId);
        }
        wrapper.eq(SysUser::getStatus, 1);
        return userMapper.selectList(wrapper);
    }

    @Override
    public List<UserProfileVO> listProfilesByDeptId(Long deptId) {
        return listByDeptId(deptId).stream().map(this::toProfileVO).toList();
    }

    @Override
    public PageResult<SysUser> pageUsers(String keyword, Integer status, int page, int pageSize) {
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(keyword)) {
            wrapper.and(w -> w.like(SysUser::getUsername, keyword)
                             .or()
                             .like(SysUser::getNickname, keyword));
        }
        if (status != null) {
            wrapper.eq(SysUser::getStatus, status);
        }
        wrapper.orderByDesc(SysUser::getCreateTime);

        Page<SysUser> pageResult = new Page<>(page, pageSize);
        pageResult = userMapper.selectPage(pageResult, wrapper);

        return PageResult.success(pageResult.getRecords(), pageResult.getTotal(), page, pageSize);
    }

    @Override
    public PageResult<UserProfileVO> pageProfiles(String keyword, Integer status, int page, int pageSize) {
        PageResult<SysUser> result = pageUsers(keyword, status, page, pageSize);
        List<UserProfileVO> profiles = result.getData().stream().map(this::toProfileVO).toList();
        return PageResult.success(profiles, result.getTotal(), result.getPage(), result.getPageSize());
    }

    @Override
    public SysUser create(SysUser user) {
        user.setPassword(passwordEncoder.encode(user.getPassword()));
        user.setCreateTime(LocalDateTime.now());
        user.setUpdateTime(LocalDateTime.now());
        userMapper.insert(user);
        return user;
    }

    @Override
    public SysUser update(SysUser user) {
        user.setUpdateTime(LocalDateTime.now());
        user.setPassword(null);
        userMapper.updateById(user);
        SysUser saved = getById(user.getId());
        notifyUserUpdated(saved);
        return saved;
    }

    @Override
    public void delete(Long id) {
        userMapper.deleteById(id);
    }

    @Override
    public void updatePassword(Long userId, String oldPassword, String newPassword) {
        SysUser user = getById(userId);
        if (!passwordEncoder.matches(oldPassword, user.getPassword())) {
            throw new RuntimeException("原密码错误");
        }
        user.setPassword(passwordEncoder.encode(newPassword));
        user.setUpdateTime(LocalDateTime.now());
        userMapper.updateById(user);
    }

    @Override
    public void resetPassword(Long userId, String newPassword) {
        if (!StringUtils.hasText(newPassword) || newPassword.length() < 6) {
            throw new RuntimeException("密码至少6位");
        }
        SysUser user = getById(userId);
        user.setPassword(passwordEncoder.encode(newPassword));
        user.setUpdateTime(LocalDateTime.now());
        userMapper.updateById(user);
    }

    @Override
    public UserProfileVO updateProfile(Long userId, String nickname, String email, String phone, String signature) {
        SysUser user = getById(userId);
        user.setNickname(nickname);
        user.setEmail(email);
        user.setPhone(phone);
        user.setSignature(normalizeSignature(signature));
        user.setUpdateTime(LocalDateTime.now());
        userMapper.updateById(user);
        notifyUserUpdated(user);
        return toProfileVO(user);
    }

    @Override
    public UserProfileVO updateAvatar(Long userId, String avatar) {
        SysUser user = getById(userId);
        user.setAvatar(avatar);
        user.setUpdateTime(LocalDateTime.now());
        userMapper.updateById(user);
        notifyUserUpdated(user);
        return toProfileVO(user);
    }

    private String normalizeSignature(String signature) {
        if (signature == null) {
            return null;
        }
        String trimmed = signature.trim();
        if (!StringUtils.hasText(trimmed)) {
            return null;
        }
        if (trimmed.length() > MAX_SIGNATURE_LENGTH) {
            throw new BusinessException(400, "个性签名最多128字");
        }
        return trimmed;
    }

    private UserProfileVO toProfileVO(SysUser user) {
        UserProfileVO profile = new UserProfileVO();
        profile.setUserId(user.getId());
        profile.setUsername(user.getUsername());
        profile.setNickname(user.getNickname());
        profile.setAvatar(user.getAvatar());
        profile.setSignature(user.getSignature());
        profile.setEmail(user.getEmail());
        profile.setPhone(user.getPhone());
        profile.setDeptId(user.getDeptId());
        profile.setRole(user.getRole());
        profile.setStatus(user.getStatus());
        profile.setUpdatedAt(user.getUpdateTime());
        if (user.getDeptId() != null) {
            SysDept dept = deptMapper.selectById(user.getDeptId());
            profile.setDeptName(dept != null ? dept.getName() : null);
        }
        return profile;
    }

    private void notifyUserUpdated(SysUser user) {
        try {
            ObjectNode message = objectMapper.createObjectNode();
            message.put("cmd", "USER_UPDATED");
            message.set("data", objectMapper.valueToTree(toProfileVO(user)));
            String payload = objectMapper.writeValueAsString(message);
            for (Long onlineUserId : List.copyOf(sessionManager.getOnlineUserIds())) {
                sessionManager.sendToUser(onlineUserId, payload);
            }
        } catch (Exception e) {
            log.error("Failed to publish USER_UPDATED for userId={}", user.getId(), e);
        }
    }
}

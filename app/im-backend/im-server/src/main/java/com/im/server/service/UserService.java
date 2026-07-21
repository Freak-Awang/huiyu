package com.im.server.service;

import com.im.common.entity.SysUser;
import com.im.common.dto.UserProfileVO;
import com.im.common.result.PageResult;

import java.util.List;
/**
 * Intent: UserService defines the service contract used by controllers and async workflows.
 */

public interface UserService {

    SysUser getById(Long id);

    UserProfileVO getProfileById(Long id);

    List<SysUser> listByDeptId(Long deptId);

    List<UserProfileVO> listProfilesByDeptId(Long deptId);

    PageResult<SysUser> pageUsers(String keyword, Integer status, int page, int pageSize);

    PageResult<UserProfileVO> pageProfiles(String keyword, Integer status, int page, int pageSize);

    SysUser create(SysUser user);

    SysUser update(SysUser user);

    void delete(Long id);

    void updatePassword(Long userId, String oldPassword, String newPassword);

    void resetPassword(Long userId, String newPassword);

    UserProfileVO updateProfile(Long userId, String nickname, String email, String phone, String signature);

    UserProfileVO updateAvatar(Long userId, String avatar);
}

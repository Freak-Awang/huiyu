package com.im.server.service;

import com.im.common.entity.SysUser;
import com.im.common.result.PageResult;

import java.util.List;

public interface UserService {

    SysUser getById(Long id);

    List<SysUser> listByDeptId(Long deptId);

    PageResult<SysUser> pageUsers(String keyword, Integer status, int page, int pageSize);

    SysUser create(SysUser user);

    SysUser update(SysUser user);

    void delete(Long id);

    void updatePassword(Long userId, String oldPassword, String newPassword);

    SysUser updateProfile(Long userId, String nickname, String email, String phone);
}

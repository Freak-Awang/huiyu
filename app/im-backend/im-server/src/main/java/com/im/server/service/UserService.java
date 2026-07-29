package com.im.server.service;

import com.im.common.entity.SysUser;
import com.im.common.dto.UserProfileVO;
import com.im.common.result.PageResult;

import java.util.List;
/**
 * 用户服务接口：定义用户资料查询、分页管理、密码管理及个人信息维护等业务契约。
 */
public interface UserService {

    /**
     * 按 ID 查询用户。
     *
     * @param id 用户 ID
     * @return 用户实体
     */
    SysUser getById(Long id);

    /**
     * 按 ID 查询用户资料视图。
     *
     * @param id 用户 ID
     * @return 用户资料视图
     */
    UserProfileVO getProfileById(Long id);

    /**
     * 按部门查询启用状态用户列表。
     *
     * @param deptId 部门 ID，null 表示未分配部门
     * @return 用户列表
     */
    List<SysUser> listByDeptId(Long deptId);

    /**
     * 按部门查询用户资料视图列表。
     *
     * @param deptId 部门 ID
     * @return 用户资料视图列表
     */
    List<UserProfileVO> listProfilesByDeptId(Long deptId);

    /**
     * 分页查询用户（管理后台）。
     *
     * @param keyword 关键词（用户名/昵称模糊匹配）
     * @param status 状态过滤
     * @param page 页码
     * @param pageSize 每页大小
     * @return 用户分页结果
     */
    PageResult<SysUser> pageUsers(String keyword, Integer status, int page, int pageSize);

    /**
     * 分页查询用户资料视图。
     *
     * @param keyword 关键词
     * @param status 状态过滤
     * @param page 页码
     * @param pageSize 每页大小
     * @return 用户资料分页结果
     */
    PageResult<UserProfileVO> pageProfiles(String keyword, Integer status, int page, int pageSize);

    /**
     * 创建用户。
     *
     * @param user 用户实体（明文密码将在内部加密）
     * @return 创建后的用户
     */
    SysUser create(SysUser user);

    /**
     * 更新用户信息（会递增 tokenVersion 并强制下线）。
     *
     * @param user 用户实体
     * @return 更新后的用户
     */
    SysUser update(SysUser user);

    /**
     * 删除用户（软删除，置为禁用状态并强制下线）。
     *
     * @param id 用户 ID
     */
    void delete(Long id);

    /**
     * 修改密码（校验旧密码）。
     *
     * @param userId 用户 ID
     * @param oldPassword 旧密码
     * @param newPassword 新密码
     */
    void updatePassword(Long userId, String oldPassword, String newPassword);

    /**
     * 重置密码（管理员操作）。
     *
     * @param userId 用户 ID
     * @param newPassword 新密码
     */
    void resetPassword(Long userId, String newPassword);

    /**
     * 更新个人资料。
     *
     * @param userId 用户 ID
     * @param nickname 昵称
     * @param email 邮箱
     * @param phone 手机号
     * @param signature 个性签名
     * @return 更新后的资料视图
     */
    UserProfileVO updateProfile(Long userId, String nickname, String email, String phone, String signature);

    /**
     * 更新头像。
     *
     * @param userId 用户 ID
     * @param avatar 头像地址
     * @return 更新后的资料视图
     */
    UserProfileVO updateAvatar(Long userId, String avatar);
}

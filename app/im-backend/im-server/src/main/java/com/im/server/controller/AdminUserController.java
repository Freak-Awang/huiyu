package com.im.server.controller;

import com.im.common.entity.SysUser;
import com.im.common.result.PageResult;
import com.im.common.result.Result;
import com.im.server.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 管理端用户控制器。
 * <p>
 * 提供用户分页查询、增删改、状态变更、密码重置等管理接口，
 * URL 前缀为 {@code /api/admin/users}，需要管理员权限。
 * </p>
 */
@RestController
@RequestMapping("/api/admin/users")
public class AdminUserController {

    @Autowired
    private UserService userService;

    /**
     * 分页查询用户列表。
     *
     * @param keyword  搜索关键词（可选）
     * @param status   用户状态（可选）
     * @param page     页码，默认 1
     * @param pageSize 每页数量，默认 20
     * @return 用户分页数据
     */
    @GetMapping("/page")
    public Result<PageResult<SysUser>> page(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Integer status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        return Result.success(userService.pageUsers(keyword, status, page, pageSize));
    }

    /**
     * 创建用户。
     *
     * @param user 用户信息
     * @return 创建后的用户
     */
    @PostMapping
    public Result<SysUser> create(@RequestBody SysUser user) {
        return Result.success(userService.create(user));
    }

    /**
     * 更新用户。
     *
     * @param user 用户信息
     * @return 更新后的用户
     */
    @PutMapping
    public Result<SysUser> update(@RequestBody SysUser user) {
        return Result.success(userService.update(user));
    }

    /**
     * 删除用户。
     *
     * @param id 用户 ID
     * @return 操作结果
     */
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        userService.delete(id);
        return Result.ok();
    }

    /**
     * 更新用户状态。
     *
     * @param id     用户 ID
     * @param status 新状态
     * @return 操作结果
     */
    @PutMapping("/{id}/status")
    public Result<Void> updateStatus(@PathVariable Long id, @RequestParam Integer status) {
        SysUser user = userService.getById(id);
        user.setStatus(status);
        userService.update(user);
        return Result.ok();
    }

    /**
     * 重置用户密码。
     *
     * @param id      用户 ID
     * @param request 包含新密码的请求体
     * @return 操作结果
     */
    @PutMapping("/{id}/password/reset")
    public Result<Void> resetPassword(@PathVariable Long id, @RequestBody ResetPasswordRequest request) {
        userService.resetPassword(id, request != null ? request.getNewPassword() : null);
        return Result.ok();
    }

    public static class ResetPasswordRequest {
        private String newPassword;

        public String getNewPassword() {
            return newPassword;
        }

        public void setNewPassword(String newPassword) {
            this.newPassword = newPassword;
        }
    }
}

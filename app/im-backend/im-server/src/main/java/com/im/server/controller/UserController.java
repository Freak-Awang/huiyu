package com.im.server.controller;

import com.im.common.dto.UserProfileVO;
import com.im.common.result.PageResult;
import com.im.common.result.Result;
import com.im.server.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 用户控制器。
 * <p>
 * 提供当前用户信息查询、用户资料查询、部门用户列表、
 * 用户搜索、资料更新、密码修改等接口，
 * URL 前缀为 {@code /api/users}。
 * </p>
 */
@RestController
@RequestMapping("/api/users")
public class UserController {

    @Autowired
    private UserService userService;

    /**
     * 查询当前登录用户信息。
     *
     * @return 当前用户资料
     */
    @GetMapping("/me")
    public Result<UserProfileVO> getCurrentUser() {
        Long userId = getCurrentUserId();
        return Result.success(userService.getProfileById(userId));
    }

    /**
     * 查询指定用户资料。
     *
     * @param id 用户 ID
     * @return 用户资料
     */
    @GetMapping("/{id}")
    public Result<UserProfileVO> getProfile(@org.springframework.web.bind.annotation.PathVariable Long id) {
        return Result.success(userService.getProfileById(id));
    }

    /**
     * 查询部门下的用户列表。
     *
     * @param deptId 部门 ID（可选，为空时查询全部）
     * @return 用户资料列表
     */
    @GetMapping("/list")
    public Result<List<UserProfileVO>> listByDept(@RequestParam(required = false) Long deptId) {
        return Result.success(userService.listProfilesByDeptId(deptId));
    }

    /**
     * 分页搜索用户。
     *
     * @param keyword  搜索关键词（可选）
     * @param page     页码，默认 1
     * @param pageSize 每页数量，默认 20
     * @return 用户分页数据
     */
    @GetMapping("/search")
    public Result<PageResult<UserProfileVO>> search(
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        return Result.success(userService.pageProfiles(keyword, null, page, pageSize));
    }

    /**
     * 更新当前用户资料。
     *
     * @param body 包含 nickname、email、phone、signature 的请求体
     * @return 更新后的用户资料
     */
    @PutMapping("/profile")
    public Result<UserProfileVO> updateProfile(@RequestBody Map<String, String> body) {
        Long userId = getCurrentUserId();
        UserProfileVO user = userService.updateProfile(
                userId,
                body.get("nickname"),
                body.get("email"),
                body.get("phone"),
                body.get("signature"));
        return Result.success(user);
    }

    /**
     * 修改当前用户密码。
     *
     * @param body 包含 oldPassword 和 newPassword 的请求体
     * @return 操作结果
     */
    @PutMapping("/password")
    public Result<Void> updatePassword(@RequestBody Map<String, String> body) {
        Long userId = getCurrentUserId();
        userService.updatePassword(userId, body.get("oldPassword"), body.get("newPassword"));
        return Result.ok();
    }

    private Long getCurrentUserId() {
        String userIdStr = (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return Long.parseLong(userIdStr);
    }
}

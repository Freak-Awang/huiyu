package com.im.server.controller;

import com.im.common.entity.SysUser;
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

@RestController
@RequestMapping("/api/users")
public class UserController {

    @Autowired
    private UserService userService;

    @GetMapping("/me")
    public Result<SysUser> getCurrentUser() {
        Long userId = getCurrentUserId();
        return Result.success(userService.getById(userId));
    }

    @GetMapping("/list")
    public Result<List<SysUser>> listByDept(@RequestParam(required = false) Long deptId) {
        return Result.success(userService.listByDeptId(deptId));
    }

    @GetMapping("/search")
    public Result<PageResult<SysUser>> search(
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        return Result.success(userService.pageUsers(keyword, null, page, pageSize));
    }

    @PutMapping("/profile")
    public Result<SysUser> updateProfile(@RequestBody Map<String, String> body) {
        Long userId = getCurrentUserId();
        SysUser user = userService.updateProfile(
                userId,
                body.get("nickname"),
                body.get("email"),
                body.get("phone"));
        return Result.success(user);
    }

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

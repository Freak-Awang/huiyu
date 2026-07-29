package com.im.server.controller;

import com.im.common.result.Result;
import com.im.server.service.ClientReleaseService;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 客户端版本更新控制器。
 * <p>
 * 提供客户端更新策略查询和更新事件上报接口，
 * URL 前缀为 {@code /api/client}。策略查询接口允许匿名访问。
 * </p>
 */
@RestController
@RequestMapping("/api/client")
public class ClientReleaseController {
    private final ClientReleaseService releaseService;

    public ClientReleaseController(ClientReleaseService releaseService) {
        this.releaseService = releaseService;
    }

    /**
     * 查询客户端更新策略。
     *
     * @param platform       平台，默认 win32
     * @param arch           架构，默认 x64
     * @param channel        发布渠道，默认 stable
     * @param currentVersion 当前版本号
     * @param deviceId       设备 ID
     * @return 更新策略响应
     */
    @GetMapping("/releases/policy")
    public Result<ClientReleaseService.PolicyResponse> policy(
            @RequestParam(defaultValue = "win32") String platform,
            @RequestParam(defaultValue = "x64") String arch,
            @RequestParam(defaultValue = "stable") String channel,
            @RequestParam String currentVersion,
            @RequestParam String deviceId) {
        return Result.success(releaseService.evaluatePolicy(platform, arch, channel, currentVersion, deviceId, currentUserId()));
    }

    /**
     * 上报客户端更新事件。
     *
     * @param request 更新事件请求
     * @return 操作结果
     */
    @PostMapping("/update-events")
    public Result<Void> event(@RequestBody ClientReleaseService.UpdateEventRequest request) {
        releaseService.recordEvent(request, currentUserId());
        return Result.ok();
    }

    private Long currentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated() || authentication.getPrincipal() == null
                || "anonymousUser".equals(authentication.getPrincipal())) return null;
        try {
            return Long.parseLong(String.valueOf(authentication.getPrincipal()));
        } catch (NumberFormatException ignored) {
            return null;
        }
    }
}


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

@RestController
@RequestMapping("/api/client")
public class ClientReleaseController {
    private final ClientReleaseService releaseService;

    public ClientReleaseController(ClientReleaseService releaseService) {
        this.releaseService = releaseService;
    }

    @GetMapping("/releases/policy")
    public Result<ClientReleaseService.PolicyResponse> policy(
            @RequestParam(defaultValue = "win32") String platform,
            @RequestParam(defaultValue = "x64") String arch,
            @RequestParam(defaultValue = "stable") String channel,
            @RequestParam String currentVersion,
            @RequestParam String deviceId) {
        return Result.success(releaseService.evaluatePolicy(platform, arch, channel, currentVersion, deviceId, currentUserId()));
    }

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


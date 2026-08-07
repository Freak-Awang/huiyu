package com.im.server.controller;

import com.im.common.result.Result;
import com.im.server.service.ClientReleaseService;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** 管理员审批客户端发布；核心产物只能由受保护流水线导入。 */
@RestController
@RequestMapping("/api/admin/client-releases")
public class AdminClientReleaseController {
    private final ClientReleaseService releaseService;

    public AdminClientReleaseController(ClientReleaseService releaseService) {
        this.releaseService = releaseService;
    }

    @GetMapping
    public Result<ClientReleaseService.ReleasePage> page(
            @RequestParam(required = false) String channel,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        return Result.success(releaseService.page(channel, status, page, pageSize));
    }

    @GetMapping("/{id}")
    public Result<ClientReleaseService.ReleaseDetail> get(@PathVariable Long id) {
        return Result.success(releaseService.get(id));
    }

    @PatchMapping("/{id}/policy")
    public Result<ClientReleaseService.ReleaseDetail> updatePolicy(
            @PathVariable Long id, @RequestBody ClientReleaseService.PolicyUpdateRequest request) {
        return Result.success(releaseService.updatePolicy(id, request, currentUserId()));
    }

    @PostMapping("/{id}/publish")
    public Result<ClientReleaseService.ReleaseDetail> publish(
            @PathVariable Long id, @RequestBody ClientReleaseService.ReleaseActionRequest request) {
        return Result.success(releaseService.publish(id, request, currentUserId()));
    }

    @PostMapping("/{id}/pause")
    public Result<ClientReleaseService.ReleaseDetail> pause(
            @PathVariable Long id, @RequestBody ClientReleaseService.ReleaseActionRequest request) {
        return Result.success(releaseService.pause(id, request, currentUserId()));
    }

    @GetMapping("/{id}/statistics")
    public Result<Map<String, Object>> statistics(@PathVariable Long id) {
        return Result.success(releaseService.statistics(id));
    }

    private Long currentUserId() {
        return Long.parseLong(String.valueOf(SecurityContextHolder.getContext().getAuthentication().getPrincipal()));
    }
}

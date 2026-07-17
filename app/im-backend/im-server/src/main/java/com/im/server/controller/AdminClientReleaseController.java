package com.im.server.controller;

import com.im.common.result.Result;
import com.im.server.service.ClientReleaseService;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

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

    @PostMapping
    public Result<ClientReleaseService.ReleaseDetail> create(@RequestBody ClientReleaseService.ReleaseRequest request) {
        return Result.success(releaseService.save(request, currentUserId()));
    }

    @PutMapping("/{id}")
    public Result<ClientReleaseService.ReleaseDetail> update(@PathVariable Long id,
                                                              @RequestBody ClientReleaseService.ReleaseRequest request) {
        ClientReleaseService.ReleaseRequest value = new ClientReleaseService.ReleaseRequest(id, request.version(), request.channel(),
                request.platform(), request.arch(), request.releaseName(), request.releaseNotes(), request.minimumVersion(),
                request.forceUpdate(), request.rolloutPercentage(), request.updateBaseUrl(), request.installerName(),
                request.installerSize(), request.installerSha512(), request.targets());
        return Result.success(releaseService.save(value, currentUserId()));
    }

    @PostMapping("/{id}/publish")
    public Result<ClientReleaseService.ReleaseDetail> publish(@PathVariable Long id) {
        return Result.success(releaseService.publish(id, currentUserId()));
    }

    @PostMapping("/{id}/pause")
    public Result<ClientReleaseService.ReleaseDetail> pause(@PathVariable Long id) {
        return Result.success(releaseService.pause(id));
    }

    @GetMapping("/{id}/statistics")
    public Result<Map<String, Object>> statistics(@PathVariable Long id) {
        return Result.success(releaseService.statistics(id));
    }

    private Long currentUserId() {
        return Long.parseLong(String.valueOf(SecurityContextHolder.getContext().getAuthentication().getPrincipal()));
    }
}

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

/**
 * 管理端客户端版本发布控制器。
 * <p>
 * 提供客户端版本发布的增删改查、发布/暂停、统计等管理接口，
 * URL 前缀为 {@code /api/admin/client-releases}，需要管理员权限。
 * </p>
 */
@RestController
@RequestMapping("/api/admin/client-releases")
public class AdminClientReleaseController {
    private final ClientReleaseService releaseService;

    public AdminClientReleaseController(ClientReleaseService releaseService) {
        this.releaseService = releaseService;
    }

    /**
     * 分页查询版本发布列表。
     *
     * @param channel  发布渠道（可选）
     * @param status   发布状态（可选）
     * @param page     页码，默认 1
     * @param pageSize 每页数量，默认 20
     * @return 版本发布分页数据
     */
    @GetMapping
    public Result<ClientReleaseService.ReleasePage> page(
            @RequestParam(required = false) String channel,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        return Result.success(releaseService.page(channel, status, page, pageSize));
    }

    /**
     * 查询版本发布详情。
     *
     * @param id 发布记录 ID
     * @return 版本发布详情
     */
    @GetMapping("/{id}")
    public Result<ClientReleaseService.ReleaseDetail> get(@PathVariable Long id) {
        return Result.success(releaseService.get(id));
    }

    /**
     * 创建版本发布。
     *
     * @param request 版本发布请求参数
     * @return 创建后的版本发布详情
     */
    @PostMapping
    public Result<ClientReleaseService.ReleaseDetail> create(@RequestBody ClientReleaseService.ReleaseRequest request) {
        return Result.success(releaseService.save(request, currentUserId()));
    }

    /**
     * 更新版本发布。
     *
     * @param id      发布记录 ID
     * @param request 版本发布请求参数
     * @return 更新后的版本发布详情
     */
    @PutMapping("/{id}")
    public Result<ClientReleaseService.ReleaseDetail> update(@PathVariable Long id,
                                                              @RequestBody ClientReleaseService.ReleaseRequest request) {
        ClientReleaseService.ReleaseRequest value = new ClientReleaseService.ReleaseRequest(id, request.version(), request.channel(),
                request.platform(), request.arch(), request.releaseName(), request.releaseNotes(), request.minimumVersion(),
                request.forceUpdate(), request.rolloutPercentage(), request.updateBaseUrl(), request.installerName(),
                request.installerSize(), request.installerSha512(), request.targets());
        return Result.success(releaseService.save(value, currentUserId()));
    }

    /**
     * 发布版本。
     *
     * @param id 发布记录 ID
     * @return 发布后的版本详情
     */
    @PostMapping("/{id}/publish")
    public Result<ClientReleaseService.ReleaseDetail> publish(@PathVariable Long id) {
        return Result.success(releaseService.publish(id, currentUserId()));
    }

    /**
     * 暂停版本发布。
     *
     * @param id 发布记录 ID
     * @return 暂停后的版本详情
     */
    @PostMapping("/{id}/pause")
    public Result<ClientReleaseService.ReleaseDetail> pause(@PathVariable Long id) {
        return Result.success(releaseService.pause(id));
    }

    /**
     * 查询版本发布统计信息。
     *
     * @param id 发布记录 ID
     * @return 统计数据
     */
    @GetMapping("/{id}/statistics")
    public Result<Map<String, Object>> statistics(@PathVariable Long id) {
        return Result.success(releaseService.statistics(id));
    }

    private Long currentUserId() {
        return Long.parseLong(String.valueOf(SecurityContextHolder.getContext().getAuthentication().getPrincipal()));
    }
}

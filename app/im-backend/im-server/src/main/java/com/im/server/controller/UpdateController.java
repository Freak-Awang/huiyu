package com.im.server.controller;

import com.im.common.dto.update.UpdateCheckResponse;
import com.im.common.dto.update.UpdateReportRequest;
import com.im.common.result.Result;
import com.im.server.security.AuthenticatedUser;
import com.im.server.service.UpdateCheckService;
import com.im.server.service.UpdatePackageService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 客户端在线更新控制器。
 * <p>
 * 提供更新检查、更新包下载（支持 Range 断点续传）、更新结果上报接口，
 * URL 前缀为 {@code /api/v1/update}，需登录认证（桌面端携带 JWT）。
 * </p>
 */
@RestController
@RequestMapping("/api/v1/update")
public class UpdateController {

    @Autowired
    private UpdateCheckService updateCheckService;
    @Autowired
    private UpdatePackageService packageService;

    /**
     * 客户端更新检查接口。
     *
     * @param clientVersion 客户端当前版本号（请求头 X-Client-Version）
     * @param clientBuild   客户端当前构建号（请求头 X-Client-Build）
     * @param deviceId      设备唯一标识（请求头 X-Device-ID）
     * @param channel       发布渠道（请求头 X-Channel，默认 stable）
     * @return 更新检查结果
     */
    @GetMapping("/check")
    public Result<UpdateCheckResponse> checkUpdate(
            @RequestHeader("X-Client-Version") String clientVersion,
            @RequestHeader(value = "X-Client-Build", defaultValue = "0") Integer clientBuild,
            @RequestHeader("X-Device-ID") String deviceId,
            @RequestHeader(value = "X-Channel", defaultValue = "stable") String channel,
            @RequestHeader(value = "X-Support-Patch", defaultValue = "true") boolean supportPatch) {
        return Result.success(updateCheckService.check(
                clientVersion, clientBuild, deviceId, channel, supportPatch, currentUserId()));
    }

    /**
     * 下载更新包（支持 Range 断点续传）。
     *
     * @param packageId   更新包 ID
     * @param rangeHeader 请求 Range 头（可空）
     * @return 文件流响应
     */
    @GetMapping("/download/{packageId}")
    public ResponseEntity<Resource> downloadPackage(
            @PathVariable Long packageId,
            @RequestHeader(value = "Range", required = false) String rangeHeader) {
        return packageService.downloadPackage(packageId, rangeHeader);
    }

    /**
     * 上报更新结果（下载/安装成功失败、回滚等）。
     *
     * @param reportRequest 上报内容
     * @return 操作结果
     */
    @PostMapping("/report")
    public Result<Void> reportUpdateResult(@RequestBody UpdateReportRequest reportRequest) {
        updateCheckService.recordUpdateResult(reportRequest, currentUserId());
        return Result.ok();
    }

    /**
     * 获取当前登录用户 ID（未登录时返回 null，客户端上报允许匿名场景兜底）。
     */
    private Long currentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof AuthenticatedUser user) {
            return user.userId();
        }
        return null;
    }
}

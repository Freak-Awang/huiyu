package com.im.server.controller;

import com.im.common.dto.update.GrayStrategyRequest;
import com.im.common.entity.AppVersion;
import com.im.common.entity.UpdatePackage;
import com.im.common.result.PageResult;
import com.im.common.result.Result;
import com.im.server.service.UpdatePackageService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 管理端客户端版本发布控制器。
 * <p>
 * 提供版本发布（安装包上传）、版本分页查询、状态变更、灰度策略配置、
 * 更新统计等管理接口，URL 前缀为 {@code /api/admin/update}，需要管理员权限。
 * </p>
 */
@RestController
@RequestMapping("/api/admin/update")
public class AdminUpdateController {

    @Autowired
    private UpdatePackageService packageService;

    /**
     * 发布新版本（上传全量安装包，异步生成增量补丁）。
     *
     * @param file          安装包文件
     * @param version       版本号 x.y.z
     * @param buildNumber   构建号
     * @param channel       发布渠道（默认 stable）
     * @param updateType    更新类型（默认 full）
     * @param changelog     更新日志 JSON 数组（可空）
     * @param minVersion    最低兼容版本（可空）
     * @param forceDeadline 强制更新截止时间（可空，格式 yyyy-MM-dd HH:mm:ss）
     * @param publish       是否立即发布（默认 true，否则为草稿）
     * @return 创建的版本
     */
    @PostMapping("/versions")
    public Result<AppVersion> publishVersion(
            @RequestParam("file") MultipartFile file,
            @RequestParam String version,
            @RequestParam Integer buildNumber,
            @RequestParam(defaultValue = "stable") String channel,
            @RequestParam(defaultValue = "full") String updateType,
            @RequestParam(required = false) String changelog,
            @RequestParam(required = false) String minVersion,
            @RequestParam(required = false)
            @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime forceDeadline,
            @RequestParam(defaultValue = "true") boolean publish) {
        return Result.success(packageService.publishVersion(
                file, version, buildNumber, channel, updateType, changelog, minVersion, forceDeadline, publish));
    }

    /**
     * 分页查询版本列表。
     *
     * @param channel  渠道过滤（可空）
     * @param page     页码，默认 1
     * @param pageSize 每页数量，默认 20
     * @return 版本分页数据
     */
    @GetMapping("/versions/page")
    public Result<PageResult<AppVersion>> pageVersions(
            @RequestParam(required = false) String channel,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        return Result.success(packageService.pageVersions(channel, page, pageSize));
    }

    /**
     * 查询版本关联的更新包（全量包 + 增量补丁）。
     *
     * @param versionId 版本 ID
     * @return 更新包列表
     */
    @GetMapping("/versions/{versionId}/packages")
    public Result<List<UpdatePackage>> listPackages(@PathVariable Long versionId) {
        return Result.success(packageService.listPackages(versionId));
    }

    /**
     * 更新版本状态（0-草稿 1-发布 2-下架）。
     *
     * @param versionId 版本 ID
     * @param status    目标状态
     * @return 操作结果
     */
    @PutMapping("/versions/{versionId}/status")
    public Result<Void> updateVersionStatus(@PathVariable Long versionId, @RequestParam Integer status) {
        packageService.updateVersionStatus(versionId, status);
        return Result.ok();
    }

    /**
     * 配置版本灰度发布策略。
     *
     * @param versionId 版本 ID
     * @param request   策略配置
     * @return 操作结果
     */
    @PostMapping("/versions/{versionId}/gray")
    public Result<Void> saveGrayStrategy(@PathVariable Long versionId,
                                         @RequestBody GrayStrategyRequest request) {
        packageService.saveGrayStrategy(versionId, request);
        return Result.ok();
    }

    /**
     * 更新统计：版本分布、事件统计、安装成功率。
     *
     * @return 统计信息
     */
    @GetMapping("/statistics")
    public Result<Map<String, Object>> statistics() {
        return Result.success(packageService.statistics());
    }
}

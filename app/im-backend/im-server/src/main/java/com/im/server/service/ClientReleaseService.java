package com.im.server.service;

import com.im.common.entity.ImClientRelease;
import com.im.common.entity.ImClientReleaseTarget;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 客户端版本发布服务接口：定义版本策略评估、更新事件上报、版本 CRUD 与发布管理契约。
 */
public interface ClientReleaseService {

    /**
     * 评估客户端更新策略，判断当前设备/用户是否可升级及是否强制更新。
     *
     * @param platform 平台（win32、darwin 等）
     * @param arch 架构（x64、arm64 等）
     * @param channel 发布渠道（stable、beta）
     * @param currentVersion 当前客户端版本号
     * @param deviceId 设备唯一标识
     * @param userId 当前登录用户 ID，可为空
     * @return 更新策略响应
     */
    PolicyResponse evaluatePolicy(String platform, String arch, String channel, String currentVersion,
                                  String deviceId, Long userId);

    /**
     * 记录客户端更新事件（检查、下载、安装等）。
     *
     * @param request 更新事件请求
     * @param userId 上报用户 ID，可为空
     */
    void recordEvent(UpdateEventRequest request, Long userId);

    /**
     * 分页查询版本发布记录。
     *
     * @param channel 渠道过滤，可为空
     * @param status 状态过滤，可为空
     * @param page 页码
     * @param pageSize 每页大小
     * @return 分页结果
     */
    ReleasePage page(String channel, String status, int page, int pageSize);

    /**
     * 查询版本发布详情（含定向规则）。
     *
     * @param id 发布记录 ID
     * @return 发布详情
     */
    ReleaseDetail get(Long id);

    /**
     * 保存版本发布草稿或更新已有草稿。
     *
     * @param request 发布请求
     * @param operatorId 操作人 ID
     * @return 保存后的发布详情
     */
    ReleaseDetail save(ReleaseRequest request, Long operatorId);

    /**
     * 发布版本，将草稿/暂停状态转为已发布，并替换同渠道旧版本。
     *
     * @param id 发布记录 ID
     * @param operatorId 操作人 ID
     * @return 发布后的详情
     */
    ReleaseDetail publish(Long id, Long operatorId);

    /**
     * 暂停已发布的版本。
     *
     * @param id 发布记录 ID
     * @return 暂停后的详情
     */
    ReleaseDetail pause(Long id);

    /**
     * 统计指定版本的更新事件数据。
     *
     * @param id 发布记录 ID
     * @return 统计结果（事件列表、下载成功率、安装启动率）
     */
    Map<String, Object> statistics(Long id);

    record PolicyResponse(boolean hasUpdate, String latestVersion, String minimumSupportedVersion,
                          boolean forceUpdate, int rolloutPercentage, String releaseName,
                          List<String> releaseNotes, LocalDateTime publishedAt, String updateBaseUrl,
                          String channel) {}

    record TargetRule(String targetType, String targetValue, String mode) {}

    record ReleaseRequest(Long id, String version, String channel, String platform, String arch,
                          String releaseName, List<String> releaseNotes, String minimumVersion,
                          Boolean forceUpdate, Integer rolloutPercentage, String updateBaseUrl,
                          String installerName, Long installerSize, String installerSha512,
                          List<TargetRule> targets) {}

    record ReleaseDetail(ImClientRelease release, List<ImClientReleaseTarget> targets) {}

    record ReleasePage(List<ImClientRelease> records, long total, int page, int pageSize) {}

    record UpdateEventRequest(String deviceId, String currentVersion, String targetVersion,
                              String eventType, String errorMessage, String platform, String arch,
                              String channel) {}
}


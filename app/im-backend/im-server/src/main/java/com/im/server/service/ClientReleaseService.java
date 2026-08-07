package com.im.server.service;

import com.im.common.entity.ImClientRelease;
import com.im.common.entity.ImClientReleaseTarget;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/** 客户端在线更新的策略、草稿审批、状态转换、审计和统计契约。 */
public interface ClientReleaseService {

    PolicyResponse evaluatePolicy(String platform, String arch, String channel, String currentVersion,
                                  String deviceId, Long userId);

    void recordEvent(UpdateEventRequest request, Long userId);

    ReleasePage page(String channel, String status, int page, int pageSize);

    ReleaseDetail get(Long id);

    /** 仅供受保护的发布流水线幂等创建或刷新草稿。 */
    ReleaseDetail createAutomationDraft(AutomationDraftRequest request);

    /** 管理员仅能更新策略元数据，产物身份字段始终只读。 */
    ReleaseDetail updatePolicy(Long id, PolicyUpdateRequest request, Long operatorId);

    ReleaseDetail publish(Long id, ReleaseActionRequest request, Long operatorId);

    ReleaseDetail pause(Long id, ReleaseActionRequest request, Long operatorId);

    Map<String, Object> statistics(Long id);

    record PolicyResponse(boolean hasUpdate, Long releaseId, String latestVersion,
                          String minimumSupportedVersion, boolean forceUpdate, int rolloutPercentage,
                          String releaseName, List<String> releaseNotes, LocalDateTime publishedAt,
                          String updateBaseUrl, String channel) {}

    record TargetRule(String targetType, String targetValue, String mode) {}

    record AutomationDraftRequest(String version, String channel, String platform, String arch,
                                  String updateBaseUrl, String manifestName, String manifestDigest,
                                  String installerName, Long installerSize, String installerSha512,
                                  String sourceCommit, String signerThumbprint,
                                  OffsetDateTime artifactVerifiedAt) {}

    record PolicyUpdateRequest(String releaseName, List<String> releaseNotes, String minimumVersion,
                               Boolean forceUpdate, Integer rolloutPercentage, List<TargetRule> targets,
                               String reason, String confirmationVersion) {}

    record ReleaseActionRequest(String reason, String confirmationVersion) {}

    record ReleaseDetail(ImClientRelease release, List<ImClientReleaseTarget> targets) {}

    record ReleasePage(List<ImClientRelease> records, long total, int page, int pageSize) {}

    record UpdateEventRequest(Long releaseId, String deviceId, String currentVersion, String targetVersion,
                              String eventType, String errorMessage, String platform, String arch,
                              String channel) {}
}

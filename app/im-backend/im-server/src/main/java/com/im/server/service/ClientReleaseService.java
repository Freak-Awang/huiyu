package com.im.server.service;

import com.im.common.entity.ImClientRelease;
import com.im.common.entity.ImClientReleaseTarget;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public interface ClientReleaseService {
    PolicyResponse evaluatePolicy(String platform, String arch, String channel, String currentVersion,
                                  String deviceId, Long userId);

    void recordEvent(UpdateEventRequest request, Long userId);

    ReleasePage page(String channel, String status, int page, int pageSize);

    ReleaseDetail get(Long id);

    ReleaseDetail save(ReleaseRequest request, Long operatorId);

    ReleaseDetail publish(Long id, Long operatorId);

    ReleaseDetail pause(Long id);

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


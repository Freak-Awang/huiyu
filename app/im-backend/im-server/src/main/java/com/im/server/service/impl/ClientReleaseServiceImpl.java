package com.im.server.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.im.common.entity.ImClientRelease;
import com.im.common.entity.ImClientReleaseTarget;
import com.im.common.entity.ImClientUpdateEvent;
import com.im.common.entity.SysUser;
import com.im.common.exception.BusinessException;
import com.im.server.mapper.ClientReleaseMapper;
import com.im.server.mapper.ClientReleaseTargetMapper;
import com.im.server.mapper.ClientUpdateEventMapper;
import com.im.server.mapper.UserMapper;
import com.im.server.service.ClientReleaseArtifactVerifier;
import com.im.server.service.ClientReleaseService;
import com.im.server.service.ReleaseAuditService;
import com.im.server.service.SemVerUtil;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** Implements the immutable draft -> approved release lifecycle and client rollout policy. */
@Service
public class ClientReleaseServiceImpl implements ClientReleaseService {
    private static final Set<String> CHANNELS = Set.of("stable", "beta");
    private static final Set<String> STATUSES = Set.of("DRAFT", "PUBLISHED", "PAUSED", "REPLACED");
    private static final Set<String> TARGET_TYPES = Set.of("DEVICE", "USER", "DEPT");
    private static final Set<String> TARGET_MODES = Set.of("ALLOW", "DENY");
    private static final Set<String> EVENT_TYPES = Set.of("CHECKED", "CHECK_FAILED", "UPDATE_AVAILABLE",
            "POLICY_MANIFEST_MISMATCH", "DOWNLOAD_STARTED", "DOWNLOAD_SUCCEEDED", "DOWNLOAD_FAILED",
            "INSTALL_REQUESTED", "INSTALL_BLOCKED_POLICY_CHANGED", "VERSION_STARTED");
    private static final Set<String> RELEASE_EVENT_TYPES = Set.of("UPDATE_AVAILABLE", "POLICY_MANIFEST_MISMATCH",
            "DOWNLOAD_STARTED", "DOWNLOAD_SUCCEEDED", "DOWNLOAD_FAILED", "INSTALL_REQUESTED",
            "INSTALL_BLOCKED_POLICY_CHANGED", "VERSION_STARTED");

    private final ClientReleaseMapper releaseMapper;
    private final ClientReleaseTargetMapper targetMapper;
    private final ClientUpdateEventMapper eventMapper;
    private final UserMapper userMapper;
    private final ClientReleaseArtifactVerifier artifactVerifier;
    private final ReleaseAuditService auditService;

    public ClientReleaseServiceImpl(ClientReleaseMapper releaseMapper, ClientReleaseTargetMapper targetMapper,
                                    ClientUpdateEventMapper eventMapper, UserMapper userMapper,
                                    ClientReleaseArtifactVerifier artifactVerifier, ReleaseAuditService auditService) {
        this.releaseMapper = releaseMapper;
        this.targetMapper = targetMapper;
        this.eventMapper = eventMapper;
        this.userMapper = userMapper;
        this.artifactVerifier = artifactVerifier;
        this.auditService = auditService;
    }

    @Override
    public PolicyResponse evaluatePolicy(String platform, String arch, String channel, String currentVersion,
                                         String deviceId, Long userId) {
        requireSemVer(currentVersion, "currentVersion");
        if (!StringUtils.hasText(deviceId) || deviceId.length() > 128) {
            throw new BusinessException(400, "deviceId is required and must not exceed 128 characters");
        }
        String normalizedChannel = normalizeChannel(channel);
        List<ImClientRelease> releases = releaseMapper.selectList(new LambdaQueryWrapper<ImClientRelease>()
                .eq(ImClientRelease::getStatus, "PUBLISHED")
                .eq(ImClientRelease::getChannel, normalizedChannel)
                .eq(ImClientRelease::getPlatform, normalizePlatform(platform))
                .eq(ImClientRelease::getArch, normalizeArch(arch)));
        ImClientRelease release = releases.stream()
                .max((left, right) -> SemVerUtil.compare(left.getVersion(), right.getVersion()))
                .orElse(null);
        if (release == null || SemVerUtil.compare(release.getVersion(), currentVersion) <= 0) {
            return noUpdate(normalizedChannel);
        }

        List<ImClientReleaseTarget> targets = targets(release.getId());
        SysUser user = userId == null ? null : userMapper.selectById(userId);
        if (user == null && targets.stream().anyMatch(target ->
                "USER".equals(target.getTargetType()) || "DEPT".equals(target.getTargetType()))) {
            return noUpdate(normalizedChannel);
        }
        if (matches(targets, "DENY", deviceId, user)) return noUpdate(normalizedChannel);

        boolean belowMinimum = StringUtils.hasText(release.getMinimumVersion())
                && SemVerUtil.compare(currentVersion, release.getMinimumVersion()) < 0;
        boolean force = Boolean.TRUE.equals(release.getForceUpdate()) || belowMinimum;
        boolean explicitlyAllowed = matches(targets, "ALLOW", deviceId, user);
        int rollout = release.getRolloutPercentage() == null ? 100 : release.getRolloutPercentage();
        boolean eligible = force || explicitlyAllowed || rolloutBucket(deviceId, release.getVersion()) < rollout;
        if (!eligible) return noUpdate(normalizedChannel);

        return new PolicyResponse(true, release.getId(), release.getVersion(), release.getMinimumVersion(), force,
                rollout, release.getReleaseName(), splitNotes(release.getReleaseNotes()), release.getPublishedAt(),
                release.getUpdateBaseUrl(), normalizedChannel);
    }

    @Override
    public void recordEvent(UpdateEventRequest request, Long userId) {
        String eventType = request == null ? "" : normalize(request.eventType());
        if (!EVENT_TYPES.contains(eventType)) throw new BusinessException(400, "Unsupported update event type");
        if (!StringUtils.hasText(request.deviceId()) || request.deviceId().length() > 128) {
            throw new BusinessException(400, "Invalid deviceId");
        }
        ImClientRelease release = request.releaseId() == null ? null : releaseMapper.selectById(request.releaseId());
        if (RELEASE_EVENT_TYPES.contains(eventType) && release == null) {
            throw new BusinessException(400, "releaseId is required for this event type");
        }
        if (release != null && (!Objects.equals(release.getVersion(), request.targetVersion())
                || !Objects.equals(release.getChannel(), normalizeChannel(request.channel()))
                || !Objects.equals(release.getPlatform(), normalizePlatform(request.platform()))
                || !Objects.equals(release.getArch(), normalizeArch(request.arch())))) {
            throw new BusinessException(400, "Update event does not match its release record");
        }
        ImClientUpdateEvent event = new ImClientUpdateEvent();
        event.setUserId(userId);
        event.setReleaseId(release == null ? null : release.getId());
        event.setDeviceId(request.deviceId());
        event.setCurrentVersion(trim(request.currentVersion(), 32));
        event.setTargetVersion(trim(request.targetVersion(), 32));
        event.setEventType(eventType);
        event.setErrorMessage(trim(request.errorMessage(), 1000));
        event.setPlatform(normalizePlatform(request.platform()));
        event.setArch(normalizeArch(request.arch()));
        event.setChannel(normalizeChannel(request.channel()));
        event.setCreateTime(LocalDateTime.now());
        eventMapper.insert(event);
    }

    @Override
    public ReleasePage page(String channel, String status, int page, int pageSize) {
        LambdaQueryWrapper<ImClientRelease> query = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(channel)) query.eq(ImClientRelease::getChannel, normalizeChannel(channel));
        if (StringUtils.hasText(status)) {
            String normalizedStatus = normalize(status);
            if (!STATUSES.contains(normalizedStatus)) throw new BusinessException(400, "Invalid release status");
            query.eq(ImClientRelease::getStatus, normalizedStatus);
        }
        query.orderByDesc(ImClientRelease::getCreateTime);
        int safePage = Math.max(1, page);
        int safeSize = Math.min(100, Math.max(1, pageSize));
        Page<ImClientRelease> result = releaseMapper.selectPage(new Page<>(safePage, safeSize), query);
        return new ReleasePage(result.getRecords(), result.getTotal(), safePage, safeSize);
    }

    @Override
    public ReleaseDetail get(Long id) {
        ImClientRelease release = releaseMapper.selectById(id);
        if (release == null) throw new BusinessException(404, "Client release not found");
        return new ReleaseDetail(release, targets(id));
    }

    @Override
    @Transactional
    public ReleaseDetail createAutomationDraft(AutomationDraftRequest request) {
        DraftValues values = validateDraft(request);
        ImClientRelease existing = releaseMapper.selectOne(new LambdaQueryWrapper<ImClientRelease>()
                .eq(ImClientRelease::getVersion, values.version())
                .eq(ImClientRelease::getChannel, values.channel())
                .eq(ImClientRelease::getPlatform, values.platform())
                .eq(ImClientRelease::getArch, values.arch()));
        if (existing != null) {
            assertSameArtifacts(existing, values);
            if ("DRAFT".equals(existing.getStatus())) {
                existing.setArtifactVerifiedAt(values.verifiedAt());
                existing.setUpdateTime(LocalDateTime.now());
                releaseMapper.updateById(existing);
            }
            return get(existing.getId());
        }

        ImClientRelease release = new ImClientRelease();
        release.setVersion(values.version());
        release.setChannel(values.channel());
        release.setPlatform(values.platform());
        release.setArch(values.arch());
        release.setReleaseName("ArtTalk " + values.version());
        release.setForceUpdate(false);
        release.setRolloutPercentage(0);
        release.setUpdateBaseUrl(values.baseUrl());
        release.setManifestName(values.manifestName());
        release.setManifestDigest(values.manifestDigest());
        release.setInstallerName(values.installerName());
        release.setInstallerSize(values.installerSize());
        release.setInstallerSha512(values.installerSha512());
        release.setSourceCommit(values.sourceCommit());
        release.setSignerThumbprint(values.signerThumbprint());
        release.setArtifactVerifiedAt(values.verifiedAt());
        release.setStatus("DRAFT");
        release.setCreateTime(LocalDateTime.now());
        release.setUpdateTime(LocalDateTime.now());
        releaseMapper.insert(release);
        auditService.record(release.getId(), "DRAFT_CREATED", "release pipeline import", null,
                "sourceCommit=" + release.getSourceCommit() + ", manifestDigest=" + release.getManifestDigest());
        return get(release.getId());
    }

    @Override
    @Transactional
    public ReleaseDetail updatePolicy(Long id, PolicyUpdateRequest request, Long operatorId) {
        if (request == null) throw new BusinessException(400, "Policy payload is required");
        ImClientRelease release = get(id).release();
        if ("REPLACED".equals(release.getStatus())) throw new BusinessException(409, "Replaced releases are read-only");
        String reason = requireReason(request.reason());
        if (!StringUtils.hasText(request.releaseName()) || request.releaseName().length() > 128) {
            throw new BusinessException(400, "releaseName is required and must not exceed 128 characters");
        }
        String minimumVersion = blankToNull(request.minimumVersion());
        if (minimumVersion != null) {
            requireSemVer(minimumVersion, "minimumVersion");
            if (SemVerUtil.compare(minimumVersion, release.getVersion()) > 0) {
                throw new BusinessException(400, "minimumVersion must not exceed release version");
            }
        }
        int rollout = request.rolloutPercentage() == null
                ? (release.getRolloutPercentage() == null ? 100 : release.getRolloutPercentage())
                : request.rolloutPercentage();
        if (rollout < 0 || rollout > 100) throw new BusinessException(400, "rolloutPercentage must be between 0 and 100");
        boolean forceUpdate = Boolean.TRUE.equals(request.forceUpdate());
        if (forceUpdate || minimumVersion != null) requireVersionConfirmation(release, request.confirmationVersion());
        validateTargets(request.targets());

        release.setReleaseName(request.releaseName().trim());
        release.setReleaseNotes(joinNotes(request.releaseNotes()));
        release.setMinimumVersion(minimumVersion);
        release.setForceUpdate(forceUpdate);
        release.setRolloutPercentage(rollout);
        release.setUpdateTime(LocalDateTime.now());
        releaseMapper.updateById(release);
        replaceTargets(release.getId(), request.targets());
        auditService.record(id, "POLICY_UPDATED", reason, operatorId,
                "rollout=" + rollout + ", forceUpdate=" + forceUpdate);
        return get(id);
    }

    @Override
    @Transactional
    public ReleaseDetail publish(Long id, ReleaseActionRequest request, Long operatorId) {
        String reason = requireReason(request == null ? null : request.reason());
        ImClientRelease release = get(id).release();
        if (!"DRAFT".equals(release.getStatus()) && !"PAUSED".equals(release.getStatus())) {
            throw new BusinessException(409, "Only draft or paused releases can be published");
        }
        if (Boolean.TRUE.equals(release.getForceUpdate()) || StringUtils.hasText(release.getMinimumVersion())) {
            requireVersionConfirmation(release, request.confirmationVersion());
        }
        LocalDateTime verifiedAt;
        try {
            verifiedAt = artifactVerifier.verify(release);
        } catch (RuntimeException exception) {
            auditService.recordFailure(id, "ARTIFACT_VERIFICATION_FAILED", reason, operatorId,
                    trim(exception.getMessage(), 1000));
            throw exception;
        }

        List<ImClientRelease> scope = releaseMapper.lockReleaseScope(
                release.getChannel(), release.getPlatform(), release.getArch());
        release = scope.stream().filter(item -> Objects.equals(item.getId(), id)).findFirst().orElse(releaseMapper.selectById(id));
        if (!"DRAFT".equals(release.getStatus()) && !"PAUSED".equals(release.getStatus())) {
            throw new BusinessException(409, "Release state changed while it was being verified");
        }
        for (ImClientRelease prior : scope) {
            if (!"PUBLISHED".equals(prior.getStatus()) || Objects.equals(prior.getId(), release.getId())) continue;
            if (SemVerUtil.compare(release.getVersion(), prior.getVersion()) <= 0) {
                throw new BusinessException(409, "Published version must be higher than the current release");
            }
            prior.setStatus("REPLACED");
            prior.setUpdateTime(LocalDateTime.now());
            releaseMapper.updateById(prior);
            auditService.record(prior.getId(), "REPLACED", reason, operatorId,
                    "replacedByReleaseId=" + release.getId());
        }
        release.setArtifactVerifiedAt(verifiedAt);
        release.setStatus("PUBLISHED");
        release.setPublishedAt(LocalDateTime.now());
        release.setUpdateTime(LocalDateTime.now());
        releaseMapper.updateById(release);
        auditService.record(id, "PUBLISHED", reason, operatorId, "artifactVerifiedAt=" + verifiedAt);
        return get(id);
    }

    @Override
    @Transactional
    public ReleaseDetail pause(Long id, ReleaseActionRequest request, Long operatorId) {
        String reason = requireReason(request == null ? null : request.reason());
        ImClientRelease release = get(id).release();
        if (!"PUBLISHED".equals(release.getStatus())) {
            throw new BusinessException(409, "Only published releases can be paused");
        }
        release.setStatus("PAUSED");
        release.setUpdateTime(LocalDateTime.now());
        releaseMapper.updateById(release);
        auditService.record(id, "PAUSED", reason, operatorId, null);
        return get(id);
    }

    @Override
    public Map<String, Object> statistics(Long id) {
        ImClientRelease release = get(id).release();
        List<Map<String, Object>> rows = eventMapper.summarize(id);
        Map<String, Object> result = new HashMap<>();
        result.put("releaseId", id);
        result.put("version", release.getVersion());
        result.put("channel", release.getChannel());
        result.put("events", rows);
        long started = deviceCount(rows, "DOWNLOAD_STARTED");
        long downloaded = deviceCount(rows, "DOWNLOAD_SUCCEEDED");
        long installed = deviceCount(rows, "VERSION_STARTED");
        result.put("downloadSuccessRate", started == 0 ? 0 : downloaded * 100.0 / started);
        result.put("installStartRate", downloaded == 0 ? 0 : installed * 100.0 / downloaded);
        return result;
    }

    private DraftValues validateDraft(AutomationDraftRequest request) {
        if (request == null) throw new BusinessException(400, "Release draft payload is required");
        requireSemVer(request.version(), "version");
        String version = request.version().trim();
        String channel = normalizeChannel(request.channel());
        if (channel.equals("stable") && version.contains("-")) throw new BusinessException(400, "Stable version cannot be a prerelease");
        if (channel.equals("beta") && !version.matches(".*-beta(?:\\.|$).*$")) throw new BusinessException(400, "Beta version must use a beta identifier");
        String platform = normalizePlatform(request.platform());
        String arch = normalizeArch(request.arch());
        if (!"win32".equals(platform) || !"x64".equals(arch)) throw new BusinessException(400, "Only win32/x64 is supported by this pipeline");
        String baseUrl = normalizeBaseUrl(request.updateBaseUrl(), channel, version);
        String manifestName = channel.equals("beta") ? "beta.yml" : "latest.yml";
        if (!manifestName.equals(request.manifestName())) throw new BusinessException(400, "Unexpected manifest name");
        if (!StringUtils.hasText(request.manifestDigest()) || !request.manifestDigest().matches("(?i)^[0-9a-f]{64}$")) {
            throw new BusinessException(400, "manifestDigest must be a SHA-256 hex digest");
        }
        String expectedInstaller = "ArtTalk-Setup-" + version + "-x64.exe";
        if (!expectedInstaller.equals(request.installerName())) throw new BusinessException(400, "Unexpected installer name");
        if (request.installerSize() == null || request.installerSize() <= 0) throw new BusinessException(400, "installerSize must be positive");
        if (!StringUtils.hasText(request.installerSha512()) || !request.installerSha512().matches("[A-Za-z0-9+/]{86}==")) {
            throw new BusinessException(400, "installerSha512 must be a base64 SHA-512 digest");
        }
        if (!StringUtils.hasText(request.sourceCommit()) || !request.sourceCommit().matches("(?i)^[0-9a-f]{40}$")) {
            throw new BusinessException(400, "sourceCommit must be a full Git SHA");
        }
        if (!StringUtils.hasText(request.signerThumbprint()) || !request.signerThumbprint().matches("(?i)^[0-9a-f]{40,64}$")) {
            throw new BusinessException(400, "signerThumbprint is invalid");
        }
        if (request.artifactVerifiedAt() == null) throw new BusinessException(400, "artifactVerifiedAt is required");
        LocalDateTime verifiedAt = request.artifactVerifiedAt().atZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime();
        LocalDateTime now = LocalDateTime.now();
        if (verifiedAt.isBefore(now.minusHours(24)) || verifiedAt.isAfter(now.plusMinutes(5))) {
            throw new BusinessException(400, "artifactVerifiedAt is outside the accepted window");
        }
        return new DraftValues(version, channel, platform, arch, baseUrl, manifestName,
                request.manifestDigest().toLowerCase(Locale.ROOT), expectedInstaller, request.installerSize(),
                request.installerSha512(), request.sourceCommit().toLowerCase(Locale.ROOT),
                request.signerThumbprint().toUpperCase(Locale.ROOT), verifiedAt);
    }

    private void assertSameArtifacts(ImClientRelease release, DraftValues values) {
        boolean same = Objects.equals(release.getUpdateBaseUrl(), values.baseUrl())
                && Objects.equals(release.getManifestName(), values.manifestName())
                && Objects.equals(release.getManifestDigest(), values.manifestDigest())
                && Objects.equals(release.getInstallerName(), values.installerName())
                && Objects.equals(release.getInstallerSize(), values.installerSize())
                && Objects.equals(release.getInstallerSha512(), values.installerSha512())
                && Objects.equals(release.getSourceCommit(), values.sourceCommit())
                && Objects.equals(release.getSignerThumbprint(), values.signerThumbprint());
        if (!same) throw new BusinessException(409, "Release version already exists with different immutable artifacts");
    }

    private String normalizeBaseUrl(String value, String channel, String version) {
        if (!StringUtils.hasText(value)) throw new BusinessException(400, "updateBaseUrl is required");
        try {
            URI uri = URI.create(value.trim());
            String host = uri.getHost();
            boolean loopback = "http".equalsIgnoreCase(uri.getScheme())
                    && ("localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host) || "::1".equals(host));
            String expectedPath = "/downloads/arttalk/" + channel + "/" + version + "/win-x64/";
            if (host == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
                    || (!"https".equalsIgnoreCase(uri.getScheme()) && !loopback)
                    || !expectedPath.equals(uri.getPath())) {
                throw new IllegalArgumentException();
            }
            return uri.toString();
        } catch (Exception exception) {
            throw new BusinessException(400, "updateBaseUrl must use the immutable HTTPS release path");
        }
    }

    private void validateTargets(List<TargetRule> rules) {
        if (rules == null) return;
        if (rules.size() > 1000) throw new BusinessException(400, "Too many target rules");
        for (TargetRule rule : rules) {
            String type = normalize(rule.targetType());
            String mode = normalize(rule.mode());
            if (!TARGET_TYPES.contains(type) || !TARGET_MODES.contains(mode)
                    || !StringUtils.hasText(rule.targetValue()) || rule.targetValue().length() > 128) {
                throw new BusinessException(400, "Invalid release target rule");
            }
        }
    }

    private void replaceTargets(Long releaseId, List<TargetRule> rules) {
        targetMapper.delete(new LambdaQueryWrapper<ImClientReleaseTarget>()
                .eq(ImClientReleaseTarget::getReleaseId, releaseId));
        if (rules == null) return;
        for (TargetRule rule : rules) {
            ImClientReleaseTarget target = new ImClientReleaseTarget();
            target.setReleaseId(releaseId);
            target.setTargetType(normalize(rule.targetType()));
            target.setTargetValue(rule.targetValue().trim());
            target.setMode(normalize(rule.mode()));
            target.setCreateTime(LocalDateTime.now());
            targetMapper.insert(target);
        }
    }

    private void requireVersionConfirmation(ImClientRelease release, String confirmationVersion) {
        if (!release.getVersion().equals(confirmationVersion)) {
            throw new BusinessException(400, "confirmationVersion must match the release version");
        }
    }

    private String requireReason(String value) {
        if (!StringUtils.hasText(value) || value.trim().length() > 500) {
            throw new BusinessException(400, "A reason of at most 500 characters is required");
        }
        return value.trim();
    }

    private boolean matches(List<ImClientReleaseTarget> targets, String mode, String deviceId, SysUser user) {
        for (ImClientReleaseTarget target : targets) {
            if (!mode.equals(target.getMode())) continue;
            if ("DEVICE".equals(target.getTargetType()) && target.getTargetValue().equals(deviceId)) return true;
            if (user != null && "USER".equals(target.getTargetType())
                    && target.getTargetValue().equals(String.valueOf(user.getId()))) return true;
            if (user != null && user.getDeptId() != null && "DEPT".equals(target.getTargetType())
                    && target.getTargetValue().equals(String.valueOf(user.getDeptId()))) return true;
        }
        return false;
    }

    private int rolloutBucket(String deviceId, String version) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest((deviceId + ":" + version).getBytes(StandardCharsets.UTF_8));
            return (int) (Integer.toUnsignedLong(ByteBuffer.wrap(digest).getInt()) % 100);
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private List<ImClientReleaseTarget> targets(Long releaseId) {
        List<ImClientReleaseTarget> values = targetMapper.selectList(new LambdaQueryWrapper<ImClientReleaseTarget>()
                .eq(ImClientReleaseTarget::getReleaseId, releaseId));
        return values == null ? List.of() : values;
    }

    private PolicyResponse noUpdate(String channel) {
        return new PolicyResponse(false, null, null, null, false, 0, null, List.of(), null, null, channel);
    }

    private long deviceCount(List<Map<String, Object>> rows, String eventType) {
        return rows.stream().filter(row -> eventType.equals(row.get("eventType")))
                .map(row -> ((Number) row.get("deviceCount")).longValue()).findFirst().orElse(0L);
    }

    private void requireSemVer(String value, String field) {
        if (!SemVerUtil.isValid(value)) throw new BusinessException(400, field + " must be a valid semantic version");
    }

    private String normalizeChannel(String value) {
        String normalized = StringUtils.hasText(value) ? value.trim().toLowerCase(Locale.ROOT) : "stable";
        if (!CHANNELS.contains(normalized)) throw new BusinessException(400, "channel must be stable or beta");
        return normalized;
    }

    private String normalizePlatform(String value) {
        return StringUtils.hasText(value) ? value.trim().toLowerCase(Locale.ROOT) : "win32";
    }

    private String normalizeArch(String value) {
        return StringUtils.hasText(value) ? value.trim().toLowerCase(Locale.ROOT) : "x64";
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
    }

    private String blankToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private String trim(String value, int length) {
        if (value == null) return null;
        return value.length() <= length ? value : value.substring(0, length);
    }

    private String joinNotes(List<String> notes) {
        if (notes == null) return null;
        List<String> clean = notes.stream().filter(StringUtils::hasText).map(String::trim).toList();
        return clean.isEmpty() ? null : String.join("\n", clean);
    }

    private List<String> splitNotes(String notes) {
        if (!StringUtils.hasText(notes)) return List.of();
        return new ArrayList<>(List.of(notes.split("\\R")));
    }

    private record DraftValues(String version, String channel, String platform, String arch, String baseUrl,
                               String manifestName, String manifestDigest, String installerName, Long installerSize,
                               String installerSha512, String sourceCommit, String signerThumbprint,
                               LocalDateTime verifiedAt) {}
}

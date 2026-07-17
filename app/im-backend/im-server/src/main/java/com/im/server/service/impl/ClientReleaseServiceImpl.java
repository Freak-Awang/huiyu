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
import com.im.server.service.ClientReleaseService;
import com.im.server.service.SemVerUtil;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class ClientReleaseServiceImpl implements ClientReleaseService {
    private static final Set<String> CHANNELS = Set.of("stable", "beta");
    private static final Set<String> STATUSES = Set.of("DRAFT", "PUBLISHED", "PAUSED", "REPLACED");
    private static final Set<String> TARGET_TYPES = Set.of("DEVICE", "USER", "DEPT");
    private static final Set<String> TARGET_MODES = Set.of("ALLOW", "DENY");
    private static final Set<String> EVENT_TYPES = Set.of("CHECKED", "CHECK_FAILED", "UPDATE_AVAILABLE",
            "DOWNLOAD_STARTED", "DOWNLOAD_SUCCEEDED", "DOWNLOAD_FAILED", "INSTALL_REQUESTED", "VERSION_STARTED");

    private final ClientReleaseMapper releaseMapper;
    private final ClientReleaseTargetMapper targetMapper;
    private final ClientUpdateEventMapper eventMapper;
    private final UserMapper userMapper;

    public ClientReleaseServiceImpl(ClientReleaseMapper releaseMapper, ClientReleaseTargetMapper targetMapper,
                                    ClientUpdateEventMapper eventMapper, UserMapper userMapper) {
        this.releaseMapper = releaseMapper;
        this.targetMapper = targetMapper;
        this.eventMapper = eventMapper;
        this.userMapper = userMapper;
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
                .max((a, b) -> SemVerUtil.compare(a.getVersion(), b.getVersion()))
                .orElse(null);
        if (release == null || SemVerUtil.compare(release.getVersion(), currentVersion) <= 0) {
            return noUpdate(normalizedChannel);
        }

        SysUser user = userId == null ? null : userMapper.selectById(userId);
        List<ImClientReleaseTarget> targets = targets(release.getId());
        if (matches(targets, "DENY", deviceId, user)) return noUpdate(normalizedChannel);

        boolean belowMinimum = StringUtils.hasText(release.getMinimumVersion())
                && SemVerUtil.compare(currentVersion, release.getMinimumVersion()) < 0;
        boolean force = Boolean.TRUE.equals(release.getForceUpdate()) || belowMinimum;
        boolean explicitlyAllowed = matches(targets, "ALLOW", deviceId, user);
        int rollout = release.getRolloutPercentage() == null ? 100 : release.getRolloutPercentage();
        boolean eligible = force || explicitlyAllowed || rolloutBucket(deviceId, release.getVersion()) < rollout;
        if (!eligible) return noUpdate(normalizedChannel);

        return new PolicyResponse(true, release.getVersion(), release.getMinimumVersion(), force, rollout,
                release.getReleaseName(), splitNotes(release.getReleaseNotes()), release.getPublishedAt(),
                release.getUpdateBaseUrl(), normalizedChannel);
    }

    @Override
    public void recordEvent(UpdateEventRequest request, Long userId) {
        if (request == null || !EVENT_TYPES.contains(normalize(request.eventType()))) {
            throw new BusinessException(400, "Unsupported update event type");
        }
        if (!StringUtils.hasText(request.deviceId()) || request.deviceId().length() > 128) {
            throw new BusinessException(400, "Invalid deviceId");
        }
        ImClientUpdateEvent event = new ImClientUpdateEvent();
        event.setUserId(userId);
        event.setDeviceId(request.deviceId());
        event.setCurrentVersion(trim(request.currentVersion(), 32));
        event.setTargetVersion(trim(request.targetVersion(), 32));
        event.setEventType(normalize(request.eventType()));
        event.setErrorMessage(trim(request.errorMessage(), 1000));
        event.setPlatform(trim(request.platform(), 16));
        event.setArch(trim(request.arch(), 16));
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
    public ReleaseDetail save(ReleaseRequest request, Long operatorId) {
        if (request == null) throw new BusinessException(400, "Release payload is required");
        validateRequest(request);
        ImClientRelease release = request.id() == null ? new ImClientRelease() : releaseMapper.selectById(request.id());
        if (release == null) throw new BusinessException(404, "Client release not found");
        boolean artifactsImmutable = release.getStatus() != null && !"DRAFT".equals(release.getStatus());
        if (!artifactsImmutable) {
            release.setVersion(request.version().trim());
            release.setChannel(normalizeChannel(request.channel()));
            release.setPlatform(normalizePlatform(request.platform()));
            release.setArch(normalizeArch(request.arch()));
            release.setUpdateBaseUrl(normalizeBaseUrl(request.updateBaseUrl()));
            release.setInstallerName(request.installerName().trim());
            release.setInstallerSize(request.installerSize());
            release.setInstallerSha512(request.installerSha512().trim());
        }
        release.setReleaseName(request.releaseName().trim());
        release.setReleaseNotes(joinNotes(request.releaseNotes()));
        release.setMinimumVersion(blankToNull(request.minimumVersion()));
        release.setForceUpdate(Boolean.TRUE.equals(request.forceUpdate()));
        release.setRolloutPercentage(request.rolloutPercentage() == null ? 100 : request.rolloutPercentage());
        release.setUpdateTime(LocalDateTime.now());
        if (release.getId() == null) {
            release.setStatus("DRAFT");
            release.setCreatedBy(operatorId);
            release.setCreateTime(LocalDateTime.now());
            releaseMapper.insert(release);
        } else {
            releaseMapper.updateById(release);
        }
        replaceTargets(release.getId(), request.targets());
        return get(release.getId());
    }

    @Override
    @Transactional
    public ReleaseDetail publish(Long id, Long operatorId) {
        ImClientRelease release = get(id).release();
        if (!"DRAFT".equals(release.getStatus()) && !"PAUSED".equals(release.getStatus())) {
            throw new BusinessException(409, "Only draft or paused releases can be published");
        }
        List<ImClientRelease> active = releaseMapper.selectList(new LambdaQueryWrapper<ImClientRelease>()
                .eq(ImClientRelease::getStatus, "PUBLISHED")
                .eq(ImClientRelease::getChannel, release.getChannel())
                .eq(ImClientRelease::getPlatform, release.getPlatform())
                .eq(ImClientRelease::getArch, release.getArch()));
        for (ImClientRelease prior : active) {
            if (SemVerUtil.compare(release.getVersion(), prior.getVersion()) <= 0) {
                throw new BusinessException(409, "Published version must be higher than the current release");
            }
            prior.setStatus("REPLACED");
            prior.setUpdateTime(LocalDateTime.now());
            releaseMapper.updateById(prior);
        }
        release.setStatus("PUBLISHED");
        release.setPublishedAt(LocalDateTime.now());
        release.setCreatedBy(release.getCreatedBy() == null ? operatorId : release.getCreatedBy());
        release.setUpdateTime(LocalDateTime.now());
        releaseMapper.updateById(release);
        return get(id);
    }

    @Override
    public ReleaseDetail pause(Long id) {
        ImClientRelease release = get(id).release();
        if (!"PUBLISHED".equals(release.getStatus())) throw new BusinessException(409, "Only published releases can be paused");
        release.setStatus("PAUSED");
        release.setUpdateTime(LocalDateTime.now());
        releaseMapper.updateById(release);
        return get(id);
    }

    @Override
    public Map<String, Object> statistics(Long id) {
        ImClientRelease release = get(id).release();
        List<Map<String, Object>> rows = eventMapper.summarize(release.getVersion(), release.getChannel());
        Map<String, Object> result = new HashMap<>();
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

    private void validateRequest(ReleaseRequest request) {
        requireSemVer(request.version(), "version");
        normalizeChannel(request.channel());
        if (!StringUtils.hasText(request.releaseName()) || request.releaseName().length() > 128) {
            throw new BusinessException(400, "releaseName is required and must not exceed 128 characters");
        }
        if (StringUtils.hasText(request.minimumVersion())) {
            requireSemVer(request.minimumVersion(), "minimumVersion");
            if (SemVerUtil.compare(request.minimumVersion(), request.version()) > 0) {
                throw new BusinessException(400, "minimumVersion must not exceed version");
            }
        }
        int rollout = request.rolloutPercentage() == null ? 100 : request.rolloutPercentage();
        if (rollout < 0 || rollout > 100) throw new BusinessException(400, "rolloutPercentage must be between 0 and 100");
        normalizeBaseUrl(request.updateBaseUrl());
        if (!StringUtils.hasText(request.installerName()) || !request.installerName().toLowerCase(Locale.ROOT).endsWith(".exe")) {
            throw new BusinessException(400, "installerName must be an .exe file");
        }
        if (!StringUtils.hasText(request.installerSha512()) || request.installerSha512().length() > 256) {
            throw new BusinessException(400, "installerSha512 is required");
        }
    }

    private void replaceTargets(Long releaseId, List<TargetRule> rules) {
        targetMapper.delete(new LambdaQueryWrapper<ImClientReleaseTarget>().eq(ImClientReleaseTarget::getReleaseId, releaseId));
        if (rules == null) return;
        for (TargetRule rule : rules) {
            String type = normalize(rule.targetType());
            String mode = normalize(rule.mode());
            if (!TARGET_TYPES.contains(type) || !TARGET_MODES.contains(mode) || !StringUtils.hasText(rule.targetValue())) {
                throw new BusinessException(400, "Invalid release target rule");
            }
            ImClientReleaseTarget target = new ImClientReleaseTarget();
            target.setReleaseId(releaseId);
            target.setTargetType(type);
            target.setTargetValue(rule.targetValue().trim());
            target.setMode(mode);
            target.setCreateTime(LocalDateTime.now());
            targetMapper.insert(target);
        }
    }

    private boolean matches(List<ImClientReleaseTarget> targets, String mode, String deviceId, SysUser user) {
        for (ImClientReleaseTarget target : targets) {
            if (!mode.equals(target.getMode())) continue;
            if ("DEVICE".equals(target.getTargetType()) && target.getTargetValue().equals(deviceId)) return true;
            if (user != null && "USER".equals(target.getTargetType()) && target.getTargetValue().equals(String.valueOf(user.getId()))) return true;
            if (user != null && user.getDeptId() != null && "DEPT".equals(target.getTargetType())
                    && target.getTargetValue().equals(String.valueOf(user.getDeptId()))) return true;
        }
        return false;
    }

    private int rolloutBucket(String deviceId, String version) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest((deviceId + ":" + version).getBytes(StandardCharsets.UTF_8));
            long unsigned = Integer.toUnsignedLong(ByteBuffer.wrap(digest).getInt());
            return (int) (unsigned % 100);
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }

    private List<ImClientReleaseTarget> targets(Long releaseId) {
        return targetMapper.selectList(new LambdaQueryWrapper<ImClientReleaseTarget>()
                .eq(ImClientReleaseTarget::getReleaseId, releaseId));
    }

    private PolicyResponse noUpdate(String channel) {
        return new PolicyResponse(false, null, null, false, 0, null, List.of(), null, null, channel);
    }

    private long deviceCount(List<Map<String, Object>> rows, String eventType) {
        return rows.stream().filter(row -> eventType.equals(row.get("eventType")))
                .map(row -> ((Number) row.get("deviceCount")).longValue()).findFirst().orElse(0L);
    }

    private void requireSemVer(String value, String field) {
        if (!SemVerUtil.isValid(value)) throw new BusinessException(400, field + " must be a valid semantic version");
    }

    private String normalizeBaseUrl(String value) {
        if (!StringUtils.hasText(value)) throw new BusinessException(400, "updateBaseUrl is required");
        try {
            URI uri = URI.create(value.trim());
            if (!("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme())) || uri.getHost() == null) {
                throw new IllegalArgumentException();
            }
            return value.trim().endsWith("/") ? value.trim() : value.trim() + "/";
        } catch (Exception e) {
            throw new BusinessException(400, "updateBaseUrl must be an HTTP(S) URL");
        }
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
}

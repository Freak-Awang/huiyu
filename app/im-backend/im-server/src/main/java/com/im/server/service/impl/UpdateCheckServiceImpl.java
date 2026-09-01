package com.im.server.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.common.dto.update.UpdateCheckResponse;
import com.im.common.dto.update.UpdateReportRequest;
import com.im.common.entity.AppVersion;
import com.im.common.entity.ClientUpdateEvent;
import com.im.common.entity.DeviceVersion;
import com.im.common.entity.GrayStrategy;
import com.im.common.entity.UpdatePackage;
import com.im.common.exception.BusinessException;
import com.im.server.config.UpdateServerProperties;
import com.im.server.mapper.AppVersionMapper;
import com.im.server.mapper.ClientUpdateEventMapper;
import com.im.server.mapper.DeviceVersionMapper;
import com.im.server.mapper.GrayStrategyMapper;
import com.im.server.mapper.UpdatePackageMapper;
import com.im.server.service.UpdateCheckService;
import com.im.server.util.VersionComparator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Collections;
import java.util.List;

/**
 * 客户端更新检查服务实现。
 * <p>
 * 检查流程：查询渠道最新发布版本 → 版本号比较 → 灰度命中检查 →
 * 判定更新类型（强制/增量/全量）→ 选择最优更新包 → 记录设备与遥测。
 * </p>
 */
@Service
public class UpdateCheckServiceImpl implements UpdateCheckService {

    private static final Logger log = LoggerFactory.getLogger(UpdateCheckServiceImpl.class);
    private static final String DEFAULT_CHANNEL = "stable";

    @Autowired
    private AppVersionMapper versionMapper;
    @Autowired
    private UpdatePackageMapper packageMapper;
    @Autowired
    private GrayStrategyMapper grayMapper;
    @Autowired
    private DeviceVersionMapper deviceMapper;
    @Autowired
    private ClientUpdateEventMapper eventMapper;
    @Autowired
    private UpdateServerProperties properties;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public UpdateCheckResponse check(String clientVersion, Integer clientBuild, String deviceId,
                                     String channel, boolean supportPatch, Long userId) {
        if (!StringUtils.hasText(deviceId) || deviceId.length() > 64) {
            throw new BusinessException("设备标识缺失或非法");
        }
        if (!StringUtils.hasText(clientVersion)) {
            throw new BusinessException("客户端版本号缺失");
        }
        String normalizedChannel = StringUtils.hasText(channel) ? channel : DEFAULT_CHANNEL;
        int build = clientBuild != null ? clientBuild : 0;

        // 防刷：单设备检测小于最小间隔时直接返回无更新（不刷新检查时间，默认 0 不启用）
        if (isRateLimited(deviceId)) {
            return UpdateCheckResponse.noUpdate();
        }

        // 1. 查询该渠道最新发布版本
        AppVersion latest = versionMapper.selectOne(new LambdaQueryWrapper<AppVersion>()
                .eq(AppVersion::getChannel, normalizedChannel)
                .eq(AppVersion::getStatus, AppVersion.STATUS_PUBLISHED)
                .orderByDesc(AppVersion::getBuildNumber)
                .orderByDesc(AppVersion::getId)
                .last("LIMIT 1"));

        // 记录设备检查行为（无论是否有更新）
        touchDevice(deviceId, clientVersion, build, normalizedChannel);

        if (latest == null) {
            return UpdateCheckResponse.noUpdate();
        }

        // 2. 版本号比较（版本一致时比较构建号）
        int compare = VersionComparator.compare(clientVersion, latest.getVersion());
        if (compare > 0 || (compare == 0 && build >= latest.getBuildNumber())) {
            return UpdateCheckResponse.noUpdate();
        }

        // 3. 灰度发布检查
        GrayStrategy strategy = findActiveStrategy(latest.getId());
        if (!isDeviceInRollout(deviceId, strategy)) {
            log.info("Device {} not in rollout of version {}", deviceId, latest.getVersion());
            return UpdateCheckResponse.noUpdate();
        }

        // 4. 判定更新类型：强制 > 增量 > 全量
        String updateType = determineUpdateType(clientVersion, latest, supportPatch);

        // 5. 查找最优更新包：优先增量补丁，否则全量包
        UpdatePackage bestPackage = findBestPackage(clientVersion, latest, updateType);

        // 6. 记录检查事件
        recordEvent(deviceId, userId, clientVersion, latest.getVersion(), "check", null, normalizedChannel);

        return buildResponse(latest, updateType, bestPackage, strategy);
    }

    @Override
    public void recordUpdateResult(UpdateReportRequest request, Long userId) {
        if (request == null || !StringUtils.hasText(request.getDeviceId())) {
            throw new BusinessException("设备标识缺失");
        }
        if (!StringUtils.hasText(request.getEventType())) {
            throw new BusinessException("事件类型缺失");
        }
        String channel = StringUtils.hasText(request.getChannel()) ? request.getChannel() : DEFAULT_CHANNEL;
        recordEvent(request.getDeviceId(), userId, request.getCurrentVersion(),
                request.getTargetVersion(), request.getEventType(), request.getErrorMessage(), channel);

        // 安装成功时推进设备版本记录
        if ("install_success".equals(request.getEventType()) && StringUtils.hasText(request.getTargetVersion())) {
            DeviceVersion device = deviceMapper.selectOne(new LambdaQueryWrapper<DeviceVersion>()
                    .eq(DeviceVersion::getDeviceId, request.getDeviceId())
                    .last("LIMIT 1"));
            if (device != null) {
                device.setCurrentVersion(request.getTargetVersion());
                device.setLastUpdateTime(LocalDateTime.now());
                device.setUpdateCount((device.getUpdateCount() != null ? device.getUpdateCount() : 0) + 1);
                deviceMapper.updateById(device);
            }
        }
    }

    /**
     * 判定更新类型：超过强制截止时间或低于最低兼容版本为强制更新；
     * 客户端支持补丁且存在匹配当前版本的增量补丁为增量更新，否则全量更新。
     */
    private String determineUpdateType(String clientVersion, AppVersion latest, boolean supportPatch) {
        if (AppVersion.TYPE_FORCE.equals(latest.getUpdateType())) {
            return AppVersion.TYPE_FORCE;
        }
        if (latest.getForceDeadline() != null && LocalDateTime.now().isAfter(latest.getForceDeadline())) {
            return AppVersion.TYPE_FORCE;
        }
        if (StringUtils.hasText(latest.getMinVersion())
                && VersionComparator.compare(clientVersion, latest.getMinVersion()) < 0) {
            return AppVersion.TYPE_FORCE;
        }
        if (!supportPatch) {
            return AppVersion.TYPE_FULL;
        }
        Long patchCount = packageMapper.selectCount(new LambdaQueryWrapper<UpdatePackage>()
                .eq(UpdatePackage::getVersionId, latest.getId())
                .eq(UpdatePackage::getPackageType, UpdatePackage.TYPE_PATCH)
                .eq(UpdatePackage::getFromVersion, clientVersion));
        return patchCount != null && patchCount > 0
                ? AppVersion.TYPE_INCREMENTAL
                : AppVersion.TYPE_FULL;
    }

    /**
     * 查找最优更新包：增量更新优先匹配 from_version 的补丁，兜底全量包。
     */
    private UpdatePackage findBestPackage(String clientVersion, AppVersion latest, String updateType) {
        if (AppVersion.TYPE_INCREMENTAL.equals(updateType)) {
            UpdatePackage patch = packageMapper.selectOne(new LambdaQueryWrapper<UpdatePackage>()
                    .eq(UpdatePackage::getVersionId, latest.getId())
                    .eq(UpdatePackage::getPackageType, UpdatePackage.TYPE_PATCH)
                    .eq(UpdatePackage::getFromVersion, clientVersion)
                    .last("LIMIT 1"));
            if (patch != null) {
                return patch;
            }
        }
        UpdatePackage fullPackage = packageMapper.selectOne(new LambdaQueryWrapper<UpdatePackage>()
                .eq(UpdatePackage::getVersionId, latest.getId())
                .eq(UpdatePackage::getPackageType, UpdatePackage.TYPE_FULL)
                .orderByDesc(UpdatePackage::getId)
                .last("LIMIT 1"));
        if (fullPackage == null) {
            throw new BusinessException(500, "版本 " + latest.getVersion() + " 缺少可用的全量更新包");
        }
        return fullPackage;
    }

    /**
     * 查询版本当前生效的灰度策略（启用状态且在时间窗内，取最新一条）。
     */
    private GrayStrategy findActiveStrategy(Long versionId) {
        LocalDateTime now = LocalDateTime.now();
        return grayMapper.selectOne(new LambdaQueryWrapper<GrayStrategy>()
                .eq(GrayStrategy::getVersionId, versionId)
                .eq(GrayStrategy::getStatus, 1)
                .le(GrayStrategy::getStartTime, now)
                .and(wrapper -> wrapper.isNull(GrayStrategy::getEndTime).or().ge(GrayStrategy::getEndTime, now))
                .orderByDesc(GrayStrategy::getId)
                .last("LIMIT 1"));
    }

    /**
     * 灰度命中检查：无策略或全量策略直接放行；
     * 白名单策略比对设备 ID；灰度策略按设备 ID 的 MD5 哈希取模判定（一致性哈希，设备命中结果稳定）。
     */
    private boolean isDeviceInRollout(String deviceId, GrayStrategy strategy) {
        if (strategy == null || GrayStrategy.TYPE_ALL.equals(strategy.getStrategyType())) {
            return true;
        }
        if (GrayStrategy.TYPE_WHITELIST.equals(strategy.getStrategyType())) {
            return parseStringArray(strategy.getWhitelist()).contains(deviceId);
        }
        if (GrayStrategy.TYPE_GRAY.equals(strategy.getStrategyType())) {
            int percent = strategy.getGrayPercent() != null
                    ? Math.max(0, Math.min(100, strategy.getGrayPercent())) : 100;
            return stableHashPercent(deviceId) < percent;
        }
        return true;
    }

    /**
     * 基于设备 ID MD5 的一致性哈希，将设备稳定映射到 [0,100) 区间。
     */
    private int stableHashPercent(String deviceId) {
        try {
            MessageDigest md5 = MessageDigest.getInstance("MD5");
            byte[] digest = md5.digest(deviceId.getBytes(StandardCharsets.UTF_8));
            long value = 0;
            for (int i = 0; i < 8; i++) {
                value = (value << 8) | (digest[i] & 0xFFL);
            }
            return (int) (Math.abs(value) % 100);
        } catch (Exception e) {
            return Math.abs(deviceId.hashCode()) % 100;
        }
    }

    private UpdateCheckResponse buildResponse(AppVersion latest, String updateType,
                                              UpdatePackage pkg, GrayStrategy strategy) {
        UpdateCheckResponse.PackageInfo packageInfo = new UpdateCheckResponse.PackageInfo();
        packageInfo.setPackageId(pkg.getId());
        packageInfo.setPackageType(pkg.getPackageType());
        packageInfo.setUrl(buildDownloadUrl(pkg.getId()));
        packageInfo.setSize(pkg.getFileSize());
        packageInfo.setChecksum("sha256:" + pkg.getChecksumSha256());
        packageInfo.setSignature(StringUtils.hasText(pkg.getSignature()) ? "rsa:" + pkg.getSignature() : "");
        packageInfo.setFromVersion(pkg.getFromVersion());
        packageInfo.setFileName(pkg.getFileName());

        UpdateCheckResponse.PublishStrategy publishStrategy = new UpdateCheckResponse.PublishStrategy();
        publishStrategy.setType(strategy != null ? strategy.getStrategyType() : GrayStrategy.TYPE_ALL);
        // 白名单等策略允许 grayPercent 为 NULL，避免三元表达式拆箱 NPE
        publishStrategy.setGrayPercent(strategy != null && strategy.getGrayPercent() != null
                ? strategy.getGrayPercent() : 100);
        if (latest.getForceDeadline() != null) {
            publishStrategy.setForceAfter(latest.getForceDeadline().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
        }

        UpdateCheckResponse response = new UpdateCheckResponse();
        response.setHasUpdate(true);
        response.setUpdateType(updateType);
        response.setTargetVersion(latest.getVersion());
        response.setTargetBuild(latest.getBuildNumber());
        response.setChangelog(parseStringArray(latest.getChangelog()));
        response.setDownloadInfo(packageInfo);
        response.setPublishStrategy(publishStrategy);
        return response;
    }

    /**
     * 拼接下载地址：配置了对外的基础地址则使用绝对地址，否则返回相对路径由客户端补全。
     */
    private String buildDownloadUrl(Long packageId) {
        String path = "/api/v1/update/download/" + packageId;
        String base = properties.getBaseDownloadUrl();
        if (StringUtils.hasText(base)) {
            return base.endsWith("/") ? base.substring(0, base.length() - 1) + path : base + path;
        }
        return path;
    }

    /**
     * 单设备检测限流：距上次检查不足配置的最小间隔秒数时限流（0 或负数表示不启用）。
     */
    private boolean isRateLimited(String deviceId) {
        Integer intervalSeconds = properties.getCheckIntervalSeconds();
        if (intervalSeconds == null || intervalSeconds <= 0) {
            return false;
        }
        try {
            DeviceVersion device = deviceMapper.selectOne(new LambdaQueryWrapper<DeviceVersion>()
                    .eq(DeviceVersion::getDeviceId, deviceId)
                    .last("LIMIT 1"));
            if (device == null || device.getLastCheckTime() == null) {
                return false;
            }
            return device.getLastCheckTime().plusSeconds(intervalSeconds).isAfter(LocalDateTime.now());
        } catch (Exception e) {
            log.warn("Rate limit check failed for device {}: {}", deviceId, e.getMessage());
            return false;
        }
    }

    /**
     * 更新设备版本追踪记录（不存在则创建），刷新最近检查时间。
     */
    private void touchDevice(String deviceId, String version, int build, String channel) {
        try {
            DeviceVersion device = deviceMapper.selectOne(new LambdaQueryWrapper<DeviceVersion>()
                    .eq(DeviceVersion::getDeviceId, deviceId)
                    .last("LIMIT 1"));
            LocalDateTime now = LocalDateTime.now();
            if (device == null) {
                device = new DeviceVersion();
                device.setDeviceId(deviceId);
                device.setCurrentVersion(version);
                device.setCurrentBuild(build);
                device.setChannel(channel);
                device.setLastCheckTime(now);
                device.setUpdateCount(0);
                deviceMapper.insert(device);
            } else {
                device.setCurrentVersion(version);
                device.setCurrentBuild(build);
                device.setChannel(channel);
                device.setLastCheckTime(now);
                deviceMapper.updateById(device);
            }
        } catch (Exception e) {
            log.warn("Failed to track device {}: {}", deviceId, e.getMessage());
        }
    }

    private void recordEvent(String deviceId, Long userId, String currentVersion, String targetVersion,
                             String eventType, String errorMessage, String channel) {
        try {
            ClientUpdateEvent event = new ClientUpdateEvent();
            event.setDeviceId(deviceId);
            event.setUserId(userId);
            event.setCurrentVersion(currentVersion);
            event.setTargetVersion(targetVersion);
            event.setEventType(eventType);
            if (StringUtils.hasText(errorMessage) && errorMessage.length() > 1000) {
                errorMessage = errorMessage.substring(0, 1000);
            }
            event.setErrorMessage(errorMessage);
            event.setChannel(channel);
            eventMapper.insert(event);
        } catch (Exception e) {
            log.warn("Failed to record update event {} for {}: {}", eventType, deviceId, e.getMessage());
        }
    }

    /**
     * 解析 JSON 字符串数组（更新日志、白名单），解析失败返回空列表。
     */
    private List<String> parseStringArray(String json) {
        if (!StringUtils.hasText(json)) {
            return Collections.emptyList();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() {
            });
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }
}

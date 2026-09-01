package com.im.server.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.im.common.entity.AppVersion;
import com.im.common.entity.ClientUpdateEvent;
import com.im.common.entity.DeviceVersion;
import com.im.common.entity.UpdatePackage;
import com.im.common.exception.BusinessException;
import com.im.common.result.PageResult;
import com.im.server.config.UpdateServerProperties;
import com.im.server.mapper.AppVersionMapper;
import com.im.server.mapper.ClientUpdateEventMapper;
import com.im.server.mapper.DeviceVersionMapper;
import com.im.server.mapper.GrayStrategyMapper;
import com.im.server.mapper.UpdatePackageMapper;
import com.im.server.service.UpdatePackageService;
import com.im.server.util.ChecksumUtil;
import com.im.server.util.SignatureUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.regex.Pattern;

/**
 * 客户端更新包服务实现。
 */
@Service
public class UpdatePackageServiceImpl implements UpdatePackageService {

    private static final Logger log = LoggerFactory.getLogger(UpdatePackageServiceImpl.class);
    private static final Pattern VERSION_PATTERN = Pattern.compile("^\\d+\\.\\d+\\.\\d+$");
    private static final Pattern CHANNEL_PATTERN = Pattern.compile("^[a-z0-9-]{1,20}$");

    @Autowired
    private AppVersionMapper versionMapper;
    @Autowired
    private UpdatePackageMapper packageMapper;
    @Autowired
    private DeviceVersionMapper deviceMapper;
    @Autowired
    private ClientUpdateEventMapper eventMapper;
    @Autowired
    private GrayStrategyMapper grayMapper;
    @Autowired
    private UpdateServerProperties properties;
    @Autowired
    private SignatureUtil signatureUtil;

    @Override
    public ResponseEntity<Resource> downloadPackage(Long packageId, String rangeHeader) {
        UpdatePackage pkg = packageMapper.selectById(packageId);
        if (pkg == null) {
            throw new BusinessException(404, "更新包不存在");
        }
        Path filePath = resolveStoragePath(pkg.getFilePath());
        if (!Files.exists(filePath)) {
            throw new BusinessException(404, "更新包文件已丢失");
        }

        CompletableFuture.runAsync(() -> packageMapper.incrementDownloadCount(packageId));

        long fileSize;
        try {
            fileSize = Files.size(filePath);
        } catch (IOException e) {
            throw new BusinessException(500, "读取更新包失败");
        }

        // 断点续传：解析 Range: bytes=start-end
        if (StringUtils.hasText(rangeHeader) && rangeHeader.startsWith("bytes=")) {
            return handleRangeRequest(filePath, pkg.getFileName(), fileSize, rangeHeader);
        }

        Resource resource = new FileSystemResource(filePath);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + pkg.getFileName() + "\"")
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .contentLength(fileSize)
                .body(resource);
    }

    /**
     * 处理 Range 请求，返回 206 Partial Content。
     */
    private ResponseEntity<Resource> handleRangeRequest(Path filePath, String fileName, long fileSize,
                                                        String rangeHeader) {
        try {
            String[] ranges = rangeHeader.replace("bytes=", "").split("-");
            long start = Long.parseLong(ranges[0].trim());
            long end = ranges.length > 1 && StringUtils.hasText(ranges[1].trim())
                    ? Long.parseLong(ranges[1].trim()) : fileSize - 1;
            if (start < 0 || start >= fileSize || end < start) {
                return ResponseEntity.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                        .header(HttpHeaders.CONTENT_RANGE, "bytes */" + fileSize)
                        .build();
            }
            end = Math.min(end, fileSize - 1);
            long contentLength = end - start + 1;

            final long skipBytes = start;
            final long remaining = contentLength;
            InputStream inputStream = Files.newInputStream(filePath);
            inputStream.skip(skipBytes);

            // 有界流：仅输出请求区间的字节
            InputStream bounded = new InputStream() {
                private long left = remaining;

                @Override
                public int read() throws IOException {
                    if (left <= 0) {
                        return -1;
                    }
                    int b = inputStream.read();
                    if (b != -1) {
                        left--;
                    }
                    return b;
                }

                @Override
                public int read(byte[] buffer, int offset, int length) throws IOException {
                    if (left <= 0) {
                        return -1;
                    }
                    int read = inputStream.read(buffer, offset, (int) Math.min(length, left));
                    if (read > 0) {
                        left -= read;
                    }
                    return read;
                }

                @Override
                public void close() throws IOException {
                    inputStream.close();
                }
            };

            final long contentRangeEnd = end;
            Resource partial = new org.springframework.core.io.InputStreamResource(bounded) {
                @Override
                public long contentLength() {
                    return remaining;
                }
            };
            return ResponseEntity.status(HttpStatus.PARTIAL_CONTENT)
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + fileName + "\"")
                    .header(HttpHeaders.CONTENT_RANGE,
                            String.format("bytes %d-%d/%d", skipBytes, contentRangeEnd, fileSize))
                    .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                    .contentLength(contentLength)
                    .body(partial);
        } catch (IOException | NumberFormatException e) {
            throw new BusinessException(400, "非法的 Range 请求");
        }
    }

    @Override
    public AppVersion publishVersion(MultipartFile file, String version, Integer buildNumber, String channel,
                                     String updateType, String changelog, String minVersion,
                                     LocalDateTime forceDeadline, boolean publish) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException("安装包文件不能为空");
        }
        if (!StringUtils.hasText(version) || !VERSION_PATTERN.matcher(version).matches()) {
            throw new BusinessException("版本号格式非法，应为 x.y.z");
        }
        if (buildNumber == null || buildNumber <= 0) {
            throw new BusinessException("构建号必须为正整数");
        }
        if (!StringUtils.hasText(channel) || !CHANNEL_PATTERN.matcher(channel).matches()) {
            throw new BusinessException("渠道名非法（小写字母/数字/中划线）");
        }
        Long duplicate = versionMapper.selectCount(new LambdaQueryWrapper<AppVersion>()
                .eq(AppVersion::getVersion, version)
                .eq(AppVersion::getChannel, channel));
        if (duplicate != null && duplicate > 0) {
            throw new BusinessException("该渠道下版本 " + version + " 已存在");
        }

        // 1. 保存安装包文件：storagePath/<channel>/<version>/<fileName>
        String originalName = StringUtils.hasText(file.getOriginalFilename())
                ? file.getOriginalFilename() : "IM_" + version + ".exe";
        String fileName = sanitizeFileName(originalName);
        String relativePath = channel + "/" + version + "/" + fileName;
        Path target = resolveStoragePath(relativePath);
        try {
            Files.createDirectories(target.getParent());
            file.transferTo(target);
        } catch (IOException e) {
            log.error("Failed to store update package", e);
            throw new BusinessException(500, "保存安装包文件失败");
        }

        // 2. 计算 SHA256 并签名
        String checksum;
        try {
            checksum = ChecksumUtil.sha256(target);
        } catch (IOException e) {
            throw new BusinessException(500, "计算文件校验和失败");
        }
        String signature = signatureUtil.sign(checksum);

        // 3. 保存版本与全量包记录
        AppVersion appVersion = new AppVersion();
        appVersion.setVersion(version);
        appVersion.setBuildNumber(buildNumber);
        appVersion.setChannel(channel);
        appVersion.setUpdateType(StringUtils.hasText(updateType) ? updateType : AppVersion.TYPE_FULL);
        appVersion.setChangelog(changelog);
        appVersion.setMinVersion(minVersion);
        appVersion.setForceDeadline(forceDeadline);
        appVersion.setStatus(publish ? AppVersion.STATUS_PUBLISHED : AppVersion.STATUS_DRAFT);
        versionMapper.insert(appVersion);

        UpdatePackage fullPackage = new UpdatePackage();
        fullPackage.setVersionId(appVersion.getId());
        fullPackage.setPackageType(UpdatePackage.TYPE_FULL);
        fullPackage.setFileName(fileName);
        fullPackage.setFilePath(relativePath);
        fullPackage.setFileSize(target.toFile().length());
        fullPackage.setChecksumSha256(checksum);
        fullPackage.setSignature(signature);
        fullPackage.setDownloadCount(0);
        packageMapper.insert(fullPackage);

        // 4. 异步为最近的历史版本生成增量补丁
        generatePatchesAsync(appVersion, target);

        log.info("Version published: {} {} (build {}, channel {}, publish={})",
                version, fileName, buildNumber, channel, publish);
        return appVersion;
    }

    /**
     * 异步为新版本生成针对最近 N 个历史版本的 xdelta3 增量补丁。
     */
    private void generatePatchesAsync(AppVersion newVersion, Path newFile) {
        int maxSources = properties.getMaxPatchSourceVersions() != null
                ? properties.getMaxPatchSourceVersions() : 3;
        List<AppVersion> recentVersions = versionMapper.selectList(new LambdaQueryWrapper<AppVersion>()
                .eq(AppVersion::getChannel, newVersion.getChannel())
                .ne(AppVersion::getId, newVersion.getId())
                .orderByDesc(AppVersion::getBuildNumber)
                .last("LIMIT " + Math.max(1, maxSources)));

        CompletableFuture.runAsync(() -> {
            for (AppVersion oldVersion : recentVersions) {
                try {
                    UpdatePackage oldFull = packageMapper.selectOne(new LambdaQueryWrapper<UpdatePackage>()
                            .eq(UpdatePackage::getVersionId, oldVersion.getId())
                            .eq(UpdatePackage::getPackageType, UpdatePackage.TYPE_FULL)
                            .last("LIMIT 1"));
                    if (oldFull == null) {
                        continue;
                    }
                    Path oldFile = resolveStoragePath(oldFull.getFilePath());
                    if (!Files.exists(oldFile)) {
                        continue;
                    }
                    generatePatch(newVersion, oldVersion.getVersion(), oldFile, newFile);
                } catch (Exception e) {
                    log.error("Patch generation failed for {} -> {}: {}",
                            oldVersion.getVersion(), newVersion.getVersion(), e.getMessage());
                }
            }
        });
    }

    /**
     * 调用 xdelta3 生成增量补丁，计算校验和与签名后入库。
     */
    private void generatePatch(AppVersion newVersion, String fromVersion, Path oldFile, Path newFile)
            throws IOException, InterruptedException {
        String patchName = fromVersion + "_to_" + newVersion.getVersion() + ".patch";
        String relativePath = newVersion.getChannel() + "/" + newVersion.getVersion() + "/patches/" + patchName;
        Path patchPath = resolveStoragePath(relativePath);
        Files.createDirectories(patchPath.getParent());

        Process process = new ProcessBuilder(
                properties.getXdelta3Path(), "-e", "-f", "-s",
                oldFile.toString(), newFile.toString(), patchPath.toString())
                .redirectErrorStream(true)
                .start();
        int exitCode = process.waitFor();
        if (exitCode != 0 || !Files.exists(patchPath)) {
            throw new IOException("xdelta3 exited with code " + exitCode);
        }

        String checksum = ChecksumUtil.sha256(patchPath);
        UpdatePackage patch = new UpdatePackage();
        patch.setVersionId(newVersion.getId());
        patch.setPackageType(UpdatePackage.TYPE_PATCH);
        patch.setFromVersion(fromVersion);
        patch.setFileName(patchName);
        patch.setFilePath(relativePath);
        patch.setFileSize(Files.size(patchPath));
        patch.setChecksumSha256(checksum);
        patch.setSignature(signatureUtil.sign(checksum));
        patch.setDownloadCount(0);
        packageMapper.insert(patch);
        log.info("Patch generated: {} ({} bytes)", patchName, patch.getFileSize());
    }

    @Override
    public PageResult<AppVersion> pageVersions(String channel, int page, int pageSize) {
        LambdaQueryWrapper<AppVersion> wrapper = new LambdaQueryWrapper<AppVersion>()
                .eq(StringUtils.hasText(channel), AppVersion::getChannel, channel)
                .orderByDesc(AppVersion::getBuildNumber)
                .orderByDesc(AppVersion::getId);
        Page<AppVersion> result = versionMapper.selectPage(new Page<>(page, pageSize), wrapper);
        return PageResult.success(result.getRecords(), result.getTotal(), page, pageSize);
    }

    @Override
    public List<UpdatePackage> listPackages(Long versionId) {
        return packageMapper.selectList(new LambdaQueryWrapper<UpdatePackage>()
                .eq(UpdatePackage::getVersionId, versionId)
                .orderByAsc(UpdatePackage::getPackageType)
                .orderByAsc(UpdatePackage::getFromVersion));
    }

    @Override
    public void updateVersionStatus(Long versionId, Integer status) {
        AppVersion version = versionMapper.selectById(versionId);
        if (version == null) {
            throw new BusinessException(404, "版本不存在");
        }
        if (status == null || status < 0 || status > 2) {
            throw new BusinessException("非法的版本状态");
        }
        version.setStatus(status);
        versionMapper.updateById(version);
    }

    @Override
    public void saveGrayStrategy(Long versionId, com.im.common.dto.update.GrayStrategyRequest request) {
        AppVersion version = versionMapper.selectById(versionId);
        if (version == null) {
            throw new BusinessException(404, "版本不存在");
        }
        if (request == null || !StringUtils.hasText(request.getStrategyType())) {
            throw new BusinessException("策略类型不能为空");
        }
        String type = request.getStrategyType();
        if (!com.im.common.entity.GrayStrategy.TYPE_ALL.equals(type)
                && !com.im.common.entity.GrayStrategy.TYPE_GRAY.equals(type)
                && !com.im.common.entity.GrayStrategy.TYPE_WHITELIST.equals(type)) {
            throw new BusinessException("非法的策略类型：" + type);
        }

        // 停用该版本历史策略
        com.im.common.entity.GrayStrategy disable = new com.im.common.entity.GrayStrategy();
        disable.setStatus(0);
        grayMapper.update(disable, new LambdaQueryWrapper<com.im.common.entity.GrayStrategy>()
                .eq(com.im.common.entity.GrayStrategy::getVersionId, versionId)
                .eq(com.im.common.entity.GrayStrategy::getStatus, 1));

        com.im.common.entity.GrayStrategy strategy = new com.im.common.entity.GrayStrategy();
        strategy.setVersionId(versionId);
        strategy.setStrategyType(type);
        strategy.setGrayPercent(request.getGrayPercent() != null
                ? Math.max(0, Math.min(100, request.getGrayPercent())) : 100);
        try {
            strategy.setWhitelist(request.getWhitelist() != null
                    ? new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(request.getWhitelist())
                    : null);
        } catch (Exception e) {
            throw new BusinessException("白名单序列化失败");
        }
        strategy.setStartTime(request.getStartTime() != null ? request.getStartTime() : LocalDateTime.now());
        strategy.setEndTime(request.getEndTime());
        strategy.setStatus(1);
        grayMapper.insert(strategy);
    }

    @Override
    public Map<String, Object> statistics() {
        Map<String, Object> result = new LinkedHashMap<>();

        // 版本分布：按设备当前版本分组统计
        List<Map<String, Object>> distribution = deviceMapper.selectMaps(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<DeviceVersion>()
                        .select("current_version AS version", "COUNT(*) AS deviceCount")
                        .groupBy("current_version")
                        .orderByDesc("deviceCount"));
        result.put("versionDistribution", distribution);

        // 更新事件统计：按事件类型统计
        List<Map<String, Object>> eventStats = eventMapper.selectMaps(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<ClientUpdateEvent>()
                        .select("event_type AS eventType", "COUNT(*) AS eventCount")
                        .groupBy("event_type"));
        result.put("eventStats", eventStats);

        // 更新成功率 = install_success / (install_success + install_failed)
        Map<String, Long> counts = new HashMap<>();
        for (Map<String, Object> row : eventStats) {
            counts.put(String.valueOf(row.get("eventType")),
                    ((Number) row.get("eventCount")).longValue());
        }
        long success = counts.getOrDefault("install_success", 0L);
        long failed = counts.getOrDefault("install_failed", 0L);
        result.put("installSuccessCount", success);
        result.put("installFailedCount", failed);
        result.put("installSuccessRate", (success + failed) == 0 ? null
                : Math.round(success * 10000.0 / (success + failed)) / 100.0);

        Long trackedDevices = deviceMapper.selectCount(null);
        result.put("trackedDevices", trackedDevices);
        return result;
    }

    /**
     * 解析存储路径并防止目录穿越。
     */
    private Path resolveStoragePath(String relativePath) {
        Path root = Paths.get(properties.getStoragePath()).toAbsolutePath().normalize();
        Path resolved = root.resolve(relativePath).normalize();
        if (!resolved.startsWith(root)) {
            throw new BusinessException(400, "非法的文件路径");
        }
        return resolved;
    }

    private String sanitizeFileName(String name) {
        return name.replaceAll("[<>:\"/\\\\|?*]", "_");
    }
}

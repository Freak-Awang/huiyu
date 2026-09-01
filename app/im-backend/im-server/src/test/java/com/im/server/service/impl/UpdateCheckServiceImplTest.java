package com.im.server.service.impl;

import com.im.common.dto.update.UpdateCheckResponse;
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
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 更新检查服务测试，覆盖版本比较、灰度/白名单命中、强制与增量更新判定及单设备限流。
 */
@ExtendWith(MockitoExtension.class)
class UpdateCheckServiceImplTest {

    @Mock
    private AppVersionMapper versionMapper;
    @Mock
    private UpdatePackageMapper packageMapper;
    @Mock
    private GrayStrategyMapper grayMapper;
    @Mock
    private DeviceVersionMapper deviceMapper;
    @Mock
    private ClientUpdateEventMapper eventMapper;
    @Spy
    private UpdateServerProperties properties = new UpdateServerProperties();

    @InjectMocks
    private UpdateCheckServiceImpl updateCheckService;

    private AppVersion publishedVersion(String version, int buildNumber) {
        AppVersion appVersion = new AppVersion();
        appVersion.setId(1L);
        appVersion.setVersion(version);
        appVersion.setBuildNumber(buildNumber);
        appVersion.setChannel("stable");
        appVersion.setUpdateType(AppVersion.TYPE_FULL);
        appVersion.setStatus(AppVersion.STATUS_PUBLISHED);
        return appVersion;
    }

    private UpdatePackage fullPackage() {
        UpdatePackage pkg = new UpdatePackage();
        pkg.setId(11L);
        pkg.setVersionId(1L);
        pkg.setPackageType(UpdatePackage.TYPE_FULL);
        pkg.setFileName("ArtTalk-Setup-1.1.0-x64.exe");
        pkg.setFilePath("stable/1.1.0/ArtTalk-Setup-1.1.0-x64.exe");
        pkg.setFileSize(1024L);
        pkg.setChecksumSha256("abc123");
        pkg.setSignature("sign");
        return pkg;
    }

    @Test
    void rejectsMissingDeviceId() {
        assertThatThrownBy(() -> updateCheckService.check("1.0.0", 1, "", "stable", true, null))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> updateCheckService.check("", 1, "device-a", "stable", true, null))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void noPublishedVersionReturnsNoUpdate() {
        when(versionMapper.selectOne(any())).thenReturn(null);
        when(deviceMapper.selectOne(any())).thenReturn(null);

        UpdateCheckResponse response = updateCheckService.check("1.0.0", 1, "device-a", "stable", true, null);

        assertThat(response.isHasUpdate()).isFalse();
        assertThat(response.getUpdateType()).isEqualTo("none");
    }

    @Test
    void upToDateClientReturnsNoUpdate() {
        when(versionMapper.selectOne(any())).thenReturn(publishedVersion("1.0.0", 100));
        when(deviceMapper.selectOne(any())).thenReturn(null);

        UpdateCheckResponse sameBuild = updateCheckService.check("1.0.0", 100, "device-a", "stable", true, null);
        UpdateCheckResponse newerVersion = updateCheckService.check("1.0.1", 1, "device-a", "stable", true, null);

        assertThat(sameBuild.isHasUpdate()).isFalse();
        assertThat(newerVersion.isHasUpdate()).isFalse();
    }

    @Test
    void returnsFullUpdateWhenNoPatchAvailable() {
        AppVersion latest = publishedVersion("1.1.0", 200);
        latest.setChangelog("[\"修复消息同步异常\",\"优化通话画质\"]");
        when(versionMapper.selectOne(any())).thenReturn(latest);
        when(deviceMapper.selectOne(any())).thenReturn(null);
        when(packageMapper.selectCount(any())).thenReturn(0L);
        when(packageMapper.selectOne(any())).thenReturn(fullPackage());

        UpdateCheckResponse response = updateCheckService.check("1.0.0", 100, "device-a", "stable", true, 7L);

        assertThat(response.isHasUpdate()).isTrue();
        assertThat(response.getUpdateType()).isEqualTo(AppVersion.TYPE_FULL);
        assertThat(response.getTargetVersion()).isEqualTo("1.1.0");
        assertThat(response.getTargetBuild()).isEqualTo(200);
        assertThat(response.getChangelog()).containsExactly("修复消息同步异常", "优化通话画质");
        assertThat(response.getDownloadInfo().getPackageType()).isEqualTo(UpdatePackage.TYPE_FULL);
        assertThat(response.getDownloadInfo().getUrl()).isEqualTo("/api/v1/update/download/11");
        assertThat(response.getDownloadInfo().getChecksum()).isEqualTo("sha256:abc123");
        assertThat(response.getPublishStrategy().getType()).isEqualTo(GrayStrategy.TYPE_ALL);
        verify(eventMapper).insert(any(ClientUpdateEvent.class));
    }

    @Test
    void returnsForceUpdateWhenBelowMinVersion() {
        AppVersion latest = publishedVersion("1.3.0", 300);
        latest.setMinVersion("1.2.0");
        when(versionMapper.selectOne(any())).thenReturn(latest);
        when(deviceMapper.selectOne(any())).thenReturn(null);
        when(packageMapper.selectOne(any())).thenReturn(fullPackage());

        UpdateCheckResponse response = updateCheckService.check("1.0.0", 100, "device-a", "stable", true, null);

        assertThat(response.isHasUpdate()).isTrue();
        assertThat(response.getUpdateType()).isEqualTo(AppVersion.TYPE_FORCE);
    }

    @Test
    void returnsIncrementalUpdateWhenPatchExists() {
        UpdatePackage patch = fullPackage();
        patch.setId(12L);
        patch.setPackageType(UpdatePackage.TYPE_PATCH);
        patch.setFromVersion("1.0.0");
        patch.setFileName("1.0.0_to_1.1.0.patch");
        when(versionMapper.selectOne(any())).thenReturn(publishedVersion("1.1.0", 200));
        when(deviceMapper.selectOne(any())).thenReturn(null);
        when(packageMapper.selectCount(any())).thenReturn(1L);
        when(packageMapper.selectOne(any())).thenReturn(patch);

        UpdateCheckResponse response = updateCheckService.check("1.0.0", 100, "device-a", "stable", true, null);

        assertThat(response.isHasUpdate()).isTrue();
        assertThat(response.getUpdateType()).isEqualTo(AppVersion.TYPE_INCREMENTAL);
        assertThat(response.getDownloadInfo().getPackageType()).isEqualTo(UpdatePackage.TYPE_PATCH);
        assertThat(response.getDownloadInfo().getFromVersion()).isEqualTo("1.0.0");
    }

    @Test
    void fallsBackToFullPackageWhenClientDoesNotSupportPatch() {
        when(versionMapper.selectOne(any())).thenReturn(publishedVersion("1.1.0", 200));
        when(deviceMapper.selectOne(any())).thenReturn(null);
        when(packageMapper.selectOne(any())).thenReturn(fullPackage());

        UpdateCheckResponse response = updateCheckService.check("1.0.0", 100, "device-a", "stable", false, null);

        assertThat(response.isHasUpdate()).isTrue();
        assertThat(response.getUpdateType()).isEqualTo(AppVersion.TYPE_FULL);
        verify(packageMapper, never()).selectCount(any());
    }

    @Test
    void whitelistStrategyFiltersDevices() {
        GrayStrategy strategy = new GrayStrategy();
        strategy.setVersionId(1L);
        strategy.setStrategyType(GrayStrategy.TYPE_WHITELIST);
        strategy.setWhitelist("[\"device-a\"]");
        when(versionMapper.selectOne(any())).thenReturn(publishedVersion("1.1.0", 200));
        when(deviceMapper.selectOne(any())).thenReturn(null);
        when(grayMapper.selectOne(any())).thenReturn(strategy);
        when(packageMapper.selectOne(any())).thenReturn(fullPackage());

        UpdateCheckResponse denied = updateCheckService.check("1.0.0", 100, "device-b", "stable", true, null);
        UpdateCheckResponse allowed = updateCheckService.check("1.0.0", 100, "device-a", "stable", true, null);

        assertThat(denied.isHasUpdate()).isFalse();
        assertThat(allowed.isHasUpdate()).isTrue();
        assertThat(allowed.getUpdateType()).isEqualTo(AppVersion.TYPE_FULL);
    }

    @Test
    void zeroGrayPercentReturnsNoUpdate() {
        GrayStrategy strategy = new GrayStrategy();
        strategy.setVersionId(1L);
        strategy.setStrategyType(GrayStrategy.TYPE_GRAY);
        strategy.setGrayPercent(0);
        when(versionMapper.selectOne(any())).thenReturn(publishedVersion("1.1.0", 200));
        when(deviceMapper.selectOne(any())).thenReturn(null);
        when(grayMapper.selectOne(any())).thenReturn(strategy);

        UpdateCheckResponse response = updateCheckService.check("1.0.0", 100, "device-a", "stable", true, null);

        assertThat(response.isHasUpdate()).isFalse();
    }

    @Test
    void rateLimitedDeviceReturnsNoUpdate() {
        properties.setCheckIntervalSeconds(3600);
        DeviceVersion device = new DeviceVersion();
        device.setDeviceId("device-a");
        device.setLastCheckTime(LocalDateTime.now());
        when(deviceMapper.selectOne(any())).thenReturn(device);

        UpdateCheckResponse response = updateCheckService.check("1.0.0", 100, "device-a", "stable", true, null);

        assertThat(response.isHasUpdate()).isFalse();
        verify(versionMapper, never()).selectOne(any());
    }
}

package com.im.server.service.impl;

import com.im.common.entity.ImClientRelease;
import com.im.common.entity.ImClientReleaseTarget;
import com.im.server.mapper.ClientReleaseMapper;
import com.im.server.mapper.ClientReleaseTargetMapper;
import com.im.server.mapper.ClientUpdateEventMapper;
import com.im.server.mapper.UserMapper;
import com.im.server.service.ClientReleaseService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 客户端发布策略测试，验证最小版本强制更新和 DENY 目标设备排除逻辑。
 *
 * <p>测试范围：ClientReleaseServiceImpl.evaluatePolicy 的更新策略评估。</p>
 */
class ClientReleaseServiceImplTest {
    private ClientReleaseMapper releaseMapper;
    private ClientReleaseTargetMapper targetMapper;
    private ClientReleaseService service;

    @BeforeEach
    void setUp() {
        releaseMapper = mock(ClientReleaseMapper.class);
        targetMapper = mock(ClientReleaseTargetMapper.class);
        service = new ClientReleaseServiceImpl(releaseMapper, targetMapper, mock(ClientUpdateEventMapper.class), mock(UserMapper.class));
    }

    /**
     * 验证当前版本(0.0.2)低于 minimumVersion(0.0.3)时，即使 rollout=0 也强制更新。
     */
    @Test
    void minimumVersionForcesUpdateEvenWithZeroRollout() {
        ImClientRelease release = release("0.0.4", 0); // rollout=0
        release.setMinimumVersion("0.0.3");
        when(releaseMapper.selectList(any())).thenReturn(List.of(release));
        when(targetMapper.selectList(any())).thenReturn(List.of());

        ClientReleaseService.PolicyResponse result = service.evaluatePolicy("win32", "x64", "stable", "0.0.2", "device-1", null);

        assertTrue(result.hasUpdate());
        assertTrue(result.forceUpdate()); // minimumVersion 触发强制更新
    }

    /**
     * 验证 DENY 目标优先于强制更新：即使发布是 forceUpdate=true + rollout=100，
     * 被 DENY 的设备不会收到更新。
     */
    @Test
    void denyTargetWinsOverForcedUpdate() {
        ImClientRelease release = release("0.0.4", 100);
        release.setForceUpdate(true);
        ImClientReleaseTarget deny = new ImClientReleaseTarget();
        deny.setReleaseId(1L);
        deny.setMode("DENY"); // 拒绝模式
        deny.setTargetType("DEVICE");
        deny.setTargetValue("device-1"); // 拒绝该设备
        when(releaseMapper.selectList(any())).thenReturn(List.of(release));
        when(targetMapper.selectList(any())).thenReturn(List.of(deny));

        ClientReleaseService.PolicyResponse result = service.evaluatePolicy("win32", "x64", "stable", "0.0.3", "device-1", null);

        assertFalse(result.hasUpdate()); // DENY 生效
    }

    private ImClientRelease release(String version, int rollout) {
        ImClientRelease release = new ImClientRelease();
        release.setId(1L);
        release.setVersion(version);
        release.setStatus("PUBLISHED");
        release.setChannel("stable");
        release.setPlatform("win32");
        release.setArch("x64");
        release.setRolloutPercentage(rollout);
        release.setForceUpdate(false);
        release.setReleaseName("ArtTalk " + version);
        release.setUpdateBaseUrl("https://im.example.test/downloads/arttalk/stable/win-x64/");
        return release;
    }
}

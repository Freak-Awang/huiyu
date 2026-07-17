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

    @Test
    void minimumVersionForcesUpdateEvenWithZeroRollout() {
        ImClientRelease release = release("0.0.4", 0);
        release.setMinimumVersion("0.0.3");
        when(releaseMapper.selectList(any())).thenReturn(List.of(release));
        when(targetMapper.selectList(any())).thenReturn(List.of());

        ClientReleaseService.PolicyResponse result = service.evaluatePolicy("win32", "x64", "stable", "0.0.2", "device-1", null);

        assertTrue(result.hasUpdate());
        assertTrue(result.forceUpdate());
    }

    @Test
    void denyTargetWinsOverForcedUpdate() {
        ImClientRelease release = release("0.0.4", 100);
        release.setForceUpdate(true);
        ImClientReleaseTarget deny = new ImClientReleaseTarget();
        deny.setReleaseId(1L);
        deny.setMode("DENY");
        deny.setTargetType("DEVICE");
        deny.setTargetValue("device-1");
        when(releaseMapper.selectList(any())).thenReturn(List.of(release));
        when(targetMapper.selectList(any())).thenReturn(List.of(deny));

        ClientReleaseService.PolicyResponse result = service.evaluatePolicy("win32", "x64", "stable", "0.0.3", "device-1", null);

        assertFalse(result.hasUpdate());
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
        release.setUpdateBaseUrl("http://172.16.59.253:88/downloads/arttalk/stable/win-x64/");
        return release;
    }
}

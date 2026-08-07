package com.im.server.service.impl;

import com.im.common.entity.ImClientRelease;
import com.im.common.entity.ImClientReleaseTarget;
import com.im.common.entity.SysUser;
import com.im.common.exception.BusinessException;
import com.im.server.mapper.ClientReleaseMapper;
import com.im.server.mapper.ClientReleaseTargetMapper;
import com.im.server.mapper.ClientUpdateEventMapper;
import com.im.server.mapper.UserMapper;
import com.im.server.service.ClientReleaseArtifactVerifier;
import com.im.server.service.ClientReleaseService;
import com.im.server.service.ReleaseAuditService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doThrow;

class ClientReleaseServiceImplTest {
    private ClientReleaseMapper releaseMapper;
    private ClientReleaseTargetMapper targetMapper;
    private ClientUpdateEventMapper eventMapper;
    private UserMapper userMapper;
    private ClientReleaseArtifactVerifier verifier;
    private ReleaseAuditService auditService;
    private ClientReleaseService service;

    @BeforeEach
    void setUp() {
        releaseMapper = mock(ClientReleaseMapper.class);
        targetMapper = mock(ClientReleaseTargetMapper.class);
        eventMapper = mock(ClientUpdateEventMapper.class);
        userMapper = mock(UserMapper.class);
        verifier = mock(ClientReleaseArtifactVerifier.class);
        auditService = mock(ReleaseAuditService.class);
        when(targetMapper.selectList(any())).thenReturn(List.of());
        service = new ClientReleaseServiceImpl(releaseMapper, targetMapper, eventMapper, userMapper, verifier, auditService);
    }

    @Test
    void minimumVersionForcesUpdateEvenWithZeroRollout() {
        ImClientRelease release = release("0.0.9", 0);
        release.setMinimumVersion("0.0.8");
        when(releaseMapper.selectList(any())).thenReturn(List.of(release));

        ClientReleaseService.PolicyResponse result = service.evaluatePolicy(
                "win32", "x64", "stable", "0.0.7", "device-1", null);

        assertTrue(result.hasUpdate());
        assertTrue(result.forceUpdate());
        assertEquals(1L, result.releaseId());
    }

    @Test
    void denyTargetWinsOverForcedUpdate() {
        ImClientRelease release = release("0.0.9", 100);
        release.setForceUpdate(true);
        when(releaseMapper.selectList(any())).thenReturn(List.of(release));
        when(targetMapper.selectList(any())).thenReturn(List.of(target("DEVICE", "device-1", "DENY")));

        assertFalse(service.evaluatePolicy("win32", "x64", "stable", "0.0.8", "device-1", null).hasUpdate());
    }

    @Test
    void anonymousRequestIsConservativeWhenUserOrDepartmentRulesExist() {
        ImClientRelease release = release("0.0.9", 100);
        when(releaseMapper.selectList(any())).thenReturn(List.of(release));
        when(targetMapper.selectList(any())).thenReturn(List.of(target("USER", "42", "ALLOW")));

        assertFalse(service.evaluatePolicy("win32", "x64", "stable", "0.0.8", "device-1", null).hasUpdate());

        SysUser user = new SysUser();
        user.setId(42L);
        when(userMapper.selectById(42L)).thenReturn(user);
        assertTrue(service.evaluatePolicy("win32", "x64", "stable", "0.0.8", "device-1", 42L).hasUpdate());
    }

    @Test
    void rolloutSupportsZeroTenThirtyAndOneHundredPercent() {
        ImClientRelease release = release("0.0.9", 0);
        when(releaseMapper.selectList(any())).thenReturn(List.of(release));
        assertFalse(service.evaluatePolicy("win32", "x64", "stable", "0.0.8", "device-0", null).hasUpdate());

        int ten = eligibleDevices(release, 10);
        int thirty = eligibleDevices(release, 30);
        int hundred = eligibleDevices(release, 100);
        assertTrue(ten >= 60 && ten <= 140, "10% rollout must remain close to its deterministic bucket size");
        assertTrue(thirty >= 240 && thirty <= 360, "30% rollout must remain close to its deterministic bucket size");
        assertTrue(thirty > ten);
        assertEquals(1000, hundred);
    }

    @Test
    void automationDraftIsIdempotentButRejectsDifferentArtifacts() {
        AtomicReference<ImClientRelease> stored = new AtomicReference<>();
        doAnswer(invocation -> {
            ImClientRelease value = invocation.getArgument(0);
            value.setId(9L);
            stored.set(value);
            return 1;
        }).when(releaseMapper).insert(any(ImClientRelease.class));
        when(releaseMapper.selectById(9L)).thenAnswer(invocation -> stored.get());
        when(releaseMapper.selectOne(any())).thenReturn(null, draftRelease());

        ClientReleaseService.ReleaseDetail created = service.createAutomationDraft(draftRequest("a".repeat(64)));
        assertEquals("DRAFT", created.release().getStatus());
        assertEquals(0, created.release().getRolloutPercentage());
        verify(auditService).record(eq(9L), eq("DRAFT_CREATED"), any(), eq(null), any());

        assertThrows(BusinessException.class,
                () -> service.createAutomationDraft(draftRequest("b".repeat(64))));
    }

    @Test
    void forcePolicyRequiresExactVersionConfirmationAndReason() {
        ImClientRelease release = release("0.0.9", 0);
        when(releaseMapper.selectById(1L)).thenReturn(release);
        ClientReleaseService.PolicyUpdateRequest missingConfirmation = new ClientReleaseService.PolicyUpdateRequest(
                "ArtTalk 0.0.9", List.of("security fix"), "0.0.8", true, 0, List.of(),
                "security incident", "0.0.8");
        assertThrows(BusinessException.class, () -> service.updatePolicy(1L, missingConfirmation, 7L));
    }

    @Test
    void publishingRevalidatesArtifactsAndTransitionsState() {
        ImClientRelease release = draftRelease();
        when(releaseMapper.selectById(1L)).thenReturn(release);
        when(releaseMapper.lockReleaseScope("stable", "win32", "x64")).thenReturn(List.of(release));
        when(verifier.verify(release)).thenReturn(LocalDateTime.now());

        ClientReleaseService.ReleaseDetail result = service.publish(
                1L, new ClientReleaseService.ReleaseActionRequest("approved pilot", null), 7L);

        assertEquals("PUBLISHED", result.release().getStatus());
        verify(verifier).verify(release);
        verify(auditService).record(eq(1L), eq("PUBLISHED"), eq("approved pilot"), eq(7L), any());
    }

    @Test
    void verificationFailureIsAuditedWithoutPublishing() {
        ImClientRelease release = draftRelease();
        when(releaseMapper.selectById(1L)).thenReturn(release);
        doThrow(new BusinessException(409, "digest mismatch")).when(verifier).verify(release);

        assertThrows(BusinessException.class, () -> service.publish(
                1L, new ClientReleaseService.ReleaseActionRequest("approval attempt", null), 7L));

        assertEquals("DRAFT", release.getStatus());
        verify(auditService).recordFailure(eq(1L), eq("ARTIFACT_VERIFICATION_FAILED"),
                eq("approval attempt"), eq(7L), any());
    }

    @Test
    void pauseTransitionsPublishedReleaseAndRequiresReason() {
        ImClientRelease release = release("0.0.9", 10);
        when(releaseMapper.selectById(1L)).thenReturn(release);

        assertThrows(BusinessException.class, () -> service.pause(
                1L, new ClientReleaseService.ReleaseActionRequest("", null), 7L));
        ClientReleaseService.ReleaseDetail result = service.pause(
                1L, new ClientReleaseService.ReleaseActionRequest("download failures exceeded threshold", null), 7L);

        assertEquals("PAUSED", result.release().getStatus());
        verify(auditService).record(eq(1L), eq("PAUSED"), any(), eq(7L), eq(null));
    }

    private int eligibleDevices(ImClientRelease release, int rollout) {
        release.setRolloutPercentage(rollout);
        int eligible = 0;
        for (int index = 0; index < 1000; index++) {
            if (service.evaluatePolicy("win32", "x64", "stable", "0.0.8", "device-" + index, null).hasUpdate()) {
                eligible++;
            }
        }
        return eligible;
    }

    private ImClientReleaseTarget target(String type, String value, String mode) {
        ImClientReleaseTarget target = new ImClientReleaseTarget();
        target.setReleaseId(1L);
        target.setTargetType(type);
        target.setTargetValue(value);
        target.setMode(mode);
        return target;
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
        release.setUpdateBaseUrl("https://im.example.test/downloads/arttalk/stable/" + version + "/win-x64/");
        return release;
    }

    private ImClientRelease draftRelease() {
        ImClientRelease release = release("0.0.9", 0);
        release.setStatus("DRAFT");
        release.setManifestName("latest.yml");
        release.setManifestDigest("a".repeat(64));
        release.setInstallerName("ArtTalk-Setup-0.0.9-x64.exe");
        release.setInstallerSize(123L);
        release.setInstallerSha512(Base64.getEncoder().encodeToString(new byte[64]));
        release.setSourceCommit("a".repeat(40));
        release.setSignerThumbprint("B".repeat(40));
        release.setArtifactVerifiedAt(LocalDateTime.now());
        return release;
    }

    private ClientReleaseService.AutomationDraftRequest draftRequest(String manifestDigest) {
        return new ClientReleaseService.AutomationDraftRequest(
                "0.0.9", "stable", "win32", "x64",
                "https://im.example.test/downloads/arttalk/stable/0.0.9/win-x64/",
                "latest.yml", manifestDigest, "ArtTalk-Setup-0.0.9-x64.exe", 123L,
                Base64.getEncoder().encodeToString(new byte[64]), "a".repeat(40), "B".repeat(40),
                OffsetDateTime.now());
    }
}

package com.im.server.controller;

import com.im.common.result.Result;
import com.im.server.service.ClientReleaseService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Narrow release-automation endpoint: it can only create or refresh immutable drafts. */
@RestController
@RequestMapping("/api/internal/client-release-drafts")
public class InternalClientReleaseController {
    private final ClientReleaseService releaseService;

    public InternalClientReleaseController(ClientReleaseService releaseService) {
        this.releaseService = releaseService;
    }

    @PostMapping
    public Result<ClientReleaseService.ReleaseDetail> createOrRefresh(
            @RequestBody ClientReleaseService.AutomationDraftRequest request) {
        return Result.success(releaseService.createAutomationDraft(request));
    }
}

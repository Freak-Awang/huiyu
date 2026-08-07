package com.im.server.service;

import com.im.common.entity.ImClientReleaseAudit;
import com.im.server.mapper.ClientReleaseAuditMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/** Writes lifecycle evidence transactionally and preserves verification failures independently. */
@Service
public class ReleaseAuditService {
    private final ClientReleaseAuditMapper mapper;

    public ReleaseAuditService(ClientReleaseAuditMapper mapper) {
        this.mapper = mapper;
    }

    @Transactional
    public void record(Long releaseId, String action, String reason, Long operatorId, String details) {
        insert(releaseId, action, reason, operatorId, details);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordFailure(Long releaseId, String action, String reason, Long operatorId, String details) {
        insert(releaseId, action, reason, operatorId, details);
    }

    private void insert(Long releaseId, String action, String reason, Long operatorId, String details) {
        ImClientReleaseAudit audit = new ImClientReleaseAudit();
        audit.setReleaseId(releaseId);
        audit.setAction(action);
        audit.setReason(reason);
        audit.setOperatorId(operatorId);
        audit.setDetails(details);
        audit.setCreateTime(LocalDateTime.now());
        mapper.insert(audit);
    }
}

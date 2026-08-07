package com.im.server.service;

import com.im.common.entity.ImClientRelease;

import java.time.LocalDateTime;

/** Revalidates the immutable public artifacts immediately before approval. */
public interface ClientReleaseArtifactVerifier {
    LocalDateTime verify(ImClientRelease release);
}

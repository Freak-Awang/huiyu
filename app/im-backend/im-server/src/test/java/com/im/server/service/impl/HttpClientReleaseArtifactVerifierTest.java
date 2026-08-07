package com.im.server.service.impl;

import com.im.common.entity.ImClientRelease;
import com.im.common.exception.BusinessException;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.HexFormat;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

class HttpClientReleaseArtifactVerifierTest {
    private HttpServer server;
    private ImClientRelease release;

    @BeforeEach
    void setUp() throws Exception {
        byte[] installer = new byte[]{1, 2, 3, 4, 5};
        String sha512 = Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-512").digest(installer));
        String manifestText = """
                version: 0.0.9
                files:
                  - url: ArtTalk-Setup-0.0.9-x64.exe
                    sha512: %s
                    size: %d
                path: ArtTalk-Setup-0.0.9-x64.exe
                sha512: %s
                """.formatted(sha512, installer.length, sha512);
        byte[] manifest = manifestText.getBytes(StandardCharsets.UTF_8);

        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/downloads/arttalk/stable/0.0.9/win-x64/latest.yml",
                exchange -> respond(exchange, manifest));
        server.createContext("/downloads/arttalk/stable/0.0.9/win-x64/ArtTalk-Setup-0.0.9-x64.exe",
                exchange -> respond(exchange, installer));
        server.createContext("/downloads/arttalk/stable/0.0.9/win-x64/ArtTalk-Setup-0.0.9-x64.exe.blockmap",
                exchange -> respond(exchange, new byte[]{9, 8, 7}));
        server.start();

        release = new ImClientRelease();
        release.setVersion("0.0.9");
        release.setManifestName("latest.yml");
        release.setManifestDigest(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(manifest)));
        release.setInstallerName("ArtTalk-Setup-0.0.9-x64.exe");
        release.setInstallerSize((long) installer.length);
        release.setInstallerSha512(sha512);
        release.setUpdateBaseUrl("http://127.0.0.1:" + server.getAddress().getPort()
                + "/downloads/arttalk/stable/0.0.9/win-x64/");
    }

    @AfterEach
    void tearDown() {
        if (server != null) server.stop(0);
    }

    @Test
    void verifiesManifestInstallerAndBlockmapTogether() {
        assertNotNull(new HttpClientReleaseArtifactVerifier().verify(release));
    }

    @Test
    void rejectsManifestDigestMismatch() {
        release.setManifestDigest("0".repeat(64));
        assertThrows(BusinessException.class, () -> new HttpClientReleaseArtifactVerifier().verify(release));
    }

    private void respond(com.sun.net.httpserver.HttpExchange exchange, byte[] body) throws java.io.IOException {
        exchange.sendResponseHeaders(200, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }
}

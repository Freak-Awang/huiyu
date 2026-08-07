package com.im.server.service.impl;

import com.im.common.entity.ImClientRelease;
import com.im.common.exception.BusinessException;
import com.im.server.service.ClientReleaseArtifactVerifier;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** HTTPS implementation of the pre-publish manifest/EXE/blockmap verification gate. */
@Component
public class HttpClientReleaseArtifactVerifier implements ClientReleaseArtifactVerifier {
    private static final int MAX_MANIFEST_BYTES = 256 * 1024;
    private static final long MAX_BLOCKMAP_BYTES = 64L * 1024 * 1024;
    private final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    @Override
    public LocalDateTime verify(ImClientRelease release) {
        try {
            URI base = URI.create(release.getUpdateBaseUrl());
            requireTrustedTransport(base);
            byte[] manifest = getBytes(base.resolve(release.getManifestName()), MAX_MANIFEST_BYTES);
            String manifestText = new String(manifest, java.nio.charset.StandardCharsets.UTF_8);
            String digest = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(manifest));
            if (!digest.equalsIgnoreCase(release.getManifestDigest())) fail("Manifest digest mismatch");
            if (!lineValue(manifestText, "version").equals(release.getVersion())) fail("Manifest version mismatch");

            Matcher installer = Pattern.compile("(?m)^\\s*-\\s*url:\\s*[\"']?(?<name>[^\"'\\r\\n]+\\.exe)[\"']?\\s*$")
                    .matcher(manifestText);
            if (!installer.find() || !installer.group("name").trim().equals(release.getInstallerName())) {
                fail("Manifest installer path mismatch");
            }
            String fileEntryPattern = "(?m)^\\s*-\\s*url:\\s*[\"']?"
                    + Pattern.quote(release.getInstallerName()) + "[\"']?\\s*\\R"
                    + "\\s*sha512:\\s*" + Pattern.quote(release.getInstallerSha512()) + "\\s*\\R"
                    + "\\s*size:\\s*" + release.getInstallerSize() + "\\s*$";
            if (!Pattern.compile(fileEntryPattern).matcher(manifestText).find()) {
                fail("Manifest installer file entry mismatch");
            }
            String primaryPathPattern = "(?m)^path:\\s*[\"']?" + Pattern.quote(release.getInstallerName())
                    + "[\"']?\\s*\\Rsha512:\\s*" + Pattern.quote(release.getInstallerSha512()) + "\\s*$";
            if (!Pattern.compile(primaryPathPattern).matcher(manifestText).find()) {
                fail("Manifest primary path or SHA-512 mismatch");
            }

            DigestResult installerDigest = getDigest(base.resolve(release.getInstallerName()), "SHA-512", release.getInstallerSize());
            if (installerDigest.size() != release.getInstallerSize()) fail("Installer response size mismatch");
            if (!Base64.getEncoder().encodeToString(installerDigest.digest()).equals(release.getInstallerSha512())) {
                fail("Installer response SHA-512 mismatch");
            }
            DigestResult blockmap = getDigest(base.resolve(release.getInstallerName() + ".blockmap"), "SHA-256", MAX_BLOCKMAP_BYTES);
            if (blockmap.size() <= 0) fail("Blockmap is empty");
            return LocalDateTime.now();
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(409, "Release artifact verification failed: " + safeMessage(e));
        }
    }

    private byte[] getBytes(URI uri, int maxBytes) throws Exception {
        HttpResponse<byte[]> response = client.send(request(uri), HttpResponse.BodyHandlers.ofByteArray());
        if (response.statusCode() != 200) fail("Artifact returned HTTP " + response.statusCode());
        if (response.body().length == 0 || response.body().length > maxBytes) fail("Artifact response size is invalid");
        return response.body();
    }

    private DigestResult getDigest(URI uri, String algorithm, long maxBytes) throws Exception {
        HttpResponse<InputStream> response = client.send(request(uri), HttpResponse.BodyHandlers.ofInputStream());
        if (response.statusCode() != 200) {
            response.body().close();
            fail("Artifact returned HTTP " + response.statusCode());
        }
        MessageDigest digest = MessageDigest.getInstance(algorithm);
        long total = 0;
        try (InputStream input = response.body()) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = input.read(buffer)) >= 0) {
                total += read;
                if (total > maxBytes) fail("Artifact response exceeds the expected size");
                digest.update(buffer, 0, read);
            }
        }
        return new DigestResult(total, digest.digest());
    }

    private HttpRequest request(URI uri) {
        requireTrustedTransport(uri);
        return HttpRequest.newBuilder(uri).timeout(Duration.ofMinutes(5)).GET().build();
    }

    private void requireTrustedTransport(URI uri) {
        String host = uri.getHost();
        boolean loopback = "http".equalsIgnoreCase(uri.getScheme())
                && ("localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host) || "::1".equals(host));
        if (host == null || (!"https".equalsIgnoreCase(uri.getScheme()) && !loopback)) {
            fail("Artifact URL must use HTTPS");
        }
    }

    private String lineValue(String value, String key) {
        Matcher matcher = Pattern.compile("(?m)^" + Pattern.quote(key) + ":\\s*[\"']?(?<value>[^\"'\\r\\n]+)[\"']?\\s*$")
                .matcher(value);
        if (!matcher.find()) fail("Manifest is missing " + key);
        return matcher.group("value").trim();
    }

    private void fail(String message) {
        throw new BusinessException(409, message);
    }

    private String safeMessage(Exception exception) {
        String value = exception.getMessage();
        return value == null || value.isBlank() ? exception.getClass().getSimpleName() : value;
    }

    private record DigestResult(long size, byte[] digest) {}
}

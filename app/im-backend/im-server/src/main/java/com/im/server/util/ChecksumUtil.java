package com.im.server.util;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * 文件校验和工具，用于更新包 SHA256 完整性校验。
 */
public final class ChecksumUtil {

    private ChecksumUtil() {
    }

    /**
     * 计算文件的 SHA256 十六进制摘要。
     *
     * @param file 目标文件
     * @return 64 位小写十六进制字符串
     */
    public static String sha256(Path file) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream is = Files.newInputStream(file);
                 DigestInputStream dis = new DigestInputStream(is, digest)) {
                byte[] buffer = new byte[8192];
                while (dis.read(buffer) != -1) {
                    // 流式读取，摘要随读随算
                }
            }
            return toHex(digest.digest());
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 algorithm unavailable", e);
        }
    }

    private static String toHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}

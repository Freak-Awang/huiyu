package com.im.server.service;

import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;

public final class ImageTypeDetector {

    private ImageTypeDetector() {
    }

    public static String detect(MultipartFile file) throws IOException {
        try (InputStream input = file.getInputStream()) {
            return detect(input);
        }
    }

    public static String detect(InputStream input) throws IOException {
        byte[] header = input.readNBytes(12);
        if (header.length >= 8
                && unsigned(header[0]) == 0x89
                && header[1] == 'P' && header[2] == 'N' && header[3] == 'G'
                && unsigned(header[4]) == 0x0D && unsigned(header[5]) == 0x0A
                && unsigned(header[6]) == 0x1A && unsigned(header[7]) == 0x0A) {
            return "image/png";
        }
        if (header.length >= 3
                && unsigned(header[0]) == 0xFF
                && unsigned(header[1]) == 0xD8
                && unsigned(header[2]) == 0xFF) {
            return "image/jpeg";
        }
        if (header.length >= 6
                && header[0] == 'G' && header[1] == 'I' && header[2] == 'F'
                && header[3] == '8' && (header[4] == '7' || header[4] == '9') && header[5] == 'a') {
            return "image/gif";
        }
        if (header.length >= 12
                && header[0] == 'R' && header[1] == 'I' && header[2] == 'F' && header[3] == 'F'
                && header[8] == 'W' && header[9] == 'E' && header[10] == 'B' && header[11] == 'P') {
            return "image/webp";
        }
        return null;
    }

    public static boolean isSafeInlineType(String contentType) {
        return "image/png".equals(contentType)
                || "image/jpeg".equals(contentType)
                || "image/gif".equals(contentType)
                || "image/webp".equals(contentType);
    }

    private static int unsigned(byte value) {
        return value & 0xFF;
    }
}

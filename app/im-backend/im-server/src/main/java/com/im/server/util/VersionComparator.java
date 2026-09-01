package com.im.server.util;

/**
 * 语义化版本号比较工具。
 */
public final class VersionComparator {

    private VersionComparator() {
    }

    /**
     * 比较两个语义化版本号。
     *
     * @param v1 版本号 1（如 3.2.5）
     * @param v2 版本号 2
     * @return 负数 v1&lt;v2，0 相等，正数 v1&gt;v2
     */
    public static int compare(String v1, String v2) {
        String[] parts1 = normalize(v1).split("\\.");
        String[] parts2 = normalize(v2).split("\\.");
        int len = Math.max(parts1.length, parts2.length);
        for (int i = 0; i < len; i++) {
            int p1 = i < parts1.length ? parsePart(parts1[i]) : 0;
            int p2 = i < parts2.length ? parsePart(parts2[i]) : 0;
            if (p1 != p2) {
                return p1 - p2;
            }
        }
        return 0;
    }

    private static String normalize(String version) {
        if (version == null) {
            return "0";
        }
        String v = version.trim();
        // 去掉 v 前缀与预发布后缀（如 v3.2.5-beta -> 3.2.5）
        if (v.startsWith("v") || v.startsWith("V")) {
            v = v.substring(1);
        }
        int dash = v.indexOf('-');
        return dash >= 0 ? v.substring(0, dash) : v;
    }

    private static int parsePart(String part) {
        try {
            return Integer.parseInt(part.trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}

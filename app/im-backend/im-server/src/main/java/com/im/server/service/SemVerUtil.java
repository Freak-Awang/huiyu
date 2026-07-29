package com.im.server.service;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 语义化版本工具类：遵循 SemVer 2.0 规范校验和比较版本号。
 */
public final class SemVerUtil {
    private static final Pattern SEMVER = Pattern.compile(
            "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$");

    private SemVerUtil() {}

    /**
     * 校验字符串是否为合法语义化版本号。
     *
     * @param value 版本号字符串
     * @return 是否合法
     */
    public static boolean isValid(String value) {
        return value != null && SEMVER.matcher(value.trim()).matches();
    }

    /**
     * 比较两个语义化版本号。
     *
     * @param left 左操作数
     * @param right 右操作数
     * @return 负数表示 left 较小，0 表示相等，正数表示 left 较大
     * @throws IllegalArgumentException 版本号不合法时抛出
     */
    public static int compare(String left, String right) {
        Version a = parse(left);
        Version b = parse(right);
        int core = Integer.compare(a.major, b.major);
        if (core == 0) core = Integer.compare(a.minor, b.minor);
        if (core == 0) core = Integer.compare(a.patch, b.patch);
        if (core != 0) return core;
        if (a.pre.isEmpty() && b.pre.isEmpty()) return 0;
        if (a.pre.isEmpty()) return 1;
        if (b.pre.isEmpty()) return -1;
        int length = Math.max(a.pre.size(), b.pre.size());
        for (int i = 0; i < length; i++) {
            if (i >= a.pre.size()) return -1;
            if (i >= b.pre.size()) return 1;
            String av = a.pre.get(i);
            String bv = b.pre.get(i);
            boolean an = av.matches("\\d+");
            boolean bn = bv.matches("\\d+");
            int result = an && bn ? Long.compare(Long.parseLong(av), Long.parseLong(bv))
                    : an ? -1 : bn ? 1 : av.compareTo(bv);
            if (result != 0) return result;
        }
        return 0;
    }

    private static Version parse(String value) {
        Matcher matcher = SEMVER.matcher(value == null ? "" : value.trim());
        if (!matcher.matches()) throw new IllegalArgumentException("Invalid semantic version: " + value);
        List<String> pre = new ArrayList<>();
        if (matcher.group(4) != null) pre.addAll(List.of(matcher.group(4).split("\\.")));
        return new Version(Integer.parseInt(matcher.group(1)), Integer.parseInt(matcher.group(2)),
                Integer.parseInt(matcher.group(3)), pre);
    }

    private record Version(int major, int minor, int patch, List<String> pre) {}
}

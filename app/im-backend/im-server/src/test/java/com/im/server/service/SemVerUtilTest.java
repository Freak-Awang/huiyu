package com.im.server.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 语义化版本工具测试，验证版本比较和格式校验。
 *
 * <p>测试范围：SemVerUtil.compare（版本号大小比较）和 isValid（格式合法性校验）。</p>
 */
class SemVerUtilTest {

    /**
     * 验证语义化版本比较：正式版 > 预发布版、数字部分逐位比较、预发布标识按数字比较、
     * 构建元数据不影响比较结果。
     */
    @Test
    void comparesStableAndPrereleaseVersions() {
        assertTrue(SemVerUtil.compare("0.0.4", "0.0.3") > 0); // 正式版数字比较
        assertTrue(SemVerUtil.compare("1.0.0", "1.0.0-beta.2") > 0); // 正式版 > 预发布
        assertTrue(SemVerUtil.compare("1.0.0-beta.10", "1.0.0-beta.2") > 0); // 预发布数字比较
        assertEquals(0, SemVerUtil.compare("1.2.3+build.1", "1.2.3+build.2")); // build 元数据忽略
    }

    /**
     * 验证非法版本号被拒绝：缺少 patch 号、前导零、合法预发布版本。
     */
    @Test
    void rejectsNonSemanticVersions() {
        assertFalse(SemVerUtil.isValid("1.2")); // 缺少 patch
        assertFalse(SemVerUtil.isValid("01.2.3")); // 前导零
        assertTrue(SemVerUtil.isValid("0.1.0-beta.1")); // 合法预发布
    }
}


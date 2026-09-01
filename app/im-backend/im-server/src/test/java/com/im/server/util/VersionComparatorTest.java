package com.im.server.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 语义化版本比较工具测试。
 */
class VersionComparatorTest {

    @Test
    void comparesNumericSegments() {
        assertThat(VersionComparator.compare("3.2.5", "3.2.4")).isPositive();
        assertThat(VersionComparator.compare("3.2.4", "3.2.5")).isNegative();
        assertThat(VersionComparator.compare("3.2.5", "3.2.5")).isZero();
        assertThat(VersionComparator.compare("3.10.0", "3.9.9")).isPositive();
    }

    @Test
    void padsMissingSegmentsWithZero() {
        assertThat(VersionComparator.compare("3.2", "3.2.0")).isZero();
        assertThat(VersionComparator.compare("3.2.1", "3.2")).isPositive();
    }

    @Test
    void toleratesPrefixAndPrereleaseSuffix() {
        assertThat(VersionComparator.compare("v3.2.5", "3.2.5")).isZero();
        assertThat(VersionComparator.compare("3.2.5-beta", "3.2.5")).isZero();
        assertThat(VersionComparator.compare(null, "0.0.1")).isNegative();
    }
}

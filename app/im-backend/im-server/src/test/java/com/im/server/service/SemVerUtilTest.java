package com.im.server.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class SemVerUtilTest {
    @Test
    void comparesStableAndPrereleaseVersions() {
        assertTrue(SemVerUtil.compare("0.0.4", "0.0.3") > 0);
        assertTrue(SemVerUtil.compare("1.0.0", "1.0.0-beta.2") > 0);
        assertTrue(SemVerUtil.compare("1.0.0-beta.10", "1.0.0-beta.2") > 0);
        assertEquals(0, SemVerUtil.compare("1.2.3+build.1", "1.2.3+build.2"));
    }

    @Test
    void rejectsNonSemanticVersions() {
        assertFalse(SemVerUtil.isValid("1.2"));
        assertFalse(SemVerUtil.isValid("01.2.3"));
        assertTrue(SemVerUtil.isValid("0.1.0-beta.1"));
    }
}


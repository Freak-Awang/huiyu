package com.im.server.security;

public record AuthenticatedUser(
        Long userId,
        String username,
        String role,
        Integer tokenVersion) {
}

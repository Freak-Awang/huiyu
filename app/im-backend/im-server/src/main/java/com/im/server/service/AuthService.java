package com.im.server.service;

import com.im.common.dto.LoginRequest;
import com.im.common.dto.LoginResponse;
/**
 * Intent: AuthService defines the service contract used by controllers and async workflows.
 */

public interface AuthService {

    LoginResponse login(LoginRequest request);

    void logout(String token);

    LoginResponse refresh(String token);
}

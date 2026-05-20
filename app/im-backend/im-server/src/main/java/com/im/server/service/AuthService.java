package com.im.server.service;

import com.im.common.dto.LoginRequest;
import com.im.common.dto.LoginResponse;

public interface AuthService {

    LoginResponse login(LoginRequest request);

    void logout(String token);
}

package com.im.server.controller;

import com.im.common.dto.UserSettingsVO;
import com.im.common.result.Result;
import com.im.server.service.UserSettingsService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/settings")
public class UserSettingsController {

    @Autowired
    private UserSettingsService userSettingsService;

    @GetMapping
    public Result<UserSettingsVO> getSettings() {
        return Result.success(userSettingsService.getSettings(getCurrentUserId()));
    }

    @PutMapping
    public Result<UserSettingsVO> saveSettings(@RequestBody UserSettingsVO settings) {
        return Result.success(userSettingsService.saveSettings(getCurrentUserId(), settings));
    }

    private Long getCurrentUserId() {
        String userIdStr = (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return Long.parseLong(userIdStr);
    }
}

package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.ImUserSettings;
import org.apache.ibatis.annotations.Mapper;

/**
 * 用户设置 Mapper：对应 im_user_settings 表，管理用户客户端个性化设置。
 */
@Mapper
public interface UserSettingsMapper extends BaseMapper<ImUserSettings> {
}

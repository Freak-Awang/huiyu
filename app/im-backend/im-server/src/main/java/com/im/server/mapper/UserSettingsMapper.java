package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.ImUserSettings;
import org.apache.ibatis.annotations.Mapper;

/**
 * ?????UserSettingsMapper maps domain persistence operations to MyBatis-Plus data access.
 */
@Mapper
public interface UserSettingsMapper extends BaseMapper<ImUserSettings> {
}

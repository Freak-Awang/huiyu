package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.AppVersion;
import org.apache.ibatis.annotations.Mapper;

/**
 * 客户端版本 Mapper。
 */
@Mapper
public interface AppVersionMapper extends BaseMapper<AppVersion> {
}

package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.GrayStrategy;
import org.apache.ibatis.annotations.Mapper;

/**
 * 灰度发布策略 Mapper。
 */
@Mapper
public interface GrayStrategyMapper extends BaseMapper<GrayStrategy> {
}

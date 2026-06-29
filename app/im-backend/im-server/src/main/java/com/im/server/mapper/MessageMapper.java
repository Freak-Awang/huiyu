package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.ImMessage;
import org.apache.ibatis.annotations.Mapper;

/**
 * ?????MessageMapper maps domain persistence operations to MyBatis-Plus data access.
 */
@Mapper
public interface MessageMapper extends BaseMapper<ImMessage> {
}

package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.ImMessageDelivery;
import org.apache.ibatis.annotations.Mapper;

/**
 * ?????MessageDeliveryMapper maps domain persistence operations to MyBatis-Plus data access.
 */
@Mapper
public interface MessageDeliveryMapper extends BaseMapper<ImMessageDelivery> {
}

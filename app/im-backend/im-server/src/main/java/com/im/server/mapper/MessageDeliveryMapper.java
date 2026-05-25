package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.ImMessageDelivery;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface MessageDeliveryMapper extends BaseMapper<ImMessageDelivery> {
}

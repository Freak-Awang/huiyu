package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.ClientUpdateEvent;
import org.apache.ibatis.annotations.Mapper;

/**
 * 客户端更新遥测事件 Mapper。
 */
@Mapper
public interface ClientUpdateEventMapper extends BaseMapper<ClientUpdateEvent> {
}

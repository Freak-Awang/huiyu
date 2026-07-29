package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.ImMessage;
import org.apache.ibatis.annotations.Mapper;

/**
 * 消息 Mapper：对应 im_message 表，提供聊天消息的基础 CRUD。
 */
@Mapper
public interface MessageMapper extends BaseMapper<ImMessage> {
}

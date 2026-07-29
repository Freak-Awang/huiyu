package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.ImConversation;
import org.apache.ibatis.annotations.Mapper;

/**
 * 会话 Mapper：对应 im_conversation 表，提供会话基础 CRUD。
 */
@Mapper
public interface ConversationMapper extends BaseMapper<ImConversation> {
}

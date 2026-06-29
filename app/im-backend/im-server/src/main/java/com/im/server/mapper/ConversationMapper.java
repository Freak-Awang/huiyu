package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.ImConversation;
import org.apache.ibatis.annotations.Mapper;

/**
 * Intent: ConversationMapper maps domain persistence operations to MyBatis-Plus data access.
 */
@Mapper
public interface ConversationMapper extends BaseMapper<ImConversation> {
}

package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.ImConversationMember;
import org.apache.ibatis.annotations.Mapper;

/**
 * 会话成员 Mapper：对应 im_conversation_member 表，管理会话成员关系、角色及已读状态。
 */
@Mapper
public interface ConversationMemberMapper extends BaseMapper<ImConversationMember> {
}

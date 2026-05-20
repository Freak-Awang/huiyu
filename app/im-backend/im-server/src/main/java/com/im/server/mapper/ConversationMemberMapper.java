package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.ImConversationMember;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ConversationMemberMapper extends BaseMapper<ImConversationMember> {
}

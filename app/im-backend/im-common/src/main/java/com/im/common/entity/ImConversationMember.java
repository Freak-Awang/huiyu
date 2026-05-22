package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("im_conversation_member")
public class ImConversationMember {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long conversationId;
    private Long userId;
    private String role;
    private Integer isPinned;
    private Integer isMuted;
    private LocalDateTime lastReadTime;
    private LocalDateTime joinTime;
}

package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("im_conversation")
public class ImConversation {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Integer type;
    private String name;
    private String avatar;
    private Long ownerId;
    private String announcement;
    private Long announcementUpdatedBy;
    private LocalDateTime announcementUpdatedAt;
    private String lastMessage;
    private LocalDateTime lastMessageTime;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}

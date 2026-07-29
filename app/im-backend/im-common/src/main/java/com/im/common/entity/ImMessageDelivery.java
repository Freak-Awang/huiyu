package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 消息投递状态实体，按接收者维度记录消息的送达与已读状态，支撑已读回执。
 */
@Data
@TableName("im_message_delivery")
public class ImMessageDelivery {
    @TableId(type = IdType.AUTO)
    private Long id; // 主键ID
    private Long messageId; // 消息ID
    private Long conversationId; // 所属会话ID
    private Long userId; // 接收者ID
    private Integer delivered; // 是否已送达：0-否，1-是
    private LocalDateTime deliveredTime; // 送达时间
    private Integer readStatus; // 已读状态：0-未读，1-已读
    private LocalDateTime readTime; // 已读时间
    private LocalDateTime createTime; // 创建时间
}

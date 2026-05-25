package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("im_message_delivery")
public class ImMessageDelivery {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long messageId;
    private Long conversationId;
    private Long userId;
    private Integer delivered;
    private LocalDateTime deliveredTime;
    private LocalDateTime createTime;
}

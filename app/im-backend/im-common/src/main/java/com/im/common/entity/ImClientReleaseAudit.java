package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** 客户端发布生命周期与验证决策的只追加审计记录。 */
@Data
@TableName("im_client_release_audit")
public class ImClientReleaseAudit {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long releaseId;
    private String action;
    private String reason;
    private Long operatorId;
    private String details;
    private LocalDateTime createTime;
}

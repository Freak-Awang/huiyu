package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import lombok.Data;
import java.time.LocalDateTime;

/** Durable authorization only. File content, paths and manifests stay on clients. */
@Data
@TableName("im_p2p_share")
public class ImP2pShare {
    @TableId(type = IdType.INPUT)
    private String transferId;
    private Long messageId;
    private String state;
    private Long revision;
    private LocalDateTime updatedAt;
}

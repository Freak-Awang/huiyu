package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("im_client_release_target")
public class ImClientReleaseTarget {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long releaseId;
    private String targetType;
    private String targetValue;
    private String mode;
    private LocalDateTime createTime;
}


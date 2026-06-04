package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("im_file_upload_part")
public class ImFileUploadPart {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String uploadId;
    private Integer partNumber;
    private Long partSize;
    private String objectKey;
    private String etag;
    private String status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}

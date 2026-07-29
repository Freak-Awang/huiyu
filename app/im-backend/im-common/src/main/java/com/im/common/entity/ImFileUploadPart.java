package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 文件上传分片实体，记录断点续传中每个分片的上传状态，支撑续传与合并。
 */
@Data
@TableName("im_file_upload_part")
public class ImFileUploadPart {
    @TableId(type = IdType.AUTO)
    private Long id; // 主键ID
    private String uploadId; // 关联的上传任务ID
    private Integer partNumber; // 分片编号（从1开始）
    private Long partSize; // 分片大小（字节）
    private String objectKey; // 分片存储对象键
    private String etag; // 分片ETag（对象存储合并分片时校验用）
    private String status; // 分片状态（如已上传/已合并）
    private LocalDateTime createTime; // 创建时间
    private LocalDateTime updateTime; // 更新时间
}

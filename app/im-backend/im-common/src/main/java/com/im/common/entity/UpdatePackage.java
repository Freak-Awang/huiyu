package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 客户端更新包实体，记录全量安装包与增量补丁的文件元数据及校验信息。
 */
@Data
@TableName("update_package")
public class UpdatePackage {
    /** 包类型：全量包 */
    public static final String TYPE_FULL = "full";
    /** 包类型：增量补丁 */
    public static final String TYPE_PATCH = "patch";

    @TableId(type = IdType.AUTO)
    private Long id; // 主键
    private Long versionId; // 关联 app_version.id
    private String packageType; // full/patch
    private String fromVersion; // 增量补丁的起始版本
    private String fileName; // 文件名
    private String filePath; // 服务器存储相对路径
    private Long fileSize; // 文件大小（字节）
    private String checksumSha256; // SHA256 校验值
    private String signature; // RSA 签名（Base64）
    private Integer downloadCount; // 下载次数
    private LocalDateTime createTime; // 创建时间
}

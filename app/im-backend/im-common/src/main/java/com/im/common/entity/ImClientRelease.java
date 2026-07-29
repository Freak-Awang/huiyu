package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 客户端版本发布实体，记录各平台客户端的安装包与灰度发布信息。
 */
@Data
@TableName("im_client_release")
public class ImClientRelease {
    @TableId(type = IdType.AUTO)
    private Long id; // 主键ID
    private String version; // 版本号
    private String channel; // 发布渠道（如正式/内测）
    private String platform; // 目标平台（如Windows/macOS/Linux）
    private String arch; // 目标架构（如x64/arm64）
    private String releaseName; // 发布名称
    private String releaseNotes; // 版本更新说明
    private String minimumVersion; // 最低可用版本（低于此版本强制升级）
    private Boolean forceUpdate; // 是否强制更新
    private Integer rolloutPercentage; // 灰度发布百分比
    private String updateBaseUrl; // 更新包下载基础地址
    private String installerName; // 安装包文件名
    private Long installerSize; // 安装包大小（字节）
    private String installerSha512; // 安装包SHA-512校验值
    private String status; // 发布状态（如草稿/已发布/已下线）
    private LocalDateTime publishedAt; // 发布时间
    private Long createdBy; // 创建人ID
    private LocalDateTime createTime; // 创建时间
    private LocalDateTime updateTime; // 更新时间
}


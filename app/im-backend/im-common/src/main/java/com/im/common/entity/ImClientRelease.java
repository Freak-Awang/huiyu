package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("im_client_release")
public class ImClientRelease {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String version;
    private String channel;
    private String platform;
    private String arch;
    private String releaseName;
    private String releaseNotes;
    private String minimumVersion;
    private Boolean forceUpdate;
    private Integer rolloutPercentage;
    private String updateBaseUrl;
    private String installerName;
    private Long installerSize;
    private String installerSha512;
    private String status;
    private LocalDateTime publishedAt;
    private Long createdBy;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}


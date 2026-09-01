package com.im.common.dto.update;

import lombok.Data;

import java.util.List;

/**
 * 客户端更新检查响应，告知客户端是否有可用更新及下载信息。
 */
@Data
public class UpdateCheckResponse {
    private boolean hasUpdate; // 是否有可用更新
    private String updateType; // none/incremental/full/force
    private String targetVersion; // 目标版本号
    private Integer targetBuild; // 目标构建号
    private List<String> changelog; // 更新日志条目
    private PackageInfo downloadInfo; // 更新包下载信息
    private PublishStrategy publishStrategy; // 发布策略信息

    /**
     * 更新包下载信息。
     */
    @Data
    public static class PackageInfo {
        private Long packageId; // 更新包 ID
        private String packageType; // full/patch
        private String url; // 下载地址（支持断点续传）
        private Long size; // 文件大小（字节）
        private String checksum; // sha256:<hex>
        private String signature; // rsa:<base64>
        private String fromVersion; // 增量补丁起始版本
        private String fileName; // 文件名
    }

    /**
     * 发布策略信息。
     */
    @Data
    public static class PublishStrategy {
        private String type; // all/gray/whitelist
        private Integer grayPercent; // 灰度百分比
        private String forceAfter; // 强制更新截止时间 ISO 8601（可空）
    }

    /**
     * 构建"无更新"响应。
     *
     * @return 无更新响应
     */
    public static UpdateCheckResponse noUpdate() {
        UpdateCheckResponse response = new UpdateCheckResponse();
        response.setHasUpdate(false);
        response.setUpdateType("none");
        return response;
    }
}

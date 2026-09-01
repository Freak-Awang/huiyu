package com.im.server.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 客户端在线更新服务属性配置。
 * <p>
 * 绑定 {@code update.*} 前缀的配置项，涵盖下载基础地址、更新包存储路径、
 * xdelta3 增量工具路径、RSA 签名密钥路径及补丁生成策略。
 * </p>
 */
@Component
@ConfigurationProperties(prefix = "update")
public class UpdateServerProperties {
    /** 对外下载基础地址（用于拼接更新包下载 URL），为空时使用请求来源地址 */
    private String baseDownloadUrl = "";
    /** 更新包存储根目录 */
    private String storagePath = "./updates";
    /** xdelta3 可执行文件路径（增量补丁生成） */
    private String xdelta3Path = "xdelta3";
    /** RSA 私钥路径（PEM，PKCS8），为空则跳过签名 */
    private String rsaPrivateKeyPath = "";
    /** RSA 公钥路径（PEM，X509），为空则跳过验签 */
    private String rsaPublicKeyPath = "";
    /** 每个新版本最多为最近几个历史版本生成增量补丁 */
    private Integer maxPatchSourceVersions = 3;
    /** 单设备检测更新最小间隔秒数（防刷） */
    private Integer checkIntervalSeconds = 0;

    public String getBaseDownloadUrl() {
        return baseDownloadUrl;
    }

    public void setBaseDownloadUrl(String baseDownloadUrl) {
        this.baseDownloadUrl = baseDownloadUrl;
    }

    public String getStoragePath() {
        return storagePath;
    }

    public void setStoragePath(String storagePath) {
        this.storagePath = storagePath;
    }

    public String getXdelta3Path() {
        return xdelta3Path;
    }

    public void setXdelta3Path(String xdelta3Path) {
        this.xdelta3Path = xdelta3Path;
    }

    public String getRsaPrivateKeyPath() {
        return rsaPrivateKeyPath;
    }

    public void setRsaPrivateKeyPath(String rsaPrivateKeyPath) {
        this.rsaPrivateKeyPath = rsaPrivateKeyPath;
    }

    public String getRsaPublicKeyPath() {
        return rsaPublicKeyPath;
    }

    public void setRsaPublicKeyPath(String rsaPublicKeyPath) {
        this.rsaPublicKeyPath = rsaPublicKeyPath;
    }

    public Integer getMaxPatchSourceVersions() {
        return maxPatchSourceVersions;
    }

    public void setMaxPatchSourceVersions(Integer maxPatchSourceVersions) {
        this.maxPatchSourceVersions = maxPatchSourceVersions;
    }

    public Integer getCheckIntervalSeconds() {
        return checkIntervalSeconds;
    }

    public void setCheckIntervalSeconds(Integer checkIntervalSeconds) {
        this.checkIntervalSeconds = checkIntervalSeconds;
    }
}

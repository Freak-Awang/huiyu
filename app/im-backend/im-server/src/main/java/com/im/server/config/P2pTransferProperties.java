package com.im.server.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 局域网 P2P 文件传输配置。文件正文不会经过服务端，这些限制仅用于
 * 约束信令和消息元数据，避免客户端构造超大传输任务。
 */
@Component
@ConfigurationProperties(prefix = "p2p.file-transfer")
public class P2pTransferProperties {

    private boolean enabled = false;
    private long maxFileSize = 2_147_483_648L;
    private long maxFolderSize = 21_474_836_480L;
    private int maxFolderFiles = 10_000;
    private int maxSignalBytes = 65_536;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public long getMaxFileSize() {
        return maxFileSize;
    }

    public void setMaxFileSize(long maxFileSize) {
        this.maxFileSize = maxFileSize;
    }

    public long getMaxFolderSize() {
        return maxFolderSize;
    }

    public void setMaxFolderSize(long maxFolderSize) {
        this.maxFolderSize = maxFolderSize;
    }

    public int getMaxFolderFiles() {
        return maxFolderFiles;
    }

    public void setMaxFolderFiles(int maxFolderFiles) {
        this.maxFolderFiles = maxFolderFiles;
    }

    public int getMaxSignalBytes() {
        return maxSignalBytes;
    }

    public void setMaxSignalBytes(int maxSignalBytes) {
        this.maxSignalBytes = maxSignalBytes;
    }
}

package com.im.server.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 局域网 P2P 文件传输配置。文件正文不会经过服务端，这些限制仅用于
 * 约束信令和清单条目数量，不限制文件或文件夹的传输字节数。
 */
@Component
@ConfigurationProperties(prefix = "p2p.file-transfer")
public class P2pTransferProperties {

    private boolean enabled = true;
    /** JSON byte counts must remain exactly representable by desktop JavaScript clients. */
    public static final long MAX_SAFE_BYTE_COUNT = 9_007_199_254_740_991L;
    private int maxFolderFiles = 10_000;
    private int maxFolderDirectories = 10_000;
    private int maxSignalBytes = 65_536;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
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

    public int getMaxFolderDirectories() { return maxFolderDirectories; }

    public void setMaxFolderDirectories(int maxFolderDirectories) { this.maxFolderDirectories = maxFolderDirectories; }

    public void setMaxSignalBytes(int maxSignalBytes) {
        this.maxSignalBytes = maxSignalBytes;
    }
}

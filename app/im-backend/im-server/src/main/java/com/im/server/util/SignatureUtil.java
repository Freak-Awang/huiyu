package com.im.server.util;

import com.im.server.config.UpdateServerProperties;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

/**
 * 更新包 RSA 签名工具（SHA256withRSA）。
 * <p>
 * 服务端持私钥对更新包摘要签名，客户端内置公钥验签，确认发布者身份。
 * 密钥路径未配置时降级为不签名（仅 SHA256 校验），便于内网快速部署。
 * </p>
 */
@Component
public class SignatureUtil {

    private static final Logger log = LoggerFactory.getLogger(SignatureUtil.class);

    private final UpdateServerProperties properties;

    private PrivateKey privateKey;
    private PublicKey publicKey;

    public SignatureUtil(UpdateServerProperties properties) {
        this.properties = properties;
    }

    @PostConstruct
    public void init() {
        try {
            if (StringUtils.hasText(properties.getRsaPrivateKeyPath())
                    && Files.exists(Paths.get(properties.getRsaPrivateKeyPath()))) {
                this.privateKey = loadPrivateKey(properties.getRsaPrivateKeyPath());
                log.info("Update package RSA private key loaded");
            }
            if (StringUtils.hasText(properties.getRsaPublicKeyPath())
                    && Files.exists(Paths.get(properties.getRsaPublicKeyPath()))) {
                this.publicKey = loadPublicKey(properties.getRsaPublicKeyPath());
                log.info("Update package RSA public key loaded");
            }
            if (privateKey == null) {
                log.warn("Update RSA key not configured, package signature disabled (sha256 only)");
            }
        } catch (Exception e) {
            log.error("Failed to load update RSA keys, signature disabled", e);
        }
    }

    /**
     * 是否已启用签名能力。
     */
    public boolean isSigningEnabled() {
        return privateKey != null;
    }

    /**
     * 对数据签名，返回 Base64 签名值；未配置私钥时返回空字符串。
     *
     * @param data 待签名数据（通常为文件 SHA256）
     * @return Base64 签名或空字符串
     */
    public String sign(String data) {
        if (privateKey == null) {
            return "";
        }
        try {
            Signature signature = Signature.getInstance("SHA256withRSA");
            signature.initSign(privateKey);
            signature.update(data.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(signature.sign());
        } catch (Exception e) {
            throw new IllegalStateException("Failed to sign update package", e);
        }
    }

    /**
     * 验证签名；未配置公钥时视为验证通过（降级模式）。
     *
     * @param data 原始数据
     * @param sign Base64 签名值
     * @return 验证是否通过
     */
    public boolean verify(String data, String sign) {
        if (publicKey == null) {
            return true;
        }
        try {
            Signature signature = Signature.getInstance("SHA256withRSA");
            signature.initVerify(publicKey);
            signature.update(data.getBytes(StandardCharsets.UTF_8));
            return signature.verify(Base64.getDecoder().decode(sign));
        } catch (Exception e) {
            log.warn("Signature verification error: {}", e.getMessage());
            return false;
        }
    }

    private PrivateKey loadPrivateKey(String path) throws Exception {
        String key = Files.readString(Paths.get(path))
                .replace("-----BEGIN PRIVATE KEY-----", "")
                .replace("-----END PRIVATE KEY-----", "")
                .replaceAll("\\s", "");
        byte[] decoded = Base64.getDecoder().decode(key);
        return KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(decoded));
    }

    private PublicKey loadPublicKey(String path) throws Exception {
        String key = Files.readString(Paths.get(path))
                .replace("-----BEGIN PUBLIC KEY-----", "")
                .replace("-----END PUBLIC KEY-----", "")
                .replaceAll("\\s", "");
        byte[] decoded = Base64.getDecoder().decode(key);
        return KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(decoded));
    }
}

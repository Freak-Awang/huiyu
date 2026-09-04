package com.im.server.service;

import com.im.common.exception.BusinessException;
import com.im.server.config.FileStorageProperties;
import com.im.server.mapper.FileMapper;
import com.im.server.mapper.UserMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.when;

/**
 * 媒体配额服务测试，验证用户已存储图片和头像的配额计算。
 *
 * <p>测试范围：FileQuotaService 的 assertCanStore 方法，覆盖锁用户→计算配额→超限校验流程。</p>
 */
@ExtendWith(MockitoExtension.class)
class FileQuotaServiceTest {

    @Mock
    private FileMapper fileMapper;

    @Mock
    private UserMapper userMapper;

    private FileQuotaService quotaService;

    @BeforeEach
    void setUp() {
        FileStorageProperties properties = new FileStorageProperties();
        properties.setUserQuotaBytes(100L);
        quotaService = new FileQuotaService(fileMapper, userMapper, properties);
        when(userMapper.lockById(7L)).thenReturn(7L);
    }

    /**
     * 验证配额检查先锁定用户行（防止并发），再查询已存储媒体字节数，
     * 保证调用顺序正确。
     */
    @Test
    void locksUserBeforeCalculatingStoredBytes() {
        when(fileMapper.sumAvailableBytesByUploader(7L)).thenReturn(40L);

        quotaService.assertCanStore(7L, 40L);

        var order = inOrder(userMapper, fileMapper);
        order.verify(userMapper).lockById(7L); // 先锁行
        order.verify(fileMapper).sumAvailableBytesByUploader(7L); // 再查已存储
    }

    /**
     * 验证已存储(90) + 新媒体(20) = 110 > 配额100 时，
     * 抛出 BusinessException(413)。
     */
    @Test
    void rejectsMediaThatWouldExceedQuota() {
        when(fileMapper.sumAvailableBytesByUploader(7L)).thenReturn(90L);

        assertThatThrownBy(() -> quotaService.assertCanStore(7L, 20L))
                .isInstanceOf(BusinessException.class)
                .hasMessage("User storage quota exceeded")
                .extracting("code")
                .isEqualTo(413);
    }
}

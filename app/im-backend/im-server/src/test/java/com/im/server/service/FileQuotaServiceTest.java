package com.im.server.service;

import com.im.common.exception.BusinessException;
import com.im.server.config.FileStorageProperties;
import com.im.server.mapper.FileMapper;
import com.im.server.mapper.FileUploadMapper;
import com.im.server.mapper.UserMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FileQuotaServiceTest {

    @Mock
    private FileMapper fileMapper;

    @Mock
    private FileUploadMapper uploadMapper;

    @Mock
    private UserMapper userMapper;

    private FileQuotaService quotaService;

    @BeforeEach
    void setUp() {
        FileStorageProperties properties = new FileStorageProperties();
        properties.setUserQuotaBytes(100L);
        quotaService = new FileQuotaService(fileMapper, uploadMapper, userMapper, properties);
        when(userMapper.lockById(7L)).thenReturn(7L);
    }

    @Test
    void locksUserBeforeCalculatingReservedAndStoredBytes() {
        when(fileMapper.sumAvailableBytesByUploader(7L)).thenReturn(40L);
        when(uploadMapper.sumActiveBytesByUploader(7L)).thenReturn(20L);

        quotaService.assertCanStore(7L, 40L);

        var order = inOrder(userMapper, fileMapper, uploadMapper);
        order.verify(userMapper).lockById(7L);
        order.verify(fileMapper).sumAvailableBytesByUploader(7L);
        order.verify(uploadMapper).sumActiveBytesByUploader(7L);
    }

    @Test
    void rejectsUploadThatWouldExceedCombinedQuota() {
        when(fileMapper.sumAvailableBytesByUploader(7L)).thenReturn(60L);
        when(uploadMapper.sumActiveBytesByUploader(7L)).thenReturn(30L);

        assertThatThrownBy(() -> quotaService.assertCanStore(7L, 20L))
                .isInstanceOf(BusinessException.class)
                .hasMessage("User storage quota exceeded")
                .extracting("code")
                .isEqualTo(413);
    }
}

package com.im.server.service;

import com.im.common.entity.ImFile;
import com.im.common.entity.ImConversationMember;
import com.im.common.entity.SysUser;
import com.im.common.exception.BusinessException;
import com.im.server.mapper.ConversationMemberMapper;
import com.im.server.mapper.UserMapper;
import com.im.server.service.storage.FileStorageClient;
import com.im.server.service.storage.FileStorageRouter;
import com.im.server.service.storage.StoredObject;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.ArgumentMatchers.any;

/**
 * 文件下载服务测试，验证下载权限控制（匿名/会话成员）和存储后端路由。
 *
 * <p>测试范围：FileDownloadService 的 getDownloadableFile（权限校验）和 openFile（Range 读取）。</p>
 */
@ExtendWith(MockitoExtension.class)
class FileDownloadServiceTest {

    @Mock
    private FileMetadataService metadataService;

    @Mock
    private ConversationMemberMapper conversationMemberMapper;

    @Mock
    private UserMapper userMapper;

    @Mock
    private FileStorageClient storageClient;

    @Mock
    private FileStorageRouter storageRouter;

    @InjectMocks
    private FileDownloadService fileDownloadService;

    /**
     * 验证匿名用户可下载公开独立文件（conversationId=null 且有引用者）。
     */
    @Test
    void anonymousUserCanDownloadPublicStandaloneFile() {
        ImFile avatar = availableFile(1L);
        avatar.setConversationId(null); // 独立文件，非会话文件
        avatar.setTemporary(0);
        when(metadataService.getById(1L)).thenReturn(avatar);
        when(userMapper.selectCount(any())).thenReturn(1L); // 有用户引用了该文件

        ImFile result = fileDownloadService.getDownloadableFile(null, 1L);

        assertThat(result).isSameAs(avatar);
    }

    /**
     * 验证匿名用户无法下载无引用者的独立文件，应抛出"无权限"异常。
     */
    @Test
    void anonymousUserCannotDownloadUnreferencedStandaloneFile() {
        ImFile file = availableFile(5L);
        file.setConversationId(null);
        file.setTemporary(0);
        when(metadataService.getById(5L)).thenReturn(file);
        when(userMapper.selectCount(any())).thenReturn(0L); // 无用户引用

        assertThatThrownBy(() -> fileDownloadService.getDownloadableFile(null, 5L))
                .isInstanceOf(BusinessException.class)
                .hasMessage("No permission to download this file");
    }

    /**
     * 验证匿名用户无法下载会话文件，返回 403。
     */
    @Test
    void anonymousUserCannotDownloadConversationFile() {
        ImFile conversationFile = availableFile(2L);
        conversationFile.setConversationId(10L); // 属于某会话
        conversationFile.setTemporary(0);
        when(metadataService.getById(2L)).thenReturn(conversationFile);

        assertThatThrownBy(() -> fileDownloadService.getDownloadableFile(null, 2L))
                .isInstanceOf(BusinessException.class)
                .hasMessage("No permission to download this file")
                .extracting("code")
                .isEqualTo(403);
    }

    /**
     * 验证会话成员可以下载所属会话的文件。
     */
    @Test
    void conversationMemberCanDownloadConversationFile() {
        ImFile conversationFile = availableFile(3L);
        conversationFile.setConversationId(10L);
        conversationFile.setTemporary(0);
        SysUser user = new SysUser();
        user.setId(20L);
        user.setRole("user");
        when(metadataService.getById(3L)).thenReturn(conversationFile);
        when(userMapper.selectById(20L)).thenReturn(user);
        when(conversationMemberMapper.selectOne(any())).thenReturn(new ImConversationMember()); // 是会话成员

        assertThat(fileDownloadService.getDownloadableFile(20L, 3L)).isSameAs(conversationFile);
    }

    /**
     * 验证 openFile 根据文件记录的 storageType/bucket 路由到正确的存储后端进行 Range 读取。
     */
    @Test
    void opensFileWithItsPersistedStorageBackend() throws Exception {
        ImFile file = availableFile(4L);
        file.setStorageType("local");
        file.setBucket("local");
        file.setObjectKey("files/legacy.bin");
        StoredObject storedObject = new StoredObject(null, 10L, "application/octet-stream");
        when(storageRouter.clientFor("local", "local")).thenReturn(storageClient);
        when(storageClient.open("files/legacy.bin", 2L, 4L)).thenReturn(storedObject);

        assertThat(fileDownloadService.openFile(file, 2L, 4L)).isSameAs(storedObject);
        verify(storageRouter).clientFor("local", "local");
    }

    private ImFile availableFile(Long id) {
        ImFile file = new ImFile();
        file.setId(id);
        file.setStatus(FileMetadataService.STATUS_AVAILABLE);
        file.setUploaderId(10L);
        return file;
    }
}

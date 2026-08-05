package com.im.server.service.impl;

import com.im.common.dto.ConversationVO;
import com.im.common.dto.CreateConversationRequest;
import com.im.common.dto.TransferConversationOwnerRequest;
import com.im.common.dto.UpdateMemberRoleRequest;
import com.im.common.entity.ImConversation;
import com.im.common.entity.ImConversationMember;
import com.im.common.entity.ImFile;
import com.im.common.entity.ImMessage;
import com.im.common.entity.SysUser;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.common.exception.BusinessException;
import com.im.server.mapper.ConversationMapper;
import com.im.server.mapper.ConversationMemberMapper;
import com.im.server.mapper.FileMapper;
import com.im.server.mapper.FileUploadMapper;
import com.im.server.mapper.MessageMapper;
import com.im.server.mapper.UserMapper;
import com.im.server.service.FileRetentionService;
import com.im.server.service.FileUploadService;
import com.im.server.websocket.WebSocketSessionManager;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 会话服务测试，验证 @所有人 未读计数、成员角色管理、群创建/头像/转让等核心业务逻辑。
 *
 * <p>测试范围：ConversationServiceImpl 的 getById（未读计数）、updateMemberRole（角色管理）、
 * createConversation（默认头像状态）、updateAvatar/restoreDefaultAvatar（头像管理）、
 * transferOwner（群主转让）。</p>
 */
@ExtendWith(MockitoExtension.class)
class ConversationServiceImplTest {

    @Mock
    private ConversationMapper conversationMapper;

    @Mock
    private ConversationMemberMapper conversationMemberMapper;

    @Mock
    private MessageMapper messageMapper;

    @Mock
    private FileMapper fileMapper;

    @Mock
    private FileUploadMapper fileUploadMapper;

    @Mock
    private UserMapper userMapper;

    @Mock
    private WebSocketSessionManager sessionManager;

    @Mock
    private FileUploadService fileUploadService;

    @Mock
    private FileRetentionService fileRetentionService;

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks
    private ConversationServiceImpl conversationService;

    @Test
    void dissolvingGroupClearsFileReferencesBeforeDeletingConversation() {
        when(conversationMapper.selectOne(any())).thenReturn(conversation());

        conversationService.dissolveGroup(1L, 10L);

        org.mockito.InOrder deletionOrder = org.mockito.Mockito.inOrder(
                fileUploadMapper, fileMapper, conversationMemberMapper, conversationMapper);
        deletionOrder.verify(fileUploadMapper).delete(any());
        deletionOrder.verify(fileMapper).update(eq(null), any());
        deletionOrder.verify(conversationMemberMapper).delete(any());
        deletionOrder.verify(conversationMapper).deleteById(1L);
    }

    /**
     * 验证 @所有人 消息计入 mentionUnreadCount，且成员签名正确填充。
     */
    @Test
    void allMentionCountsAsMentionUnreadForGroupMember() {
        ImConversationMember selfMember = member(11L, "member");
        selfMember.setLastReadTime(LocalDateTime.now().minusMinutes(5));
        ImMessage allMentionMessage = new ImMessage();
        allMentionMessage.setId(100L);
        allMentionMessage.setConversationId(1L);
        allMentionMessage.setSenderId(10L);
        allMentionMessage.setMessageType("TEXT");
        allMentionMessage.setStatus("SENT");
        allMentionMessage.setContent("{\"text\":\"@所有人 开会\",\"mentions\":[{\"type\":\"all\",\"userId\":\"__ALL__\",\"nickname\":\"所有人\"}]}");
        allMentionMessage.setExpiresAt(LocalDateTime.now().plusDays(1));

        when(conversationMemberMapper.selectOne(any())).thenReturn(selfMember, selfMember);
        when(conversationMapper.selectById(1L)).thenReturn(conversation());
        when(messageMapper.selectList(any())).thenReturn(List.of(allMentionMessage));
        when(conversationMemberMapper.selectList(any())).thenReturn(List.of(member(10L, "owner"), selfMember));
        when(userMapper.selectById(any())).thenAnswer(invocation -> user(invocation.getArgument(0)));

        ConversationVO vo = conversationService.getById(1L, 11L);

        assertThat(vo.getMentionUnreadCount()).isEqualTo(1);
        assertThat(vo.getMembers()).anySatisfy(member ->
                assertThat(member.getSignature()).isEqualTo("签名" + member.getUserId()));
    }

    /**
     * 验证群主可以将普通成员提升为管理员，更新后角色为 admin。
     */
    @Test
    void ownerCanPromoteMemberToAdmin() {
        ImConversationMember owner = member(10L, "owner");
        ImConversationMember target = member(11L, "member");
        when(conversationMapper.selectOne(any())).thenReturn(conversation());
        when(conversationMapper.selectById(1L)).thenReturn(conversation());
        when(conversationMemberMapper.selectOne(any())).thenReturn(owner, target, owner);
        when(conversationMemberMapper.selectList(any())).thenReturn(List.of(owner, target));
        when(userMapper.selectById(any())).thenAnswer(invocation -> user(invocation.getArgument(0)));

        ConversationVO vo = conversationService.updateMemberRole(1L, 11L, 10L, roleRequest("admin"));

        ArgumentCaptor<ImConversationMember> captor = ArgumentCaptor.forClass(ImConversationMember.class);
        verify(conversationMemberMapper).updateById(captor.capture());
        assertThat(captor.getValue().getRole()).isEqualTo("admin");
        assertThat(vo.getMembers()).anySatisfy(member ->
                assertThat(member.getRole()).isEqualTo("admin"));
    }

    /**
     * 验证管理员无权修改成员角色，抛出 403。
     */
    @Test
    void adminCannotUpdateMemberRoles() {
        when(conversationMapper.selectOne(any())).thenReturn(conversation());
        when(conversationMemberMapper.selectOne(any())).thenReturn(member(10L, "admin")); // 操作者是 admin

        assertThatThrownBy(() -> conversationService.updateMemberRole(1L, 11L, 10L, roleRequest("admin")))
                .isInstanceOf(BusinessException.class)
                .hasMessage("Only the group owner can update member roles")
                .extracting("code")
                .isEqualTo(403);
    }

    /**
     * 验证新建群聊时头像状态初始化为 default，canEditAvatar=true，ownerId 正确。
     */
    @Test
    void newGroupStartsWithFixedDefaultAvatarState() {
        CreateConversationRequest request = new CreateConversationRequest();
        request.setType(2); // 群聊
        request.setRequestId("group-create-1");
        request.setMemberIds(List.of(11L, 12L));
        ImConversationMember owner = member(10L, "owner");
        ImConversationMember groupMember1 = member(11L, "member");
        ImConversationMember groupMember2 = member(12L, "member");

        doAnswer(invocation -> {
            ImConversation value = invocation.getArgument(0);
            value.setId(1L);
            return 1;
        }).when(conversationMapper).insert(any(ImConversation.class));
        when(conversationMemberMapper.selectOne(any())).thenReturn(owner);
        when(conversationMemberMapper.selectList(any())).thenReturn(List.of(owner, groupMember1, groupMember2));
        when(userMapper.selectById(anyLong())).thenAnswer(invocation -> user(invocation.getArgument(0)));

        ConversationVO vo = conversationService.createConversation(10L, request);

        assertThat(vo.getAvatar()).isNull();
        assertThat(vo.getAvatarType()).isEqualTo("default");
        assertThat(vo.getOwnerId()).isEqualTo(10L);
        assertThat(vo.getCanEditAvatar()).isTrue();
        assertThat(vo.getName()).isEqualTo("用户10、用户11、用户12");

        ArgumentCaptor<ImConversation> captor = ArgumentCaptor.forClass(ImConversation.class);
        verify(conversationMapper).insert(captor.capture());
        assertThat(captor.getValue().getCreateRequestId()).isEqualTo("group-create-1");
    }

    /**
     * 验证一步建群至少需要两名其他联系人。
     */
    @Test
    void newGroupRequiresAtLeastTwoSelectedMembers() {
        CreateConversationRequest request = new CreateConversationRequest();
        request.setType(2);
        request.setRequestId("group-create-too-small");
        request.setMemberIds(List.of(11L));

        assertThatThrownBy(() -> conversationService.createConversation(10L, request))
                .isInstanceOf(BusinessException.class)
                .hasMessage("At least two group members are required");
        verify(conversationMapper, never()).insert(any(ImConversation.class));
    }

    /**
     * 验证同一用户重复提交同一个 requestId 时返回原群聊，不再写入新记录。
     */
    @Test
    void repeatedGroupRequestReturnsExistingConversation() {
        CreateConversationRequest request = new CreateConversationRequest();
        request.setType(2);
        request.setRequestId("group-create-retry");
        request.setMemberIds(List.of(11L, 12L));
        ImConversation existing = conversation();
        existing.setCreateRequestId("group-create-retry");
        ImConversationMember owner = member(10L, "owner");

        when(conversationMapper.selectOne(any())).thenReturn(existing);
        when(conversationMemberMapper.selectOne(any())).thenReturn(owner);
        when(conversationMemberMapper.selectList(any())).thenReturn(List.of(
                owner,
                member(11L, "member"),
                member(12L, "member")));
        when(userMapper.selectById(anyLong())).thenAnswer(invocation -> user(invocation.getArgument(0)));

        ConversationVO vo = conversationService.createConversation(10L, request);

        assertThat(vo.getConversationId()).isEqualTo(existing.getId());
        verify(conversationMapper, never()).insert(any(ImConversation.class));
    }

    /**
     * 验证群主上传群头像成功，返回 avatarType=custom、avatar 下载 URL、
     * avatarUpdatedBy 为操作者 ID，且 conversation 被 updateById。
     */
    @Test
    void ownerCanUploadGroupAvatar() {
        ImConversation conversation = conversation();
        ImConversationMember owner = member(10L, "owner");
        ImFile uploaded = new ImFile();
        uploaded.setId(99L);
        MockMultipartFile file = new MockMultipartFile(
                "file", "group.png", "image/png", new byte[]{1, 2, 3});

        when(conversationMapper.selectById(1L)).thenReturn(conversation);
        when(conversationMapper.selectOne(any())).thenReturn(conversation);
        when(fileUploadService.uploadGroupAvatarFile(file, 10L, 1L)).thenReturn(uploaded);
        when(conversationMemberMapper.selectOne(any())).thenReturn(owner);
        when(conversationMemberMapper.selectList(any())).thenReturn(List.of(owner));
        when(userMapper.selectById(10L)).thenReturn(user(10L));

        ConversationVO vo = conversationService.updateAvatar(1L, 10L, file);

        assertThat(vo.getAvatar()).isEqualTo("/api/files/download/99");
        assertThat(vo.getAvatarType()).isEqualTo("custom");
        assertThat(vo.getAvatarUpdatedBy()).isEqualTo(10L);
        assertThat(vo.getCanEditAvatar()).isTrue();
        verify(conversationMapper).updateById(conversation);
    }

    /**
     * 验证非群主上传群头像被拒绝，返回 403，且不会调用 uploadGroupAvatarFile。
     */
    @Test
    void nonOwnerCannotUploadGroupAvatar() {
        ImConversation conversation = conversation();
        MockMultipartFile file = new MockMultipartFile(
                "file", "group.png", "image/png", new byte[]{1});
        when(conversationMapper.selectById(1L)).thenReturn(conversation);

        assertThatThrownBy(() -> conversationService.updateAvatar(1L, 11L, file))
                .isInstanceOf(BusinessException.class)
                .hasMessage("仅群主可修改群头像")
                .extracting("code")
                .isEqualTo(403);
        verify(fileUploadService, never()).uploadGroupAvatarFile(any(), anyLong(), anyLong());
    }

    /**
     * 验证对已是默认头像的群恢复默认头像为幂等操作：avatarUpdatedAt=null，
     * 不调用 updateById 也不触发旧文件清理。
     */
    @Test
    void restoringAnAlreadyDefaultAvatarIsIdempotent() {
        ImConversation conversation = conversation();
        conversation.setAvatarType("default"); // 已是默认头像
        ImConversationMember owner = member(10L, "owner");
        when(conversationMapper.selectOne(any())).thenReturn(conversation);
        when(conversationMemberMapper.selectOne(any())).thenReturn(owner);
        when(conversationMemberMapper.selectList(any())).thenReturn(List.of(owner));
        when(userMapper.selectById(10L)).thenReturn(user(10L));

        ConversationVO vo = conversationService.restoreDefaultAvatar(1L, 10L);

        assertThat(vo.getAvatarType()).isEqualTo("default");
        assertThat(vo.getAvatarUpdatedAt()).isNull();
        verify(conversationMapper, never()).updateById(any(ImConversation.class));
        verify(fileRetentionService, never()).retireFile(anyLong());
    }

    /**
     * 验证群主转让：ownerId 变更、旧群主降为 member、新群主升为 owner、
     * 头像保留、旧群主 canEditAvatar=false。
     */
    @Test
    void transferOwnerKeepsAvatarAndMovesEditPermission() {
        ImConversation conversation = conversation();
        conversation.setAvatar("/api/files/download/88");
        conversation.setAvatarType("custom");
        ImConversationMember oldOwner = member(10L, "owner");
        ImConversationMember newOwner = member(11L, "member");
        TransferConversationOwnerRequest request = new TransferConversationOwnerRequest();
        request.setNewOwnerId(11L);

        when(conversationMapper.selectOne(any())).thenReturn(conversation);
        when(conversationMemberMapper.selectOne(any())).thenReturn(oldOwner, newOwner, oldOwner);
        when(conversationMapper.selectById(1L)).thenReturn(conversation);
        when(conversationMemberMapper.selectList(any())).thenReturn(List.of(oldOwner, newOwner));
        when(userMapper.selectById(anyLong())).thenAnswer(invocation -> user(invocation.getArgument(0)));

        ConversationVO oldOwnerView = conversationService.transferOwner(1L, 10L, request);

        assertThat(conversation.getOwnerId()).isEqualTo(11L); // 新群主
        assertThat(conversation.getAvatar()).isEqualTo("/api/files/download/88"); // 头像保留
        assertThat(oldOwner.getRole()).isEqualTo("member"); // 旧群主降级
        assertThat(newOwner.getRole()).isEqualTo("owner"); // 新群主升级
        assertThat(oldOwnerView.getCanEditAvatar()).isFalse(); // 旧群主失去编辑权限
        verify(conversationMemberMapper).updateById(eq(oldOwner));
        verify(conversationMemberMapper).updateById(eq(newOwner));
    }

    private ImConversation conversation() {
        ImConversation conversation = new ImConversation();
        conversation.setId(1L);
        conversation.setType(2);
        conversation.setName("测试群");
        conversation.setOwnerId(10L);
        return conversation;
    }

    private ImConversationMember member(Long userId, String role) {
        ImConversationMember member = new ImConversationMember();
        member.setId(userId);
        member.setConversationId(1L);
        member.setUserId(userId);
        member.setRole(role);
        member.setIsPinned(0);
        member.setIsMuted(0);
        member.setJoinTime(LocalDateTime.now().minusDays(1));
        return member;
    }

    private SysUser user(Long userId) {
        SysUser user = new SysUser();
        user.setId(userId);
        user.setNickname("用户" + userId);
        user.setSignature("签名" + userId);
        user.setStatus(1);
        return user;
    }

    private UpdateMemberRoleRequest roleRequest(String role) {
        UpdateMemberRoleRequest request = new UpdateMemberRoleRequest();
        request.setRole(role);
        return request;
    }
}

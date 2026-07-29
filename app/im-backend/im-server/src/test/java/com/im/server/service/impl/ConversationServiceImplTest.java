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

@ExtendWith(MockitoExtension.class)
class ConversationServiceImplTest {

    @Mock
    private ConversationMapper conversationMapper;

    @Mock
    private ConversationMemberMapper conversationMemberMapper;

    @Mock
    private MessageMapper messageMapper;

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

    @Test
    void adminCannotUpdateMemberRoles() {
        when(conversationMapper.selectOne(any())).thenReturn(conversation());
        when(conversationMemberMapper.selectOne(any())).thenReturn(member(10L, "admin"));

        assertThatThrownBy(() -> conversationService.updateMemberRole(1L, 11L, 10L, roleRequest("admin")))
                .isInstanceOf(BusinessException.class)
                .hasMessage("Only the group owner can update member roles")
                .extracting("code")
                .isEqualTo(403);
    }

    @Test
    void newGroupStartsWithFixedDefaultAvatarState() {
        CreateConversationRequest request = new CreateConversationRequest();
        request.setType(2);
        request.setName("项目讨论群");
        request.setMemberIds(List.of(11L));
        ImConversationMember owner = member(10L, "owner");
        ImConversationMember groupMember = member(11L, "member");

        doAnswer(invocation -> {
            ImConversation value = invocation.getArgument(0);
            value.setId(1L);
            return 1;
        }).when(conversationMapper).insert(any(ImConversation.class));
        when(conversationMemberMapper.selectOne(any())).thenReturn(owner);
        when(conversationMemberMapper.selectList(any())).thenReturn(List.of(owner, groupMember));
        when(userMapper.selectById(anyLong())).thenAnswer(invocation -> user(invocation.getArgument(0)));

        ConversationVO vo = conversationService.createConversation(10L, request);

        assertThat(vo.getAvatar()).isNull();
        assertThat(vo.getAvatarType()).isEqualTo("default");
        assertThat(vo.getOwnerId()).isEqualTo(10L);
        assertThat(vo.getCanEditAvatar()).isTrue();
    }

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

    @Test
    void restoringAnAlreadyDefaultAvatarIsIdempotent() {
        ImConversation conversation = conversation();
        conversation.setAvatarType("default");
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

        assertThat(conversation.getOwnerId()).isEqualTo(11L);
        assertThat(conversation.getAvatar()).isEqualTo("/api/files/download/88");
        assertThat(oldOwner.getRole()).isEqualTo("member");
        assertThat(newOwner.getRole()).isEqualTo("owner");
        assertThat(oldOwnerView.getCanEditAvatar()).isFalse();
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

package com.im.server.controller;

import com.im.common.dto.ConversationVO;
import com.im.common.dto.TransferConversationOwnerRequest;
import com.im.server.service.ConversationService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 会话控制器测试，验证群头像上传、恢复默认头像、群主转让的 HTTP 接口行为。
 *
 * <p>测试范围：ConversationController 的 uploadAvatar、restoreDefaultAvatar、transferOwner 端点。</p>
 */
class ConversationControllerTest {

    private ConversationService conversationService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        conversationService = mock(ConversationService.class);
        ConversationController controller = new ConversationController();
        ReflectionTestUtils.setField(controller, "conversationService", conversationService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
        // 模拟已认证用户 userId=10
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("10", null));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    /**
     * 验证已认证用户上传群头像成功，返回 avatarType=custom 和下载 URL。
     */
    @Test
    void uploadsGroupAvatarForAuthenticatedUser() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file", "group.png", "image/png", new byte[]{1, 2});
        ConversationVO response = conversation();
        response.setAvatar("/api/files/download/99");
        response.setAvatarType("custom");
        when(conversationService.updateAvatar(1L, 10L, file)).thenReturn(response);

        mockMvc.perform(multipart("/api/conversations/1/avatar").file(file))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.avatarType").value("custom"))
                .andExpect(jsonPath("$.data.avatar").value("/api/files/download/99"));
    }

    /**
     * 验证恢复默认头像成功，返回 avatarType=default，并确认调用了 restoreDefaultAvatar。
     */
    @Test
    void restoresDefaultAvatar() throws Exception {
        ConversationVO response = conversation();
        response.setAvatarType("default");
        when(conversationService.restoreDefaultAvatar(1L, 10L)).thenReturn(response);

        mockMvc.perform(delete("/api/conversations/1/avatar"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.avatarType").value("default"));
        verify(conversationService).restoreDefaultAvatar(1L, 10L);
    }

    /**
     * 验证群主转让成功，返回新的 ownerId=11。
     */
    @Test
    void transfersOwner() throws Exception {
        ConversationVO response = conversation();
        response.setOwnerId(11L);
        when(conversationService.transferOwner(any(), any(), any(TransferConversationOwnerRequest.class)))
                .thenReturn(response);

        mockMvc.perform(put("/api/conversations/1/owner")
                        .contentType("application/json")
                        .content("{\"newOwnerId\":11}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ownerId").value(11));
    }

    private ConversationVO conversation() {
        ConversationVO conversation = new ConversationVO();
        conversation.setConversationId(1L);
        conversation.setType(2);
        conversation.setName("测试群");
        conversation.setOwnerId(10L);
        conversation.setCanEditAvatar(true);
        return conversation;
    }
}

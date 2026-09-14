package com.im.server.controller;

import com.im.server.service.impl.MessageServiceImpl;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class MessagePolicyControllerTest {
    @Test
    void exposesTheSameRecallWindowUsedByTheMessageService() throws Exception {
        MessageServiceImpl service = new MessageServiceImpl();
        MessageController controller = new MessageController();
        ReflectionTestUtils.setField(controller, "messageService", service);
        assertThat(service.getRecallWindowMs()).isEqualTo(120_000L);
        MockMvcBuilders.standaloneSetup(controller).build().perform(get("/api/messages/policy"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.recallWindowMs").value(service.getRecallWindowMs()))
                .andExpect(jsonPath("$.data.serverTime").isNumber());
    }
}

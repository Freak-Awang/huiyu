package com.im.server.util;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.common.dto.ConversationVO;
import com.im.common.dto.MessageVO;
import com.im.common.util.ServerTime;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.TimeZone;

import static org.assertj.core.api.Assertions.assertThat;

class ChatTimeSerializationTest {
    @ParameterizedTest
    @ValueSource(strings = {"Asia/Shanghai", "UTC", "America/New_York"})
    void historyPreviewAndPushCarryTheSameInstantInEveryServerZone(String zone) throws Exception {
        TimeZone previous = TimeZone.getDefault();
        try {
            TimeZone.setDefault(TimeZone.getTimeZone(zone));
            Instant sentAt = Instant.parse("2026-09-22T07:38:00Z");
            LocalDateTime stored = LocalDateTime.ofInstant(sentAt, ZoneId.systemDefault());
            MessageVO message = new MessageVO();
            message.setCreateTime(stored);
            message.setReadTime(stored.plusMinutes(1));
            ConversationVO conversation = new ConversationVO();
            conversation.setLastMessageTime(stored);
            ObjectMapper mapper = new ObjectMapper();

            var history = mapper.readTree(mapper.writeValueAsString(message));
            var preview = mapper.readTree(mapper.writeValueAsString(conversation));
            String historyTime = history.path("createTime").asText();
            assertThat(OffsetDateTime.parse(historyTime).toInstant()).isEqualTo(sentAt);
            assertThat(preview.path("lastMessageTime").asText()).isEqualTo(historyTime);
            assertThat(ServerTime.toIsoString(stored)).isEqualTo(historyTime);
            assertThat(OffsetDateTime.parse(history.path("readTime").asText()).toInstant())
                    .isEqualTo(sentAt.plusSeconds(60));
            if (zone.equals("Asia/Shanghai")) {
                assertThat(historyTime).isEqualTo("2026-09-22T15:38:00+08:00");
            }
        } finally {
            TimeZone.setDefault(previous);
        }
    }

    @Test
    void absentTimesStayNull() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        assertThat(mapper.readTree(mapper.writeValueAsString(new MessageVO())).path("createTime").isNull()).isTrue();
        assertThat(mapper.readTree(mapper.writeValueAsString(new ConversationVO())).path("lastMessageTime").isNull()).isTrue();
        assertThat(ServerTime.toIsoString(null)).isNull();
    }
}

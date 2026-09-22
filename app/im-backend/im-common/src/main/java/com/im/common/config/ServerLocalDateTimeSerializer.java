package com.im.common.config;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.im.common.util.ServerTime;

import java.io.IOException;
import java.time.LocalDateTime;

/** Scoped to chat response fields; database values keep their existing local-time semantics. */
public class ServerLocalDateTimeSerializer extends JsonSerializer<LocalDateTime> {
    @Override
    public void serialize(LocalDateTime value, JsonGenerator generator, SerializerProvider provider) throws IOException {
        generator.writeString(ServerTime.toIsoString(value));
    }
}

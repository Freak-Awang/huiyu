package com.im.common.util;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/** Wire timestamps carry the same zone used by LocalDateTime.now() when messages are stored. */
public final class ServerTime {
    private ServerTime() {
    }

    public static String toIsoString(LocalDateTime value) {
        return value == null ? null : value.atZone(ZoneId.systemDefault())
                .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }
}

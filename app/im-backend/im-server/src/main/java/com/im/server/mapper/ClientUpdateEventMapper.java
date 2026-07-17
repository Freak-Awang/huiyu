package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.ImClientUpdateEvent;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

@Mapper
public interface ClientUpdateEventMapper extends BaseMapper<ImClientUpdateEvent> {
    @Select("""
            SELECT event_type AS eventType, COUNT(*) AS eventCount,
                   COUNT(DISTINCT device_id) AS deviceCount
            FROM im_client_update_event
            WHERE target_version = #{version} AND channel = #{channel}
            GROUP BY event_type
            """)
    List<Map<String, Object>> summarize(@Param("version") String version, @Param("channel") String channel);
}


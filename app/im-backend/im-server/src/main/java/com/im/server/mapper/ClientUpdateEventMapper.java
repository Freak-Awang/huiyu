package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.ImClientUpdateEvent;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/**
 * 客户端更新事件 Mapper：对应 im_client_update_event 表，记录客户端更新过程中的各类事件。
 */
@Mapper
public interface ClientUpdateEventMapper extends BaseMapper<ImClientUpdateEvent> {

    /**
     * 按版本和渠道统计更新事件。
     * <p>
     * 按事件类型分组，统计事件总数及去重设备数，用于版本发布效果分析。
     *
     * @param version 目标版本号
     * @param channel 发布渠道
     * @return 事件统计列表
     */
    @Select("""
            SELECT event_type AS eventType, COUNT(*) AS eventCount,
                   COUNT(DISTINCT device_id) AS deviceCount
            FROM im_client_update_event
            WHERE release_id = #{releaseId}
            GROUP BY event_type
            """)
    List<Map<String, Object>> summarize(@Param("releaseId") Long releaseId);
}

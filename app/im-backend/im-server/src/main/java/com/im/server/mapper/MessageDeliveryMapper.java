package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.ImMessageDelivery;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Intent: MessageDeliveryMapper maps domain persistence operations to MyBatis-Plus data access.
 */
@Mapper
public interface MessageDeliveryMapper extends BaseMapper<ImMessageDelivery> {

    @Select("""
            SELECT d.message_id
            FROM im_message_delivery d
            JOIN im_message m ON m.id = d.message_id
            WHERE d.conversation_id = #{conversationId}
              AND d.user_id = #{userId}
              AND d.read_status = 0
              AND (m.create_time < #{boundaryTime}
                   OR (m.create_time = #{boundaryTime} AND m.id <= #{boundaryMessageId}))
            ORDER BY m.id DESC
            LIMIT 500
            """)
    List<Long> selectUnreadMessageIdsUpTo(
            @Param("conversationId") Long conversationId,
            @Param("userId") Long userId,
            @Param("boundaryTime") LocalDateTime boundaryTime,
            @Param("boundaryMessageId") Long boundaryMessageId);

    @Update("""
            UPDATE im_message_delivery d
            JOIN im_message m ON m.id = d.message_id
            SET d.read_status = 1,
                d.read_time = #{readTime}
            WHERE d.conversation_id = #{conversationId}
              AND d.user_id = #{userId}
              AND d.read_status = 0
              AND (m.create_time < #{boundaryTime}
                   OR (m.create_time = #{boundaryTime} AND m.id <= #{boundaryMessageId}))
            """)
    int markReadUpTo(
            @Param("conversationId") Long conversationId,
            @Param("userId") Long userId,
            @Param("boundaryTime") LocalDateTime boundaryTime,
            @Param("boundaryMessageId") Long boundaryMessageId,
            @Param("readTime") LocalDateTime readTime);
}

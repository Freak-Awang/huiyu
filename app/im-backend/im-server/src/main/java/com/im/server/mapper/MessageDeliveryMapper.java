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
 * 消息投递 Mapper：对应 im_message_delivery 表，管理消息在每个会话成员上的投递与已读状态。
 */
@Mapper
public interface MessageDeliveryMapper extends BaseMapper<ImMessageDelivery> {

    /**
     * 查询用户在指定会话中、截至边界消息为止的未读消息 ID 列表。
     * <p>
     * 边界条件：消息创建时间早于 boundaryTime，或等于 boundaryTime 且消息 ID 不大于 boundaryMessageId。
     * 结果按消息 ID 倒序，最多返回 500 条。
     *
     * @param conversationId 会话 ID
     * @param userId 用户 ID
     * @param boundaryTime 边界消息创建时间
     * @param boundaryMessageId 边界消息 ID
     * @return 未读消息 ID 列表
     */
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

    /**
     * 批量将用户在指定会话中、截至边界消息为止的未读消息标记为已读。
     * <p>
     * 边界条件与 selectUnreadMessageIdsUpTo 保持一致，通过 JOIN im_message 实现按消息时间过滤。
     *
     * @param conversationId 会话 ID
     * @param userId 用户 ID
     * @param boundaryTime 边界消息创建时间
     * @param boundaryMessageId 边界消息 ID
     * @param readTime 已读时间
     * @return 更新行数
     */
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

package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.SysUser;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 用户 Mapper：对应 sys_user 表，提供用户基础 CRUD 及行锁查询。
 */
@Mapper
public interface UserMapper extends BaseMapper<SysUser> {

    /**
     * 按用户 ID 查询并加行锁（FOR UPDATE）。
     * <p>
     * 用于存储配额校验等需要防止并发修改的场景。
     *
     * @param userId 用户 ID
     * @return 用户 ID，用户不存在时返回 null
     */
    @Select("SELECT id FROM sys_user WHERE id = #{userId} FOR UPDATE")
    Long lockById(@Param("userId") Long userId);
}

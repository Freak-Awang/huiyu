package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.SysUser;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * Intent: UserMapper maps domain persistence operations to MyBatis-Plus data access.
 */
@Mapper
public interface UserMapper extends BaseMapper<SysUser> {
    @Select("SELECT id FROM sys_user WHERE id = #{userId} FOR UPDATE")
    Long lockById(@Param("userId") Long userId);
}

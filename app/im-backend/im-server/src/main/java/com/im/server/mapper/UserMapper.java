package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.SysUser;
import org.apache.ibatis.annotations.Mapper;

/**
 * ?????UserMapper maps domain persistence operations to MyBatis-Plus data access.
 */
@Mapper
public interface UserMapper extends BaseMapper<SysUser> {
}

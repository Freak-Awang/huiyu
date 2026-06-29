package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.SysDept;
import org.apache.ibatis.annotations.Mapper;

/**
 * ?????DeptMapper maps domain persistence operations to MyBatis-Plus data access.
 */
@Mapper
public interface DeptMapper extends BaseMapper<SysDept> {
}

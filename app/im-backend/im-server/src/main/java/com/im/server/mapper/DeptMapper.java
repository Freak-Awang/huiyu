package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.SysDept;
import org.apache.ibatis.annotations.Mapper;

/**
 * 部门 Mapper：对应 sys_dept 表，提供组织架构部门的基础 CRUD。
 */
@Mapper
public interface DeptMapper extends BaseMapper<SysDept> {
}

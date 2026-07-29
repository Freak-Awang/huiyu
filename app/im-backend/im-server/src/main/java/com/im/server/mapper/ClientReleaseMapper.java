package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.ImClientRelease;
import org.apache.ibatis.annotations.Mapper;

/**
 * 客户端版本发布 Mapper：对应 im_client_release 表，提供版本发布记录的基础 CRUD。
 */
@Mapper
public interface ClientReleaseMapper extends BaseMapper<ImClientRelease> {
}


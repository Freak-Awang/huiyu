package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.ImClientReleaseTarget;
import org.apache.ibatis.annotations.Mapper;

/**
 * 客户端版本发布定向规则 Mapper：对应 im_client_release_target 表，管理灰度发布的定向允许/拒绝规则。
 */
@Mapper
public interface ClientReleaseTargetMapper extends BaseMapper<ImClientReleaseTarget> {
}


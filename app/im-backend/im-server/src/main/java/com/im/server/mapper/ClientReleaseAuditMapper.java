package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.ImClientReleaseAudit;
import org.apache.ibatis.annotations.Mapper;

/** 客户端发布审计记录 Mapper。 */
@Mapper
public interface ClientReleaseAuditMapper extends BaseMapper<ImClientReleaseAudit> {
}

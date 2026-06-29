package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.ImFileUploadPart;
import org.apache.ibatis.annotations.Mapper;

/**
 * ?????FileUploadPartMapper maps domain persistence operations to MyBatis-Plus data access.
 */
@Mapper
public interface FileUploadPartMapper extends BaseMapper<ImFileUploadPart> {
}

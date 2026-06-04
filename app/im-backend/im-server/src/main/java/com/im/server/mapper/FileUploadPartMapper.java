package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.ImFileUploadPart;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface FileUploadPartMapper extends BaseMapper<ImFileUploadPart> {
}

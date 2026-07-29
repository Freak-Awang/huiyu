package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.ImFileUploadPart;
import org.apache.ibatis.annotations.Mapper;

/**
 * 分片上传分片 Mapper：对应 im_file_upload_part 表，记录每个上传任务的分片信息。
 */
@Mapper
public interface FileUploadPartMapper extends BaseMapper<ImFileUploadPart> {
}

package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.ImFileUpload;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * Intent: FileUploadMapper maps domain persistence operations to MyBatis-Plus data access.
 */
@Mapper
public interface FileUploadMapper extends BaseMapper<ImFileUpload> {
    @Select("SELECT * FROM im_file_upload WHERE upload_id = #{uploadId} AND uploader_id = #{uploaderId} FOR UPDATE")
    ImFileUpload selectOwnedForUpdate(@Param("uploadId") String uploadId, @Param("uploaderId") Long uploaderId);
}

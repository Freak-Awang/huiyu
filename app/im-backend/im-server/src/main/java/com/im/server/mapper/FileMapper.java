package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.ImFile;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * Intent: FileMapper maps domain persistence operations to MyBatis-Plus data access.
 */
@Mapper
public interface FileMapper extends BaseMapper<ImFile> {
    @Select("SELECT COALESCE(SUM(file_size), 0) FROM im_file WHERE uploader_id = #{uploaderId} AND status = 'AVAILABLE'")
    Long sumAvailableBytesByUploader(@Param("uploaderId") Long uploaderId);
}

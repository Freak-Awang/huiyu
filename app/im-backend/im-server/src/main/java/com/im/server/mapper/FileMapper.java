package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.ImFile;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 文件 Mapper：对应 im_file 表，管理文件元数据及存储配额统计。
 */
@Mapper
public interface FileMapper extends BaseMapper<ImFile> {

    /**
     * 统计用户已可用文件的总字节数（用于存储配额计算）。
     *
     * @param uploaderId 上传者 ID
     * @return 总字节数，无记录时返回 0
     */
    @Select("SELECT COALESCE(SUM(file_size), 0) FROM im_file WHERE uploader_id = #{uploaderId} AND status = 'AVAILABLE'")
    Long sumAvailableBytesByUploader(@Param("uploaderId") Long uploaderId);
}

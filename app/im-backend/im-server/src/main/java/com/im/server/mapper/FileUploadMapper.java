package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.ImFileUpload;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 分片上传任务 Mapper：对应 im_file_upload 表，管理大文件分片上传任务。
 */
@Mapper
public interface FileUploadMapper extends BaseMapper<ImFileUpload> {

    /**
     * 按上传任务 ID 和上传者查询任务，并加行锁（FOR UPDATE）。
     * <p>
     * 用于分片上传和完成任务时的并发控制，防止同一任务被并发修改。
     *
     * @param uploadId 上传任务 ID
     * @param uploaderId 上传者 ID
     * @return 上传任务实体
     */
    @Select("SELECT * FROM im_file_upload WHERE upload_id = #{uploadId} AND uploader_id = #{uploaderId} FOR UPDATE")
    ImFileUpload selectOwnedForUpdate(@Param("uploadId") String uploadId, @Param("uploaderId") Long uploaderId);

    /**
     * 统计用户进行中上传任务的总字节数（用于存储配额计算）。
     *
     * @param uploaderId 上传者 ID
     * @return 总字节数，无记录时返回 0
     */
    @Select("SELECT COALESCE(SUM(file_size), 0) FROM im_file_upload "
            + "WHERE uploader_id = #{uploaderId} AND status = 'UPLOADING' AND expires_at > CURRENT_TIMESTAMP")
    Long sumActiveBytesByUploader(@Param("uploaderId") Long uploaderId);
}

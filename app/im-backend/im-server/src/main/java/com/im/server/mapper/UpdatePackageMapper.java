package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.UpdatePackage;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

/**
 * 客户端更新包 Mapper。
 */
@Mapper
public interface UpdatePackageMapper extends BaseMapper<UpdatePackage> {

    /**
     * 下载计数自增（异步统计，允许丢失少量精度）。
     *
     * @param packageId 更新包 ID
     * @return 影响行数
     */
    @Update("UPDATE update_package SET download_count = download_count + 1 WHERE id = #{packageId}")
    int incrementDownloadCount(@Param("packageId") Long packageId);
}

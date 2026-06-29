package com.im.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.common.entity.ImFileTransfer;
import org.apache.ibatis.annotations.Mapper;

/**
 * ?????FileTransferMapper maps domain persistence operations to MyBatis-Plus data access.
 */
@Mapper
public interface FileTransferMapper extends BaseMapper<ImFileTransfer> {
}

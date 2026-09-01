package com.im.server.service;

import com.im.common.dto.update.UpdateCheckResponse;
import com.im.common.dto.update.UpdateReportRequest;

/**
 * 客户端更新检查服务。
 * <p>
 * 负责版本比较、更新类型判定（强制/增量/全量）、灰度发布命中检查、
 * 设备版本追踪与更新遥测事件记录。
 * </p>
 */
public interface UpdateCheckService {

    /**
     * 检查客户端是否有可用更新。
     *
     * @param clientVersion 客户端当前版本号
     * @param clientBuild   客户端当前构建号
     * @param deviceId      设备唯一标识
     * @param channel       发布渠道（stable/beta/alpha）
     * @param supportPatch  客户端是否具备增量补丁合并能力（否则回退全量包）
     * @param userId        当前登录用户 ID（可空）
     * @return 更新检查结果
     */
    UpdateCheckResponse check(String clientVersion, Integer clientBuild, String deviceId,
                              String channel, boolean supportPatch, Long userId);

    /**
     * 记录客户端更新结果上报（下载/安装成功失败、回滚等）。
     *
     * @param request 上报内容
     * @param userId  当前登录用户 ID（可空）
     */
    void recordUpdateResult(UpdateReportRequest request, Long userId);
}

package com.im.server.service;

import com.im.common.entity.AppVersion;
import com.im.common.entity.UpdatePackage;
import com.im.common.result.PageResult;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 客户端更新包服务。
 * <p>
 * 负责版本发布（全量包上传、SHA256 校验、RSA 签名）、xdelta3 增量补丁生成、
 * 支持 Range 断点续传的包下载、版本分页查询、灰度策略配置与更新统计。
 * </p>
 */
public interface UpdatePackageService {

    /**
     * 下载更新包，支持 HTTP Range 断点续传。
     *
     * @param packageId   更新包 ID
     * @param rangeHeader 请求 Range 头（可空）
     * @return 文件流响应（全量 200 或部分内容 206）
     */
    ResponseEntity<Resource> downloadPackage(Long packageId, String rangeHeader);

    /**
     * 发布新版本：保存上传的全量安装包，计算校验和与签名，并异步生成增量补丁。
     *
     * @param file          安装包文件
     * @param version       版本号
     * @param buildNumber   构建号
     * @param channel       发布渠道
     * @param updateType    更新类型
     * @param changelog     更新日志 JSON 数组
     * @param minVersion    最低兼容版本（可空）
     * @param forceDeadline 强制更新截止时间（可空）
     * @param publish       是否立即发布（否则为草稿）
     * @return 创建的版本实体
     */
    AppVersion publishVersion(MultipartFile file, String version, Integer buildNumber, String channel,
                              String updateType, String changelog, String minVersion,
                              LocalDateTime forceDeadline, boolean publish);

    /**
     * 分页查询版本列表。
     *
     * @param channel  渠道过滤（可空）
     * @param page     页码
     * @param pageSize 每页数量
     * @return 版本分页数据
     */
    PageResult<AppVersion> pageVersions(String channel, int page, int pageSize);

    /**
     * 查询版本关联的全部更新包。
     *
     * @param versionId 版本 ID
     * @return 更新包列表
     */
    List<UpdatePackage> listPackages(Long versionId);

    /**
     * 更新版本状态（发布/下架）。
     *
     * @param versionId 版本 ID
     * @param status    目标状态 0-草稿 1-发布 2-下架
     */
    void updateVersionStatus(Long versionId, Integer status);

    /**
     * 为版本配置灰度发布策略（旧策略停用，新策略生效）。
     *
     * @param versionId 版本 ID
     * @param request   策略配置
     */
    void saveGrayStrategy(Long versionId, com.im.common.dto.update.GrayStrategyRequest request);

    /**
     * 更新统计：版本分布、更新事件统计、成功率。
     *
     * @return 统计信息
     */
    Map<String, Object> statistics();
}

package com.im.server.service;

import com.im.common.dto.DeptVO;
import com.im.common.entity.SysDept;

import java.util.List;
/**
 * 部门服务接口：定义组织架构树的查询与部门 CRUD 业务契约。
 */
public interface DeptService {

    /**
     * 查询启用状态的部门树。
     *
     * @return 部门树列表
     */
    List<DeptVO> getTree();

    /**
     * 查询全部部门树（含禁用）。
     *
     * @return 部门树列表
     */
    List<DeptVO> getAllTree();

    /**
     * 按 ID 查询部门。
     *
     * @param id 部门 ID
     * @return 部门实体
     */
    SysDept getById(Long id);

    /**
     * 创建部门。
     *
     * @param dept 部门实体
     * @return 创建后的部门
     */
    SysDept create(SysDept dept);

    /**
     * 更新部门。
     *
     * @param dept 部门实体
     * @return 更新后的部门
     */
    SysDept update(SysDept dept);

    /**
     * 删除部门。
     *
     * @param id 部门 ID
     */
    void delete(Long id);
}

package com.im.server.controller;

import com.im.common.dto.DeptVO;
import com.im.common.entity.SysDept;
import com.im.common.result.Result;
import com.im.server.service.DeptService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 管理端部门控制器。
 * <p>
 * 提供部门树查询、部门增删改等管理接口，
 * URL 前缀为 {@code /api/admin/depts}，需要管理员权限。
 * </p>
 */
@RestController
@RequestMapping("/api/admin/depts")
public class AdminDeptController {

    @Autowired
    private DeptService deptService;

    /**
     * 查询完整部门树。
     *
     * @return 部门树列表
     */
    @GetMapping("/tree")
    public Result<List<DeptVO>> getTree() {
        return Result.success(deptService.getAllTree());
    }

    /**
     * 创建部门。
     *
     * @param dept 部门信息
     * @return 创建后的部门
     */
    @PostMapping
    public Result<SysDept> create(@RequestBody SysDept dept) {
        return Result.success(deptService.create(dept));
    }

    /**
     * 更新部门。
     *
     * @param dept 部门信息
     * @return 更新后的部门
     */
    @PutMapping
    public Result<SysDept> update(@RequestBody SysDept dept) {
        return Result.success(deptService.update(dept));
    }

    /**
     * 删除部门。
     *
     * @param id 部门 ID
     * @return 操作结果
     */
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        deptService.delete(id);
        return Result.ok();
    }
}

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
 * Intent: DeptController exposes HTTP endpoints and keeps request validation close to the API boundary.
 */
@RestController
@RequestMapping("/api/depts")
public class DeptController {

    @Autowired
    private DeptService deptService;

    @GetMapping("/tree")
    public Result<List<DeptVO>> getTree() {
        return Result.success(deptService.getTree());
    }

    @GetMapping("/{id}")
    public Result<SysDept> getById(@PathVariable Long id) {
        return Result.success(deptService.getById(id));
    }

    @PostMapping
    public Result<SysDept> create(@RequestBody SysDept dept) {
        return Result.success(deptService.create(dept));
    }

    @PutMapping
    public Result<SysDept> update(@RequestBody SysDept dept) {
        return Result.success(deptService.update(dept));
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        deptService.delete(id);
        return Result.ok();
    }
}

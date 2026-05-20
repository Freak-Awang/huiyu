package com.im.server.service;

import com.im.common.dto.DeptVO;
import com.im.common.entity.SysDept;

import java.util.List;

public interface DeptService {

    List<DeptVO> getTree();

    List<DeptVO> getAllTree();

    SysDept getById(Long id);

    SysDept create(SysDept dept);

    SysDept update(SysDept dept);

    void delete(Long id);
}

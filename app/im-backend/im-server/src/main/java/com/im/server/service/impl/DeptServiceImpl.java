package com.im.server.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.im.common.dto.DeptVO;
import com.im.common.entity.SysDept;
import com.im.server.mapper.DeptMapper;
import com.im.server.service.DeptService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * ?????DeptServiceImpl coordinates domain rules, persistence updates, and cross-service side effects.
 */
@Service
public class DeptServiceImpl implements DeptService {

    @Autowired
    private DeptMapper deptMapper;

    @Override
    public List<DeptVO> getTree() {
        LambdaQueryWrapper<SysDept> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysDept::getStatus, 1)
               .orderByAsc(SysDept::getSortOrder);
        List<SysDept> deptList = deptMapper.selectList(wrapper);
        return buildTree(deptList, 0L);
    }

    @Override
    public List<DeptVO> getAllTree() {
        LambdaQueryWrapper<SysDept> wrapper = new LambdaQueryWrapper<>();
        wrapper.orderByAsc(SysDept::getSortOrder);
        List<SysDept> deptList = deptMapper.selectList(wrapper);
        return buildTree(deptList, 0L);
    }

    @Override
    public SysDept getById(Long id) {
        SysDept dept = deptMapper.selectById(id);
        if (dept == null) {
            throw new RuntimeException("部门不存在");
        }
        return dept;
    }

    @Override
    public SysDept create(SysDept dept) {
        dept.setCreateTime(LocalDateTime.now());
        dept.setUpdateTime(LocalDateTime.now());
        deptMapper.insert(dept);
        return dept;
    }

    @Override
    public SysDept update(SysDept dept) {
        dept.setUpdateTime(LocalDateTime.now());
        deptMapper.updateById(dept);
        return dept;
    }

    @Override
    public void delete(Long id) {
        deptMapper.deleteById(id);
    }

    private List<DeptVO> buildTree(List<SysDept> allDepts, Long parentId) {
        List<DeptVO> children = new ArrayList<>();
        for (SysDept dept : allDepts) {
            Long deptParentId = dept.getParentId() == null ? 0L : dept.getParentId();
            if (deptParentId.equals(parentId)) {
                DeptVO vo = convertToVO(dept);
                vo.setChildren(buildTree(allDepts, dept.getId()));
                children.add(vo);
            }
        }
        return children;
    }

    private DeptVO convertToVO(SysDept dept) {
        DeptVO vo = new DeptVO();
        vo.setId(dept.getId());
        vo.setName(dept.getName());
        vo.setParentId(dept.getParentId());
        vo.setSortOrder(dept.getSortOrder());
        return vo;
    }
}

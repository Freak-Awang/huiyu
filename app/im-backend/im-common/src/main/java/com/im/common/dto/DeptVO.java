package com.im.common.dto;

import lombok.Data;

import java.util.List;

/**
 * 部门视图对象，以树形结构向客户端返回组织架构。
 */
@Data
public class DeptVO {

    private Long id; // 部门ID

    private String name; // 部门名称

    private Long parentId; // 父部门ID，顶级部门为空或0

    private Integer sortOrder; // 同级排序号

    private List<DeptVO> children; // 子部门列表
}

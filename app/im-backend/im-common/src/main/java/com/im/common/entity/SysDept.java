package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 部门实体，记录企业组织架构中的部门节点，支持树形层级。
 */
@Data
@TableName("sys_dept")
public class SysDept {
    @TableId(type = IdType.AUTO)
    private Long id; // 部门ID
    private String name; // 部门名称
    private Long parentId; // 父部门ID，顶级部门为空或0
    private Integer sortOrder; // 同级排序号
    private Integer status; // 部门状态（如正常/停用）
    private LocalDateTime createTime; // 创建时间
    private LocalDateTime updateTime; // 更新时间
}

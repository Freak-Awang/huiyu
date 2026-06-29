package com.im.common.dto;

import lombok.Data;

import java.util.List;

/**
 * ?????DeptVO carries API payload shape between client, controller, and service layers.
 */
@Data
public class DeptVO {

    private Long id;

    private String name;

    private Long parentId;

    private Integer sortOrder;

    private List<DeptVO> children;
}

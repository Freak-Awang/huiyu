package com.im.common.result;

import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.List;

/**
 * 分页响应结果封装，在统一响应基础上扩展分页元信息。
 *
 * @param <T> 列表元素类型
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class PageResult<T> extends Result<List<T>> {
    private long total; // 总记录数
    private int page; // 当前页码
    private int pageSize; // 每页大小

    private PageResult(List<T> list, long total, int page, int pageSize) {
        super(200, "success", list);
        this.total = total;
        this.page = page;
        this.pageSize = pageSize;
    }

    /**
     * 构建分页成功响应。
     *
     * @param list     当前页数据列表
     * @param total    总记录数
     * @param page     当前页码
     * @param pageSize 每页大小
     * @param <T>      列表元素类型
     * @return 分页响应结果
     */
    public static <T> PageResult<T> success(List<T> list, long total, int page, int pageSize) {
        return new PageResult<>(list, total, page, pageSize);
    }
}

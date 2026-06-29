package com.im.common.result;

import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.List;

/**
 * Intent: PageResult standardizes response envelopes returned by backend APIs.
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class PageResult<T> extends Result<List<T>> {
    private long total;
    private int page;
    private int pageSize;

    private PageResult(List<T> list, long total, int page, int pageSize) {
        super(200, "success", list);
        this.total = total;
        this.page = page;
        this.pageSize = pageSize;
    }

    public static <T> PageResult<T> success(List<T> list, long total, int page, int pageSize) {
        return new PageResult<>(list, total, page, pageSize);
    }
}

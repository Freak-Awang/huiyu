package com.im.server.service.storage;

import java.io.InputStream;
/**
 * 存储对象：封装从存储后端读取的文件流、大小及内容类型。
 */
public class StoredObject {
    private final InputStream inputStream;
    private final long size;
    private final String contentType;

    public StoredObject(InputStream inputStream, long size, String contentType) {
        this.inputStream = inputStream;
        this.size = size;
        this.contentType = contentType;
    }

    public InputStream getInputStream() {
        return inputStream;
    }

    public long getSize() {
        return size;
    }

    public String getContentType() {
        return contentType;
    }
}

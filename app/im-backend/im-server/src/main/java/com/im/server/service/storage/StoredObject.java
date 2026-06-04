package com.im.server.service.storage;

import java.io.InputStream;

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

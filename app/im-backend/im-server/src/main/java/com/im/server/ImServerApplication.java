package com.im.server;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.im")
@MapperScan("com.im.server.mapper")
public class ImServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(ImServerApplication.class, args);
    }
}

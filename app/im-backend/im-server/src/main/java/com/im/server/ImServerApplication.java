package com.im.server;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * ?????ImServerApplication boots the Spring application and enables component discovery.
 */
@SpringBootApplication(scanBasePackages = "com.im")
@MapperScan("com.im.server.mapper")
@EnableScheduling
public class ImServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(ImServerApplication.class, args);
    }
}

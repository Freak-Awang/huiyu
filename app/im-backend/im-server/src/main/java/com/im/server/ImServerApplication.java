package com.im.server;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * IM 服务端应用入口。
 * <p>
 * 启动 Spring Boot 应用，扫描 com.im 包下的组件，
 * 通过 MyBatis-Plus 扫描 Mapper 接口，并启用定时任务调度。
 * </p>
 */
@SpringBootApplication(scanBasePackages = "com.im")
@MapperScan("com.im.server.mapper")
@EnableScheduling
public class ImServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(ImServerApplication.class, args);
    }
}

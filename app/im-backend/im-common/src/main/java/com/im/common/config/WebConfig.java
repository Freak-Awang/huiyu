package com.im.common.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Web层全局配置，集中管理跨域等框架级行为，保证基础设施配置显式可控。
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    /**
     * 配置全局CORS规则，放行所有来源并暴露文件下载相关响应头。
     *
     * @param registry CORS注册器
     */
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOriginPatterns("*")
                .allowedMethods("*")
                .allowedHeaders("*")
                .exposedHeaders("Content-Disposition", "Content-Length", "Content-Range", "Accept-Ranges")
                .allowCredentials(true)
                .maxAge(3600);
    }
}

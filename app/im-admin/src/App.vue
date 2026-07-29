<!-- 根组件：通过 el-config-provider 注入 Element Plus 中文语言包，并承载全局路由出口 -->
<template>
    <el-config-provider :locale="zhCn">
        <router-view />
    </el-config-provider>
</template>

<script setup lang="ts">
import zhCn from 'element-plus/es/locale/lang/zh-cn'
</script>

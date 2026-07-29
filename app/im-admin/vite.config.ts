/**
 * Vite 构建配置
 * 后台管理端独立部署在 /admin/ 路径下，通过 manualChunks 将 Vue、Element Plus、axios 等
 * 第三方依赖拆分为独立 chunk，优化首屏加载与缓存利用率。
 */
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

export default defineConfig({
  base: '/admin/',
  plugins: [
    vue(),
    // 自动导入 Element Plus 组件与 API，减少样板代码
    AutoImport({
      resolvers: [ElementPlusResolver()],
      dts: false,
    }),
    Components({
      resolvers: [ElementPlusResolver()],
      dts: false,
    }),
  ],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@element-plus/icons-vue')) return 'element-icons'
          if (id.includes('element-plus')) return 'element-plus'
          if (id.includes('node_modules/vue') || id.includes('node_modules/pinia')
            || id.includes('node_modules/vue-router')) return 'vue-vendor'
          if (id.includes('node_modules/axios')) return 'http-vendor'
        },
      },
    },
  },
})

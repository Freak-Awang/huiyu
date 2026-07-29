/**
 * Vite 构建配置文件
 *
 * 企业IM桌面版（Electron + Vue3）的前端构建配置。
 * 使用 @vitejs/plugin-vue 编译 SFC，base 设为 './' 以支持 Electron file:// 协议加载。
 */
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // 使用相对路径，确保 Electron 打包后 file:// 协议能正确加载资源
  base: './',
  plugins: [vue()],
})

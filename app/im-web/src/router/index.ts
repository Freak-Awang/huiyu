/**
 * 路由配置：定义应用页面路由与导航守卫。
 * 桌面客户端通过 file:// 加载渲染层，因此固定使用 hash 模式；
 * 未登录用户访问受保护页面时会被重定向到登录页。
 */
import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import Login from '../views/Login.vue'
import Chat from '../views/Chat.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: Login,
      meta: { requiresAuth: false },
    },
    {
      path: '/',
      name: 'Chat',
      component: Chat,
      meta: { requiresAuth: true },
    },
  ],
})

router.beforeEach((to) => {
  const authStore = useAuthStore()
  if (to.meta.requiresAuth !== false && !authStore.isLoggedIn) {
    return '/login'
  }
})

export default router

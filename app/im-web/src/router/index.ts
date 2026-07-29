/**
 * 路由配置：定义应用页面路由与导航守卫。
 * 桌面端（file:// 协议）使用 hash 模式，Web 端使用 history 模式；
 * 未登录用户访问受保护页面时会被重定向到登录页。
 */
import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import Login from '../views/Login.vue'
import Chat from '../views/Chat.vue'

const history = window.location.protocol === 'file:' ? createWebHashHistory() : createWebHistory()

const router = createRouter({
  history,
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

router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore()
  if (to.meta.requiresAuth !== false && !authStore.isLoggedIn) {
    next('/login')
  } else {
    next()
  }
})

export default router

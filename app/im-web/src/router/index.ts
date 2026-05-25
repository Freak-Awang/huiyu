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

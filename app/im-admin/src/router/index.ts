/**
 * 路由配置与全局守卫
 * 定义后台管理端页面路由，并在导航前校验管理员登录态：
 * - 未登录访问受保护页面时重定向到 /login
 * - 已登录访问 /login 时重定向到首页
 */
import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { isAuthorizedAdmin } from '../utils/authorization'

const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        {
            path: '/login',
            name: 'Login',
            component: () => import('../views/Login.vue'),
            meta: { requiresAuth: false },
        },
        {
            path: '/',
            name: 'Layout',
            component: () => import('../views/Layout.vue'),
            meta: { requiresAuth: true },
            redirect: '/users',
            children: [
                {
                    path: 'users',
                    name: 'UserManage',
                    component: () => import('../views/UserManage.vue'),
                    meta: { requiresAuth: true, title: '用户管理' },
                },
                {
                    path: 'depts',
                    name: 'DeptManage',
                    component: () => import('../views/DeptManage.vue'),
                    meta: { requiresAuth: true, title: '部门管理' },
                },
                {
                    path: 'releases',
                    name: 'ReleaseManage',
                    component: () => import('../views/ReleaseManage.vue'),
                    meta: { requiresAuth: true, title: '版本发布' },
                },
            ],
        },
    ],
})

// 全局前置守卫：校验 token 与 admin 角色
router.beforeEach((to, _from, next) => {
    const authStore = useAuthStore()
    authStore.init()
    if (to.meta.requiresAuth !== false && !isAuthorizedAdmin(authStore.token, authStore.role)) {
        next('/login')
    } else if (to.path === '/login' && isAuthorizedAdmin(authStore.token, authStore.role)) {
        next('/')
    } else {
        next()
    }
})

export default router

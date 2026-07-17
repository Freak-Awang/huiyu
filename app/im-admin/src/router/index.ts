// Intent: index defines route guards and view mapping for the application shell.
import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

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
                    path: 'client-releases',
                    name: 'ClientReleaseManage',
                    component: () => import('../views/ClientReleaseManage.vue'),
                    meta: { requiresAuth: true, title: '客户端版本' },
                },
            ],
        },
    ],
})

router.beforeEach((to, _from, next) => {
    const authStore = useAuthStore()
    authStore.init()
    if (to.meta.requiresAuth !== false && !authStore.isLoggedIn) {
        next('/login')
    } else if (to.path === '/login' && authStore.isLoggedIn) {
        next('/')
    } else {
        next()
    }
})

export default router

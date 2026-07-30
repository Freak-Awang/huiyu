<!-- 登录页面：用户认证入口，支持记住账号、自动登录、自定义服务器地址 -->
<template>
  <div class="login-page">
    <DesktopWindowControls transparent />
    <div class="login-card">
      <div class="login-logo">
        <h1>绘语</h1>
      </div>
      <!-- 登录表单 -->
      <form class="login-form" @submit.prevent="handleLogin">
        <!-- 服务器地址输入（桌面端或已配置地址时显示） -->
        <div v-if="showServerConfig" class="form-item">
          <input
            v-model="serverOrigin"
            type="text"
            placeholder="服务器地址，如 https://im.example.com"
            autocomplete="url"
          />
        </div>
        <div class="form-item">
          <input
            v-model="username"
            type="text"
            placeholder="请输入用户名"
            autocomplete="username"
          />
        </div>
        <div class="form-item">
          <input
            v-model="password"
            type="password"
            placeholder="请输入密码"
            autocomplete="current-password"
          />
        </div>
        <div class="form-options">
          <label class="checkbox-label">
            <input v-model="rememberMe" type="checkbox" />
            <span>记住账号</span>
          </label>
          <label class="checkbox-label">
            <input v-model="autoLogin" type="checkbox" />
            <span>自动进入</span>
          </label>
        </div>
        <button class="login-btn" type="submit" :disabled="loading">
          {{ loading ? '登录中...' : '登 录' }}
        </button>
        <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
// 登录页：处理用户认证、记住账号/自动登录、自定义服务器地址配置
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import DesktopWindowControls from '../components/DesktopWindowControls.vue'
import { useAuthStore } from '../stores/auth'
import { getServerOrigin, isDesktopRuntime, setServerOrigin } from '../config/runtime'

const router = useRouter()

const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const serverOrigin = ref(getServerOrigin()) // 服务器地址
const rememberMe = ref(false) // 是否记住账号
const autoLogin = ref(false) // 是否自动登录
const loading = ref(false) // 登录加载状态
const errorMsg = ref('') // 错误提示信息
const hasExplicitServerOrigin =
  !!localStorage.getItem('imServerOrigin') ||
  !!import.meta.env.VITE_IM_SERVER_ORIGIN ||
  !!import.meta.env.VITE_API_BASE_URL
const showServerConfig = isDesktopRuntime() || hasExplicitServerOrigin // 桌面端或已配置地址时显示服务器地址输入框

// 处理登录：校验输入、设置服务器地址、调用认证接口
function handleLogin() {
  if (showServerConfig && !serverOrigin.value.trim()) {
    errorMsg.value = '请输入内网服务器地址'
    return
  }

  if (!username.value || !password.value) {
    errorMsg.value = '请输入用户名和密码'
    return
  }

  loading.value = true
  errorMsg.value = ''

  // 保存服务器地址到本地存储
  try {
    if (serverOrigin.value.trim()) {
      serverOrigin.value = setServerOrigin(serverOrigin.value)
    }
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : '服务器地址无效'
    loading.value = false
    return
  }

  // 调用认证接口，成功后保存记住账号/自动登录偏好并跳转到主页
  authStore.login(username.value, password.value).then(() => {
    if (rememberMe.value) {
      localStorage.setItem('savedUsername', username.value)
      localStorage.setItem('rememberMe', 'true')
    } else {
      localStorage.removeItem('savedUsername')
      localStorage.removeItem('rememberMe')
    }
    localStorage.setItem('autoLogin', autoLogin.value ? 'true' : 'false')
    router.push('/')
  }).catch((err) => {
    errorMsg.value = err.response?.data?.message || err.message || '登录失败'
  }).finally(() => {
    loading.value = false
  })
}

// 挂载时恢复保存的账号信息和自动登录状态
onMounted(async () => {
  const savedUsername = localStorage.getItem('savedUsername')
  const savedRemember = localStorage.getItem('rememberMe')
  const savedAutoLogin = localStorage.getItem('autoLogin')
  localStorage.removeItem('savedPassword') // 安全起见清除保存的密码

  if (savedRemember === 'true') {
    rememberMe.value = true
    if (savedUsername) username.value = savedUsername
  }

  // 自动登录：已有 token 时直接进入主页
  if (savedAutoLogin === 'true') {
    autoLogin.value = true
    if (localStorage.getItem('token')) {
      await authStore.init()
      if (authStore.isLoggedIn) {
        router.push('/')
      }
    }
  }

})
</script>

<style scoped>
.login-page {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-app);
}

.login-card {
  position: relative;
  width: 400px;
  background: var(--bg-surface);
  border-radius: var(--radius-2xl);
  padding: 40px 36px;
  box-shadow: var(--shadow-dialog);
}

.login-logo {
  text-align: center;
  margin-bottom: 32px;
}

.login-logo h1 {
  font-size: 24px;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  /* 表单区域不可拖拽，避免影响输入 */
  -webkit-app-region: no-drag;
}

.form-item input {
  width: 100%;
  height: 44px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  font-size: var(--font-md);
  transition: border-color var(--transition-normal);
  background: var(--bg-input-rest);
}

.form-item input:focus {
  border-color: var(--accent);
  background: var(--bg-surface);
}

.form-options {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-base);
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}

.checkbox-label input {
  accent-color: var(--accent);
}

.login-btn {
  width: 100%;
  height: 44px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  font-size: var(--font-lg);
  border-radius: var(--radius-lg);
  border: none;
  cursor: pointer;
  transition: opacity 0.2s;
  letter-spacing: 4px;
}

.login-btn:hover {
  opacity: 0.9;
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-msg {
  color: var(--danger);
  font-size: var(--font-base);
  text-align: center;
}
</style>

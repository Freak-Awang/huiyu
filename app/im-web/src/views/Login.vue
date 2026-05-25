<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-logo">
        <div class="logo-icon">&#x1F4AC;</div>
        <h1>企业IM</h1>
        <p>企业即时通讯平台</p>
      </div>
      <form class="login-form" @submit.prevent="handleLogin">
        <div v-if="showServerConfig" class="form-item">
          <input
            v-model="serverOrigin"
            type="text"
            placeholder="服务器地址，如 192.168.1.10 或 http://im.local"
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
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { getServerOrigin, isDesktopRuntime, setServerOrigin } from '../config/runtime'

const router = useRouter()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const serverOrigin = ref(getServerOrigin())
const rememberMe = ref(false)
const autoLogin = ref(false)
const loading = ref(false)
const errorMsg = ref('')
const hasExplicitServerOrigin =
  !!localStorage.getItem('imServerOrigin') ||
  !!import.meta.env.VITE_IM_SERVER_ORIGIN ||
  !!import.meta.env.VITE_API_BASE_URL
const showServerConfig = isDesktopRuntime() || hasExplicitServerOrigin

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

  try {
    if (serverOrigin.value.trim()) {
      serverOrigin.value = setServerOrigin(serverOrigin.value)
    }
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : '服务器地址无效'
    loading.value = false
    return
  }

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

onMounted(async () => {
  const savedUsername = localStorage.getItem('savedUsername')
  const savedRemember = localStorage.getItem('rememberMe')
  const savedAutoLogin = localStorage.getItem('autoLogin')
  localStorage.removeItem('savedPassword')

  if (savedRemember === 'true') {
    rememberMe.value = true
    if (savedUsername) username.value = savedUsername
  }

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
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-card {
  width: 400px;
  background: #fff;
  border-radius: 12px;
  padding: 40px 36px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}

.login-logo {
  text-align: center;
  margin-bottom: 32px;
}

.logo-icon {
  font-size: 48px;
  margin-bottom: 8px;
}

.login-logo h1 {
  font-size: 24px;
  color: #333;
  margin-bottom: 4px;
}

.login-logo p {
  font-size: 13px;
  color: #999;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-item input {
  width: 100%;
  height: 44px;
  padding: 0 14px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 0.2s;
  background: #f8f9fa;
}

.form-item input:focus {
  border-color: #667eea;
  background: #fff;
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
  font-size: 13px;
  color: #666;
  cursor: pointer;
  user-select: none;
}

.checkbox-label input {
  accent-color: #667eea;
}

.login-btn {
  width: 100%;
  height: 44px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  font-size: 16px;
  border-radius: 8px;
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
  color: #e74c3c;
  font-size: 13px;
  text-align: center;
}
</style>

<!-- 登录页面：无可恢复会话时的认证入口，支持记住账号 -->
<template>
  <div class="login-page">
    <DesktopWindowControls transparent hide-maximize />
    <main class="login-shell">
      <section class="login-card" aria-labelledby="login-title">
        <div class="login-heading">
          <p class="login-kicker">欢迎回来</p>
          <h2 id="login-title">登录绘语</h2>
          <p>使用你的团队账号继续</p>
        </div>

        <!-- 登录表单 -->
        <form class="login-form" :aria-busy="loading" @submit.prevent="handleLogin">
          <label class="form-item" for="username">
            <span>用户名</span>
            <input
              id="username"
              v-model="username"
              type="text"
              placeholder="请输入用户名"
              autocomplete="username"
            />
          </label>
          <label class="form-item" for="password">
            <span>密码</span>
            <input
              id="password"
              v-model="password"
              type="password"
              placeholder="请输入密码"
              autocomplete="current-password"
            />
          </label>
          <div class="form-options">
            <label class="checkbox-label">
              <input v-model="rememberMe" type="checkbox" />
              <span>记住账号</span>
            </label>
          </div>
          <button class="login-btn" type="submit" :disabled="loading">
            <span v-if="loading" class="login-spinner" aria-hidden="true"></span>
            {{ loading ? '正在登录' : '登录' }}
          </button>
          <p v-if="errorMsg" class="error-msg" role="alert" aria-live="polite">{{ errorMsg }}</p>
        </form>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
// 会话恢复由应用 Bootstrap 完成，登录页只处理用户主动登录。
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import DesktopWindowControls from '../components/DesktopWindowControls.vue'
import { useAuthStore } from '../stores/auth'
import { getServerOrigin } from '../config/runtime'

const router = useRouter()

const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const rememberMe = ref(false) // 是否记住账号
const loading = ref(false) // 登录加载状态
const errorMsg = ref('') // 错误提示信息

// 处理登录：校验输入与服务器配置、调用认证接口
function handleLogin() {
  if (loading.value) return

  if (!getServerOrigin()) {
    errorMsg.value = '服务器配置不可用，请联系管理员'
    return
  }

  if (!username.value || !password.value) {
    errorMsg.value = '请输入用户名和密码'
    return
  }

  loading.value = true
  errorMsg.value = ''

  // 调用认证接口，成功后保存记住账号偏好并跳转到主页
  authStore.login(username.value, password.value).then(() => {
    if (rememberMe.value) {
      localStorage.setItem('savedUsername', username.value)
      localStorage.setItem('rememberMe', 'true')
    } else {
      localStorage.removeItem('savedUsername')
      localStorage.removeItem('rememberMe')
    }
    router.push('/')
  }).catch((err) => {
    errorMsg.value = err.response?.data?.message || err.message || '登录失败'
  }).finally(() => {
    loading.value = false
  })
}

// 挂载时恢复保存的账号信息
onMounted(() => {
  const savedUsername = localStorage.getItem('savedUsername')
  const savedRemember = localStorage.getItem('rememberMe')
  localStorage.removeItem('savedPassword') // 安全起见清除保存的密码

  if (savedRemember === 'true') {
    rememberMe.value = true
    if (savedUsername) username.value = savedUsername
  }

  if (!getServerOrigin()) {
    errorMsg.value = '服务器配置不可用，请联系管理员'
    return
  }

})
</script>

<style scoped>
.login-page {
  width: 100%;
  height: 100%;
  overflow: auto;
  padding: 48px 24px 24px;
  display: flex;
  background: var(--bg-surface);
}

.login-shell {
  width: min(300px, 100%);
  margin: auto;
}

.login-card {
  width: 100%;
}

.login-heading {
  margin-bottom: 24px;
}

.login-kicker {
  margin: 0 0 8px;
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.login-heading h2 {
  font-size: 30px;
  line-height: 1.25;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.login-heading > p:last-child {
  margin-top: 8px;
  color: var(--text-tertiary);
  font-size: var(--font-md);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  /* 表单区域不可拖拽，避免影响输入 */
  -webkit-app-region: no-drag;
}

.form-item {
  display: grid;
  gap: 8px;
}

.form-item > span {
  color: var(--text-secondary);
  font-size: var(--font-base);
  font-weight: 600;
}

.form-item input {
  width: 100%;
  height: 48px;
  padding: 0 15px;
  border: 1px solid var(--border-input);
  border-radius: var(--radius-xl);
  font-size: var(--font-md);
  color: var(--text-primary);
  background: var(--bg-input-rest);
  transition: border-color var(--transition-normal), background-color var(--transition-normal), box-shadow var(--transition-normal);
}

.form-item input:focus {
  border-color: var(--accent);
  background: var(--bg-surface);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent);
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
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  margin-top: 2px;
  background: var(--accent);
  color: #fff;
  font-size: var(--font-md);
  font-weight: 650;
  border-radius: var(--radius-xl);
  border: none;
  cursor: pointer;
  box-shadow: 0 10px 22px color-mix(in srgb, var(--accent) 24%, transparent);
  transition: background-color var(--transition-normal), box-shadow var(--transition-normal);
}

.login-btn:hover:not(:disabled) {
  background: var(--accent-hover);
  box-shadow: 0 12px 26px color-mix(in srgb, var(--accent) 30%, transparent);
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-msg {
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--danger) 28%, transparent);
  border-radius: var(--radius-lg);
  background: var(--danger-bg);
  color: var(--danger);
  font-size: var(--font-base);
  line-height: 1.5;
}

.login-spinner {
  width: 15px;
  height: 15px;
  border: 2px solid rgba(255, 255, 255, 0.42);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .login-spinner {
    animation-duration: 1.5s;
  }
}
</style>

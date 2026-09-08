<!-- 登录页面：用户认证入口，支持记住账号、自动登录、自定义服务器地址 -->
<template>
  <div class="login-page">
    <DesktopWindowControls transparent />
    <main class="login-shell">
      <section class="login-intro" aria-labelledby="welcome-title">
        <div class="brand-mark" aria-hidden="true">绘</div>
        <p class="intro-eyebrow">ARTTALK · 团队沟通空间</p>
        <h1 id="welcome-title">让每一次沟通，<br />都清晰抵达。</h1>
        <p class="intro-copy">为团队打造的安全即时通讯工具，集中承载会话、文件与协作脉络。</p>
        <ul class="intro-points" aria-label="产品特性">
          <li>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 12 3 3 7-7" /></svg>
            内网部署，数据边界清晰
          </li>
          <li>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 12 3 3 7-7" /></svg>
            消息与团队通讯录一站管理
          </li>
        </ul>
      </section>

      <section class="login-card" aria-labelledby="login-title">
        <div class="login-heading">
          <div class="compact-brand" aria-hidden="true">绘</div>
          <p class="login-kicker">欢迎回来</p>
          <h2 id="login-title">登录绘语</h2>
          <p>使用你的团队账号继续</p>
        </div>

        <!-- 登录表单 -->
        <form class="login-form" :aria-busy="loading" @submit.prevent="handleLogin">
          <!-- 桌面客户端连接的内网服务器地址 -->
          <label class="form-item" for="server-origin">
            <span>服务器地址</span>
            <input
              id="server-origin"
              v-model="serverOrigin"
              type="text"
              placeholder="例如 https://im.example.com"
              autocomplete="url"
            />
          </label>
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
            <label class="checkbox-label">
              <input v-model="autoLogin" type="checkbox" />
              <span>自动进入</span>
            </label>
          </div>
          <button class="login-btn" type="submit" :disabled="loading">
            <span v-if="loading" class="login-spinner" aria-hidden="true"></span>
            {{ loading ? '正在登录' : '登录' }}
          </button>
          <p v-if="errorMsg" class="error-msg" role="alert" aria-live="polite">{{ errorMsg }}</p>
        </form>
        <p class="login-footnote">登录即表示你正在访问所属团队的工作空间</p>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
// 登录页：处理用户认证、记住账号/自动登录、自定义服务器地址配置
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import DesktopWindowControls from '../components/DesktopWindowControls.vue'
import { useAuthStore } from '../stores/auth'
import { getServerOrigin, setServerOrigin } from '../config/runtime'

const router = useRouter()

const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const serverOrigin = ref(getServerOrigin()) // 服务器地址
const rememberMe = ref(false) // 是否记住账号
const autoLogin = ref(false) // 是否自动登录
const loading = ref(false) // 登录加载状态
const errorMsg = ref('') // 错误提示信息

// 处理登录：校验输入、设置服务器地址、调用认证接口
function handleLogin() {
  if (!serverOrigin.value.trim()) {
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
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: 32px;
  background:
    radial-gradient(circle at 14% 18%, rgba(99, 102, 241, 0.13), transparent 34%),
    var(--bg-app);
}

.login-shell {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(380px, 0.92fr);
  width: min(960px, 100%);
  min-height: 590px;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 28px;
  background: var(--bg-surface);
  box-shadow: var(--shadow-dialog);
}

.login-intro {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 68px 64px;
  overflow: hidden;
  background: #172036;
  color: #fff;
}

.login-intro::after {
  position: absolute;
  right: -100px;
  bottom: -120px;
  width: 360px;
  height: 360px;
  border: 72px solid rgba(129, 140, 248, 0.1);
  border-radius: 50%;
  content: '';
}

.brand-mark,
.compact-brand {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 15px;
  background: #6674ed;
  color: #fff;
  font-size: 21px;
  font-weight: 700;
  box-shadow: 0 10px 26px rgba(73, 84, 208, 0.34);
}

.intro-eyebrow,
.login-kicker {
  margin-top: 28px;
  color: #aeb8f6;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.16em;
}

.login-intro h1 {
  margin-top: 16px;
  max-width: 450px;
  font-size: clamp(38px, 4vw, 54px);
  line-height: 1.18;
  letter-spacing: -0.04em;
}

.intro-copy {
  max-width: 440px;
  margin-top: 22px;
  color: #cbd3e7;
  font-size: 15px;
  line-height: 1.8;
}

.intro-points {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 12px;
  margin-top: 38px;
  list-style: none;
  color: #e5e9f5;
  font-size: 14px;
}

.intro-points li {
  display: flex;
  align-items: center;
  gap: 10px;
}

.intro-points svg {
  width: 20px;
  height: 20px;
  padding: 3px;
  border-radius: 50%;
  background: rgba(129, 140, 248, 0.18);
  fill: none;
  stroke: #a5b4fc;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.login-card {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 56px 54px;
}

.compact-brand {
  display: none;
}

.login-heading {
  margin-bottom: 30px;
}

.login-kicker {
  margin: 0 0 8px;
  color: var(--accent);
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
  gap: 18px;
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

.login-footnote {
  margin-top: 28px;
  color: var(--text-muted);
  font-size: var(--font-xs);
  line-height: 1.6;
  text-align: center;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 860px) {
  .login-page {
    align-items: stretch;
    padding: 0;
    background: var(--bg-surface);
  }

  .login-shell {
    display: block;
    min-height: 100%;
    border: none;
    border-radius: 0;
    box-shadow: none;
  }

  .login-intro {
    display: none;
  }

  .login-card {
    min-height: 100%;
    padding: 48px clamp(24px, 8vw, 44px);
  }

  .compact-brand {
    display: grid;
    margin-bottom: 28px;
  }

  .login-heading h2 {
    font-size: 28px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .login-spinner {
    animation-duration: 1.5s;
  }
}
</style>

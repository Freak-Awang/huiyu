import { createSSRApp, h, reactive } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: null as any }))
vi.mock('./stores/auth', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('./stores/update', () => ({ useUpdateStore: () => ({ init: vi.fn(), stop: vi.fn() }) }))
vi.mock('./components/UpdateDialog.vue', () => ({ default: { render: () => null } }))
vi.mock('./components/DesktopWindowControls.vue', () => ({ default: { render: () => null } }))
vi.mock('./router', async () => {
  const { createRouter, createMemoryHistory } = await import('vue-router')
  const { h } = await import('vue')
  return { default: createRouter({ history: createMemoryHistory(), routes: [
    { path: '/login', name: 'Login', component: { render: () => h('div', 'LOGIN-VIEW') } },
    { path: '/', name: 'Chat', component: { render: () => h('div', 'CHAT-VIEW') } },
  ] }) }
})
import App from './App.vue'
import router from './router'
beforeEach(() => {
  mocks.auth = reactive({ authState: 'initializing', restoreError: '', restoring: false, token: '', restoreSession: vi.fn() })
  vi.stubGlobal('window', {})
})
async function render(path: string) {
  await router.push(path)
  await router.isReady()
  return renderToString(createSSRApp({ render: () => h(App) }).use(router))
}
describe('auth bootstrap rendering', () => {
  it('hides Login while validating local credentials', async () => {
    const html = await render('/login')
    expect(html).toContain('正在恢复登录状态')
    expect(html).not.toContain('LOGIN-VIEW')
    expect(html).not.toContain('CHAT-VIEW')
  })
  it('keeps loading visible when recovery succeeded but the old Login route has not committed yet', async () => {
    mocks.auth.authState = 'authenticated'
    mocks.auth.token = 'session'
    const html = await render('/login')
    expect(html).not.toContain('LOGIN-VIEW')
  })
  it('renders Chat only with an authenticated session and settled Chat route', async () => {
    mocks.auth.authState = 'authenticated'
    mocks.auth.token = 'session'
    const html = await render('/')
    expect(html).toContain('CHAT-VIEW')
    expect(html).not.toContain('LOGIN-VIEW')
  })
  it('renders Login once the absence of credentials has been determined', async () => {
    mocks.auth.authState = 'unauthenticated'
    expect(await render('/login')).toContain('LOGIN-VIEW')
  })
})

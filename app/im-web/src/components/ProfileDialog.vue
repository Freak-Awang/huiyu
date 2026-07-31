<!-- 用户资料弹窗：查看/编辑个人信息，支持头像上传与复制资料 -->
<template>
  <div class="profile-overlay" @click.self="close">
    <div class="profile-dialog">
      <!-- 头像区域：展示头像、在线状态 -->
      <header class="profile-cover">
        <button type="button" class="profile-close" title="关闭" @click="close">x</button>
        <div class="profile-avatar">
          <img v-if="avatarPreview" :src="avatarPreview" @error="avatarLoadFailed = true" alt="头像" />
          <span v-else>{{ avatarInitial }}</span>
          <span class="presence-dot" :class="`presence-${presenceStatus}`"></span>
        </div>
        <div class="profile-title">
          <h2>{{ displayName }}</h2>
          <span>{{ presenceLabel }}</span>
        </div>
      </header>

      <main class="profile-body">
        <template v-if="editing">
          <label class="profile-field">
            <span>头像</span>
            <div class="avatar-edit-row">
              <button type="button" class="plain-btn" :disabled="saving" @click="pickAvatar">选择图片</button>
              <span class="avatar-file-name">{{ selectedAvatarName || '支持 JPG、PNG、GIF、WebP' }}</span>
            </div>
            <input
              ref="fileInputRef"
              type="file"
              accept="image/*"
              hidden
              @change="onAvatarSelected"
            />
          </label>

          <label class="profile-field">
            <span>昵称</span>
            <input v-model="form.nickname" :disabled="saving" maxlength="30" />
          </label>

          <label class="profile-field">
            <span>邮箱</span>
            <input v-model="form.email" :disabled="saving" maxlength="80" />
          </label>

          <label class="profile-field">
            <span>手机号</span>
            <input v-model="form.phone" :disabled="saving" maxlength="30" />
          </label>

          <label class="profile-field">
            <span>个性签名</span>
            <textarea
              v-model="form.signature"
              maxlength="128"
              rows="3"
              :disabled="saving"
              placeholder="写一句展示在聊天中的签名"
            ></textarea>
            <small>{{ form.signature.length }}/128</small>
          </label>
        </template>

        <template v-else>
          <div class="profile-info-grid">
            <span>账号</span>
            <strong>{{ profileUser.username || '-' }}</strong>
            <span>部门</span>
            <strong>{{ profileUser.deptName || '-' }}</strong>
            <span>邮箱</span>
            <strong>{{ profileUser.email || '-' }}</strong>
            <span>手机号</span>
            <strong>{{ profileUser.phone || '-' }}</strong>
          </div>
          <div class="signature-box">
            <span>个性签名</span>
            <p>{{ profileUser.signature || '这个人还没有填写个性签名' }}</p>
          </div>
        </template>

        <p v-if="errorText" class="profile-error">{{ errorText }}</p>
        <p v-if="statusText" class="profile-status">{{ statusText }}</p>
      </main>

      <footer class="profile-footer">
        <template v-if="editing">
          <button type="button" class="cancel-btn" :disabled="saving" @click="cancelEdit">取消</button>
          <button type="button" class="save-btn" :disabled="saving" @click="saveProfile">
            {{ saving ? '保存中...' : '保存' }}
          </button>
        </template>
        <template v-else>
          <button type="button" class="cancel-btn" @click="copyProfile">复制资料</button>
          <button v-if="isSelf" type="button" class="save-btn" @click="startEdit">编辑资料</button>
        </template>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
// 用户资料弹窗：展示/编辑个人资料、上传头像与复制资料
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { uploadAvatar } from '../api/file'
import { updateProfile, type UserProfile } from '../api/user'
import { useAuthStore, type UserInfo } from '../stores/auth'
import { getPresenceLabel, normalizePresenceStatus, type PresenceStatus } from '../utils/presence'

type ProfileUser = Partial<UserProfile & UserInfo> & {
  id?: string | number
  userId?: string | number
}

const props = defineProps<{
  user?: ProfileUser | null
  presence?: PresenceStatus
}>()

const emit = defineEmits<{
  close: []
  saved: [user: UserInfo]
}>()

const authStore = useAuthStore()
const fileInputRef = ref<HTMLInputElement | null>(null) // 头像文件选择 input 引用
const selectedAvatar = ref<File | null>(null) // 已选择的头像文件
const selectedAvatarName = ref('') // 已选头像文件名
const avatarObjectUrl = ref('') // 头像预览 Blob URL
const editing = ref(false) // 是否处于编辑模式
const saving = ref(false) // 是否正在保存
const errorText = ref('') // 错误提示文本
const statusText = ref('') // 状态提示文本

const emptyUser: ProfileUser = {}
const profileUser = computed<ProfileUser>(() => props.user || authStore.currentUser || emptyUser) // 当前展示的用户资料
const profileUserId = computed(() => String(profileUser.value.userId || profileUser.value.id || ''))
const isSelf = computed(() => profileUserId.value === String(authStore.currentUser?.userId || '')) // 是否查看自己的资料
const displayName = computed(() => profileUser.value.nickname || profileUser.value.username || '用户')
const avatarInitial = computed(() => displayName.value[0] || 'U') // 头像文字回退（首字母）
const avatarLoadFailed = ref(false) // 头像加载失败标记
const avatarPreview = computed(() => {
  const url = avatarObjectUrl.value || profileUser.value.avatar || ''
  return url && !avatarLoadFailed.value ? url : ''
})
const presenceStatus = computed(() => normalizePresenceStatus(props.presence || (isSelf.value ? 'online' : 'offline'))) // 在线状态
const presenceLabel = computed(() => getPresenceLabel(presenceStatus.value))

const form = reactive({
  nickname: '',
  email: '',
  phone: '',
  signature: '',
})

watch(
  profileUser,
  () => {
    resetForm()
    editing.value = false
    errorText.value = ''
    statusText.value = ''
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  revokeAvatarObjectUrl()
})

// 重置编辑表单为当前用户资料的值
function resetForm() {
  form.nickname = profileUser.value.nickname || ''
  form.email = profileUser.value.email || ''
  form.phone = profileUser.value.phone || ''
  form.signature = profileUser.value.signature || ''
  selectedAvatar.value = null
  selectedAvatarName.value = ''
  avatarLoadFailed.value = false
  revokeAvatarObjectUrl()
}

function close() {
  if (saving.value) return
  emit('close')
}

function startEdit() {
  if (!isSelf.value) return
  editing.value = true
  statusText.value = ''
}

function cancelEdit() {
  resetForm()
  editing.value = false
}

function pickAvatar() {
  fileInputRef.value?.click()
}

// 处理头像文件选择：校验类型和大小，生成预览 Blob URL
function onAvatarSelected(event: Event) {
  errorText.value = ''
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    errorText.value = '请选择图片文件'
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    errorText.value = '头像图片不能超过 5MB'
    return
  }
  revokeAvatarObjectUrl()
  selectedAvatar.value = file
  selectedAvatarName.value = file.name
  avatarObjectUrl.value = URL.createObjectURL(file)
}

// 保存个人资料：上传头像（如有）、调用更新接口、同步 authStore
async function saveProfile() {
  if (!isSelf.value) return
  const nickname = form.nickname.trim()
  if (!nickname) {
    errorText.value = '昵称不能为空'
    return
  }
  if (form.signature.trim().length > 128) {
    errorText.value = '个性签名最多 128 字'
    return
  }

  saving.value = true
  errorText.value = ''
  statusText.value = ''
  try {
    let uploadedAvatarUrl = ''
    if (selectedAvatar.value) {
      const avatarRes = await uploadAvatar(selectedAvatar.value)
      uploadedAvatarUrl = avatarRes.data.url
    }

    const res = await updateProfile({
      nickname,
      email: form.email.trim(),
      phone: form.phone.trim(),
      signature: form.signature.trim(),
    })
    const data = res.data as any
    const currentUser = authStore.currentUser
    const updated: UserInfo = {
      userId: String(data.userId || data.id || currentUser?.userId || ''),
      username: data.username || currentUser?.username || '',
      nickname: data.nickname || nickname,
      avatar: data.avatar || uploadedAvatarUrl || currentUser?.avatar || '',
      signature: data.signature || form.signature.trim(),
      role: data.role || currentUser?.role || '',
      email: data.email || form.email.trim(),
      phone: data.phone || form.phone.trim(),
      deptId: data.deptId ? String(data.deptId) : currentUser?.deptId || '',
      deptName: data.deptName || currentUser?.deptName || '',
      status: data.status ?? currentUser?.status ?? '',
      updatedAt: data.updatedAt || currentUser?.updatedAt || '',
    }
    authStore.updateCurrentUser(updated)
    const synchronizedUser = authStore.currentUser ? { ...authStore.currentUser } : updated
    emit('saved', synchronizedUser)
    editing.value = false
    statusText.value = '资料已保存'
    selectedAvatar.value = null
    selectedAvatarName.value = ''
    revokeAvatarObjectUrl()
  } catch (err: any) {
    errorText.value = err?.response?.data?.message || err?.message || '保存个人资料失败'
  } finally {
    saving.value = false
  }
}

// 复制用户资料到剪贴板
async function copyProfile() {
  const text = [
    `昵称：${displayName.value}`,
    `账号：${profileUser.value.username || '-'}`,
    `部门：${profileUser.value.deptName || '-'}`,
    `邮箱：${profileUser.value.email || '-'}`,
    `手机号：${profileUser.value.phone || '-'}`,
    `个性签名：${profileUser.value.signature || '-'}`,
  ].join('\n')
  try {
    await navigator.clipboard.writeText(text)
    statusText.value = '资料已复制'
  } catch {
    errorText.value = '复制失败'
  }
}

// 释放头像预览 Blob URL 以回收内存
function revokeAvatarObjectUrl() {
  if (!avatarObjectUrl.value) return
  URL.revokeObjectURL(avatarObjectUrl.value)
  avatarObjectUrl.value = ''
}
</script>

<style scoped>
.profile-overlay {
  position: fixed;
  inset: 0;
  z-index: 1250;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-overlay);
}

.profile-dialog {
  width: min(430px, calc(100vw - 40px));
  overflow: hidden;
  border-radius: var(--radius-xl);
  background: var(--bg-surface);
  box-shadow: var(--shadow-dialog);
}

.profile-cover {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 24px;
  background: linear-gradient(135deg, #4f7cff, #24a19c);
  color: #fff;
}

.profile-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  cursor: pointer;
}

.profile-avatar {
  position: relative;
  width: 72px;
  height: 72px;
  flex: 0 0 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3px solid rgba(255, 255, 255, 0.75);
  border-radius: 50%;
  background: #667eea;
  font-size: 26px;
  font-weight: 600;
}

.profile-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.presence-dot {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 14px;
  height: 14px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: #9ca3af;
}

.presence-online { background: #22c55e; }
.presence-busy { background: #ef4444; }
.presence-away { background: #f59e0b; }
.presence-offline { background: #9ca3af; }

.profile-title h2 {
  margin: 0 0 6px;
  font-size: 22px;
}

.profile-title span {
  font-size: 13px;
  opacity: 0.88;
}

.profile-body {
  padding: 22px 24px 10px;
}

.profile-info-grid {
  display: grid;
  grid-template-columns: 70px 1fr;
  gap: 12px 16px;
  font-size: 14px;
}

.profile-info-grid span,
.signature-box span {
  color: var(--text-tertiary);
}

.profile-info-grid strong {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--text-primary);
  font-weight: 500;
}

.signature-box {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}

.signature-box p {
  margin: 8px 0 0;
  color: var(--text-primary);
  line-height: 1.6;
}

.profile-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
  color: var(--text-primary);
  font-size: var(--font-md);
  font-weight: 600;
}

.profile-field input,
.profile-field textarea {
  border: 1px solid var(--border-input);
  border-radius: var(--radius-lg);
  color: var(--text-primary);
  font-size: var(--font-md);
  line-height: 1.5;
  padding: 9px 11px;
}

.profile-field textarea {
  resize: none;
}

.profile-field input:focus,
.profile-field textarea:focus {
  border-color: #4f7cff;
  outline: none;
}

.profile-field small {
  align-self: flex-end;
  color: var(--text-tertiary);
  font-size: var(--font-sm);
  font-weight: 400;
}

.avatar-edit-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.plain-btn,
.cancel-btn,
.save-btn {
  height: 34px;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: var(--font-base);
}

.plain-btn {
  min-width: 84px;
  background: var(--accent-bg-light);
  color: var(--accent);
}

.avatar-file-name {
  min-width: 0;
  overflow: hidden;
  color: var(--text-tertiary);
  font-size: var(--font-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-error,
.profile-status {
  margin: 12px 0 0;
  font-size: var(--font-base);
}

.profile-error {
  color: var(--danger-strong);
}

.profile-status {
  color: var(--success);
}

.profile-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px 22px;
}

.cancel-btn {
  min-width: 72px;
  background: var(--bg-header);
  color: var(--text-secondary);
}

.save-btn {
  min-width: 86px;
  background: #4f7cff;
  color: #fff;
}

.cancel-btn:disabled,
.save-btn:disabled,
.plain-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>

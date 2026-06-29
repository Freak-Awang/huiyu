<template>
  <div class="profile-overlay" @click.self="close">
    <div class="profile-dialog">
      <header class="profile-cover">
        <button type="button" class="profile-close" title="关闭" @click="close">x</button>
        <div class="profile-avatar">
          <img v-if="avatarPreview" :src="avatarPreview" alt="头像" />
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
          <button v-else type="button" class="save-btn" @click="$emit('start-chat', profileUser)">发消息</button>
        </template>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
// ?????ProfileDialog contains reusable UI behavior with local interaction state.

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
  'start-chat': [user: ProfileUser]
}>()

const authStore = useAuthStore()
const fileInputRef = ref<HTMLInputElement | null>(null)
const selectedAvatar = ref<File | null>(null)
const selectedAvatarName = ref('')
const avatarObjectUrl = ref('')
const editing = ref(false)
const saving = ref(false)
const errorText = ref('')
const statusText = ref('')

const emptyUser: ProfileUser = {}
const profileUser = computed<ProfileUser>(() => props.user || authStore.currentUser || emptyUser)
const profileUserId = computed(() => String(profileUser.value.userId || profileUser.value.id || ''))
const isSelf = computed(() => profileUserId.value === String(authStore.currentUser?.userId || ''))
const displayName = computed(() => profileUser.value.nickname || profileUser.value.username || '用户')
const avatarInitial = computed(() => displayName.value[0] || 'U')
const avatarPreview = computed(() => avatarObjectUrl.value || profileUser.value.avatar || '')
const presenceStatus = computed(() => normalizePresenceStatus(props.presence || (isSelf.value ? 'online' : 'offline')))
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

function resetForm() {
  form.nickname = profileUser.value.nickname || ''
  form.email = profileUser.value.email || ''
  form.phone = profileUser.value.phone || ''
  form.signature = profileUser.value.signature || ''
  selectedAvatar.value = null
  selectedAvatarName.value = ''
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
    }
    authStore.updateCurrentUser(updated)
    emit('saved', updated)
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
  background: rgba(0, 0, 0, 0.38);
}

.profile-dialog {
  width: min(430px, calc(100vw - 40px));
  overflow: hidden;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 22px 70px rgba(0, 0, 0, 0.24);
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
  overflow: hidden;
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
.presence-dnd { background: #8b5cf6; }
.presence-invisible,
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
  color: #7b8190;
}

.profile-info-grid strong {
  min-width: 0;
  overflow-wrap: anywhere;
  color: #273142;
  font-weight: 500;
}

.signature-box {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid #eef0f4;
}

.signature-box p {
  margin: 8px 0 0;
  color: #273142;
  line-height: 1.6;
}

.profile-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
  color: #273142;
  font-size: 14px;
  font-weight: 600;
}

.profile-field input,
.profile-field textarea {
  border: 1px solid #d8dce6;
  border-radius: 8px;
  color: #333;
  font-size: 14px;
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
  color: #8a8f99;
  font-size: 12px;
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
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}

.plain-btn {
  min-width: 84px;
  background: #eef0ff;
  color: #4f63d8;
}

.avatar-file-name {
  min-width: 0;
  overflow: hidden;
  color: #8a8f99;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-error,
.profile-status {
  margin: 12px 0 0;
  font-size: 13px;
}

.profile-error {
  color: #d93026;
}

.profile-status {
  color: #15803d;
}

.profile-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px 22px;
}

.cancel-btn {
  min-width: 72px;
  background: #f0f1f5;
  color: #4b5563;
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

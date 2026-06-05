<template>
  <div class="profile-overlay" @click.self="close">
    <div class="profile-dialog">
      <header class="profile-header">
        <div>
          <h2>个人资料</h2>
          <p>头像和个性签名会在聊天中展示</p>
        </div>
        <button type="button" class="profile-close" title="关闭" @click="close">×</button>
      </header>

      <main class="profile-body">
        <section class="avatar-section">
          <div class="profile-avatar">
            <img v-if="avatarPreview" :src="avatarPreview" alt="头像预览" />
            <span v-else>{{ avatarInitial }}</span>
          </div>
          <div class="avatar-actions">
            <button type="button" class="plain-btn" :disabled="saving" @click="pickAvatar">
              选择头像
            </button>
            <span v-if="selectedAvatarName" class="avatar-file-name">{{ selectedAvatarName }}</span>
            <span v-else class="avatar-hint">支持 JPG、PNG、GIF 等图片</span>
          </div>
          <input
            ref="fileInputRef"
            type="file"
            accept="image/*"
            hidden
            @change="onAvatarSelected"
          />
        </section>

        <label class="profile-field">
          <span>个性签名</span>
          <textarea
            v-model="signature"
            maxlength="128"
            rows="4"
            :disabled="saving"
            placeholder="写一句展示在聊天中的个性签名"
          ></textarea>
          <small>{{ signature.length }}/128</small>
        </label>

        <p v-if="errorText" class="profile-error">{{ errorText }}</p>
      </main>

      <footer class="profile-footer">
        <button type="button" class="cancel-btn" :disabled="saving" @click="close">取消</button>
        <button type="button" class="save-btn" :disabled="saving" @click="saveProfile">
          {{ saving ? '保存中...' : '保存' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { uploadAvatar } from '../api/file'
import { updateProfile } from '../api/user'
import { useAuthStore } from '../stores/auth'

const emit = defineEmits<{
  close: []
}>()

const authStore = useAuthStore()
const fileInputRef = ref<HTMLInputElement | null>(null)
const selectedAvatar = ref<File | null>(null)
const selectedAvatarName = ref('')
const avatarObjectUrl = ref('')
const signature = ref(authStore.currentUser?.signature || '')
const saving = ref(false)
const errorText = ref('')

const avatarPreview = computed(() => avatarObjectUrl.value || authStore.currentUser?.avatar || '')
const avatarInitial = computed(() => (authStore.currentUser?.nickname || authStore.currentUser?.username || 'U')[0])

onBeforeUnmount(() => {
  revokeAvatarObjectUrl()
})

function close() {
  if (saving.value) return
  emit('close')
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
  const nextSignature = signature.value.trim()
  if (nextSignature.length > 128) {
    errorText.value = '个性签名最多128字'
    return
  }

  saving.value = true
  errorText.value = ''
  try {
    let uploadedAvatarUrl = ''
    if (selectedAvatar.value) {
      const avatarRes = await uploadAvatar(selectedAvatar.value)
      uploadedAvatarUrl = avatarRes.data.url
    }

    const currentUser = authStore.currentUser
    const profileRes = await updateProfile({
      nickname: currentUser?.nickname || '',
      email: currentUser?.email || '',
      phone: currentUser?.phone || '',
      signature: nextSignature,
    })
    const data = profileRes.data as any

    authStore.updateCurrentUser({
      userId: String(data.userId || data.id || currentUser?.userId || ''),
      username: data.username || currentUser?.username || '',
      nickname: data.nickname || currentUser?.nickname || '',
      avatar: data.avatar || uploadedAvatarUrl || currentUser?.avatar || '',
      signature: data.signature || nextSignature,
      role: data.role || currentUser?.role || '',
      email: data.email || currentUser?.email || '',
      phone: data.phone || currentUser?.phone || '',
      deptId: data.deptId ? String(data.deptId) : currentUser?.deptId || '',
      deptName: data.deptName || currentUser?.deptName || '',
    })
    emit('close')
  } catch (err: any) {
    errorText.value = err?.response?.data?.message || err?.message || '保存个人资料失败'
  } finally {
    saving.value = false
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

.profile-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 22px 24px 16px;
  border-bottom: 1px solid #eef0f4;
}

.profile-header h2 {
  margin: 0;
  color: #1f2937;
  font-size: 20px;
}

.profile-header p {
  margin: 5px 0 0;
  color: #8a8f99;
  font-size: 13px;
}

.profile-close {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #8a8f99;
  cursor: pointer;
  font-size: 24px;
  line-height: 1;
}

.profile-close:hover {
  background: #f0f1f5;
  color: #333;
}

.profile-body {
  padding: 22px 24px 10px;
}

.avatar-section {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 22px;
}

.profile-avatar {
  width: 76px;
  height: 76px;
  flex: 0 0 76px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 50%;
  background: #667eea;
  color: #fff;
  font-size: 26px;
  font-weight: 600;
}

.profile-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-actions {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
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
  width: 92px;
  background: #eef0ff;
  color: #4f63d8;
}

.plain-btn:hover {
  background: #dde2ff;
}

.avatar-file-name,
.avatar-hint {
  max-width: 250px;
  overflow: hidden;
  color: #8a8f99;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: #273142;
  font-size: 14px;
  font-weight: 600;
}

.profile-field textarea {
  resize: none;
  border: 1px solid #d8dce6;
  border-radius: 8px;
  color: #333;
  font-size: 14px;
  line-height: 1.5;
  padding: 10px 12px;
}

.profile-field textarea:focus {
  border-color: #667eea;
  outline: none;
}

.profile-field small {
  align-self: flex-end;
  color: #8a8f99;
  font-size: 12px;
  font-weight: 400;
}

.profile-error {
  margin: 12px 0 0;
  color: #d93026;
  font-size: 13px;
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
  background: #667eea;
  color: #fff;
}

.cancel-btn:disabled,
.save-btn:disabled,
.plain-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>

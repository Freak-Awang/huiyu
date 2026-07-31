<template>
  <div class="group-create-overlay" @click.self="requestClose">
    <section
      class="group-create-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="group-create-title"
      @keydown.esc.prevent="requestClose"
      @keydown.enter="handleEnter"
    >
      <header class="group-create-header">
        <h2 id="group-create-title">创建群聊</h2>
        <button
          type="button"
          class="icon-button"
          :disabled="submitting"
          aria-label="关闭创建群聊"
          @click="requestClose"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </header>

      <div class="group-create-content" :aria-busy="submitting">
        <section class="contact-picker" aria-label="选择联系人">
          <div class="contact-search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m16.5 16.5 4 4" />
            </svg>
            <input
              ref="searchInputRef"
              v-model="keyword"
              type="search"
              placeholder="搜索联系人、备注名或账号"
              aria-label="搜索联系人"
              :disabled="submitting"
              @input="scheduleSearch"
            />
            <button
              v-if="keyword"
              type="button"
              class="search-clear"
              aria-label="清空搜索"
              :disabled="submitting"
              @click="clearSearch"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m7 7 10 10M17 7 7 17" />
              </svg>
            </button>
          </div>

          <div
            class="contact-scroll"
            role="region"
            aria-label="联系人列表"
            tabindex="0"
          >
            <div v-if="loadingContacts || searching" class="picker-state" role="status">
              <span class="loading-spinner" aria-hidden="true"></span>
              {{ searching ? '正在搜索…' : '正在加载联系人…' }}
            </div>

            <template v-else-if="keyword">
              <div v-if="searchResults.length" class="contact-group">
                <div class="contact-group-label">
                  搜索结果
                  <span>{{ searchResults.length }}</span>
                </div>
                <ContactRows
                  :users="searchResults"
                  :selected-ids="selectedIdList"
                  :selection-full="selectionFull"
                  :failed-avatars="failedAvatarList"
                  @toggle="toggleMember"
                  @avatar-error="markAvatarFailed"
                />
              </div>
              <div v-else class="picker-empty">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m16.5 16.5 4 4M8.5 11h5" />
                </svg>
                <strong>未找到联系人</strong>
                <span>换个关键词试试，或清空搜索</span>
                <button type="button" @click="clearSearch">清空搜索</button>
              </div>
            </template>

            <template v-else>
              <div class="contact-group">
                <button
                  type="button"
                  class="contact-group-toggle"
                  :aria-expanded="recentExpanded"
                  @click="recentExpanded = !recentExpanded"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" :class="{ expanded: recentExpanded }">
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                  <span>最近聊天</span>
                  <span class="group-count">{{ recentContacts.length }}</span>
                </button>
                <ContactRows
                  v-if="recentExpanded"
                  :users="recentContacts"
                  :selected-ids="selectedIdList"
                  :selection-full="selectionFull"
                  :failed-avatars="failedAvatarList"
                  @toggle="toggleMember"
                  @avatar-error="markAvatarFailed"
                />
                <p v-if="recentExpanded && !recentContacts.length" class="group-empty">暂无最近联系人</p>
              </div>

              <div v-for="group in contactGroups" :key="group.name" class="contact-group">
                <button
                  type="button"
                  class="contact-group-toggle"
                  :aria-expanded="expandedGroups.has(group.name)"
                  @click="toggleGroup(group.name)"
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    :class="{ expanded: expandedGroups.has(group.name) }"
                  >
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                  <span>{{ group.name }}</span>
                  <span class="group-count">{{ group.users.length }}</span>
                </button>
                <ContactRows
                  v-if="expandedGroups.has(group.name)"
                  :users="group.users"
                  :selected-ids="selectedIdList"
                  :selection-full="selectionFull"
                  :failed-avatars="failedAvatarList"
                  @toggle="toggleMember"
                  @avatar-error="markAvatarFailed"
                />
              </div>
            </template>
          </div>
        </section>

        <section class="selected-panel" aria-label="已选成员">
          <div class="selected-heading">
            <div>
              <h3>已选择 {{ selectedMembers.length }} 人</h3>
              <p>创建后共 {{ selectedMembers.length + 1 }} 人（包括自己）</p>
            </div>
            <span v-if="selectionFull" class="limit-badge">已达上限</span>
          </div>

          <div v-if="selectedMembers.length" class="selected-list">
            <article
              v-for="member in selectedMembers"
              :key="memberId(member)"
              class="selected-member"
            >
              <div class="member-avatar" aria-hidden="true">
                <img
                  v-if="member.avatar && !failedAvatars.has(member.avatar)"
                  :src="member.avatar"
                  alt=""
                  @error="markAvatarFailed(member.avatar)"
                />
                <span v-else>{{ avatarInitial(member) }}</span>
              </div>
              <div class="member-copy">
                <strong>{{ displayName(member) }}</strong>
                <span>{{ auxiliaryInfo(member) }}</span>
              </div>
              <button
                type="button"
                class="remove-member"
                :aria-label="`移除 ${displayName(member)}`"
                :disabled="submitting"
                @click="removeMember(member)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m7 7 10 10M17 7 7 17" />
                </svg>
              </button>
            </article>
          </div>

          <div v-else class="selected-empty">
            <div class="group-avatar-mark" aria-hidden="true">群</div>
            <strong>请选择需要加入群聊的联系人</strong>
            <span>至少选择 2 名联系人</span>
          </div>

          <footer class="group-create-footer">
            <div class="submit-feedback" aria-live="polite">
              <p v-if="errorMessage" class="submit-error" role="alert">{{ errorMessage }}</p>
              <p v-else-if="slowMessage" class="submit-note">{{ slowMessage }}</p>
              <p v-else class="submit-hint">{{ submitHint }}</p>
            </div>
            <div class="footer-actions">
              <button
                type="button"
                class="secondary-button"
                :disabled="submitting"
                @click="requestClose"
              >
                取消
              </button>
              <button
                type="button"
                class="primary-button"
                :disabled="!canSubmit"
                @click="submitGroup"
              >
                <span v-if="submitting" class="loading-spinner" aria-hidden="true"></span>
                {{ submitting ? '正在创建…' : '创建群聊' }}
              </button>
            </div>
          </footer>
        </section>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, type PropType } from 'vue'
import { createConversation, type Conversation } from '../api/conversation'
import { getDeptTree, type DeptNode } from '../api/dept'
import { getUsersByDept, type UserProfile } from '../api/user'
import { useUserProfileStore } from '../stores/userProfiles'

type Contact = UserProfile & { id?: string | number }

const MIN_GROUP_MEMBERS = 2
const MAX_GROUP_MEMBERS = 200

const props = defineProps<{
  conversations: Conversation[]
  currentUserId: string
  initialContacts?: UserProfile[]
}>()

const emit = defineEmits<{
  close: []
  created: [conversation: Conversation]
}>()

const userProfileStore = useUserProfileStore()
const searchInputRef = ref<HTMLInputElement | null>(null)
const keyword = ref('')
const allContacts = ref<Contact[]>([])
const searchResults = ref<Contact[]>([])
const selectedMembers = ref<Contact[]>([])
const loadingContacts = ref(true)
const searching = ref(false)
const submitting = ref(false)
const slowMessage = ref('')
const errorMessage = ref('')
const recentExpanded = ref(true)
const expandedGroups = ref(new Set<string>())
const failedAvatars = ref(new Set<string>())
const requestId = ref(createRequestId())
let searchTimer: ReturnType<typeof setTimeout> | null = null
let slowTimer: ReturnType<typeof setTimeout> | null = null
let searchGeneration = 0

const selectedIdList = computed(() => selectedMembers.value.map(memberId))
const failedAvatarList = computed(() => [...failedAvatars.value])
const selectionFull = computed(() => selectedMembers.value.length >= MAX_GROUP_MEMBERS)
const canSubmit = computed(
  () => selectedMembers.value.length >= MIN_GROUP_MEMBERS && !submitting.value,
)
const submitHint = computed(() => {
  const remaining = MIN_GROUP_MEMBERS - selectedMembers.value.length
  return remaining > 0 ? `还需选择 ${remaining} 名联系人` : '成员已确认，可以创建群聊'
})

const recentContacts = computed(() => {
  const contactsById = new Map(allContacts.value.map((user) => [memberId(user), user]))
  const seen = new Set<string>()
  const recent: Contact[] = []
  for (const conversation of props.conversations) {
    if (conversation.type !== 'SINGLE') continue
    const peerId = conversation.members?.find((member) => member.userId !== props.currentUserId)?.userId
      || conversation.members?.[0]?.userId
      || ''
    if (!peerId || seen.has(peerId)) continue
    const contact = contactsById.get(peerId)
    if (!contact) continue
    seen.add(peerId)
    recent.push(contact)
    if (recent.length >= 12) break
  }
  return recent
})

const contactGroups = computed(() => {
  const groups = new Map<string, Contact[]>()
  for (const user of allContacts.value) {
    const groupName = user.deptName?.trim() || '其他联系人'
    const users = groups.get(groupName) || []
    users.push(user)
    groups.set(groupName, users)
  }
  return [...groups.entries()]
    .map(([name, users]) => ({
      name,
      users: users.sort((a, b) => displayName(a).localeCompare(displayName(b), 'zh-CN')),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
})

const ContactRows = defineComponent({
  name: 'ContactRows',
  props: {
    users: { type: Array as PropType<Contact[]>, required: true },
    selectedIds: { type: Array as PropType<string[]>, required: true },
    selectionFull: { type: Boolean, required: true },
    failedAvatars: { type: Array as PropType<string[]>, required: true },
  },
  emits: ['toggle', 'avatar-error'],
  setup(rowProps, { emit: rowEmit }) {
    return () => h(
      'div',
      { class: 'contact-rows' },
      rowProps.users.map((user) => {
        const id = memberId(user)
        const selected = rowProps.selectedIds.includes(id)
        const disabled = !selected && (rowProps.selectionFull || !isActiveContact(user))
        const avatarVisible = Boolean(user.avatar && !rowProps.failedAvatars.includes(user.avatar))
        return h(
          'button',
          {
            type: 'button',
            class: ['contact-row', { selected, disabled }],
            disabled,
            'aria-pressed': selected,
            title: disabled && rowProps.selectionFull ? '已达到群成员上限' : undefined,
            onClick: () => rowEmit('toggle', user),
          },
          [
            h('span', { class: 'selection-control', 'aria-hidden': 'true' }, selected
              ? [h('svg', { viewBox: '0 0 24 24' }, [h('path', { d: 'm5 12 4 4L19 6' })])]
              : []),
            h('span', { class: 'member-avatar', 'aria-hidden': 'true' }, avatarVisible
              ? [h('img', {
                  src: user.avatar,
                  alt: '',
                  onError: () => rowEmit('avatar-error', user.avatar),
                })]
              : avatarInitial(user)),
            h('span', { class: 'member-copy' }, [
              h('strong', displayName(user)),
              h('span', auxiliaryInfo(user)),
            ]),
            !isActiveContact(user)
              ? h('span', { class: 'disabled-label' }, '不可选')
              : null,
          ],
        )
      }),
    )
  },
})

onMounted(async () => {
  await loadContacts()
  await nextTick()
  searchInputRef.value?.focus()
})

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
  if (slowTimer) clearTimeout(slowTimer)
})

async function loadContacts() {
  loadingContacts.value = true
  if (props.initialContacts?.length) {
    userProfileStore.upsertProfiles(props.initialContacts)
    allContacts.value = uniqueContacts(props.initialContacts)
    loadingContacts.value = false
    return
  }
  try {
    const [deptResponse, unassignedResponse] = await Promise.all([
      getDeptTree(),
      getUsersByDept(),
    ])
    const departments = flattenDepartments(deptResponse.data || [])
    const departmentResponses = await Promise.all(
      departments.map(async (department) => {
        const response = await getUsersByDept(department.deptId)
        return (response.data || []).map((user: Contact) => ({
          ...user,
          deptName: user.deptName || department.name,
        }))
      }),
    )
    const contacts = [
      ...(unassignedResponse.data || []).map((user: Contact) => ({
        ...user,
        deptName: user.deptName || '其他联系人',
      })),
      ...departmentResponses.flat(),
    ]
    userProfileStore.upsertProfiles(contacts)
    allContacts.value = uniqueContacts(contacts)
  } catch {
    errorMessage.value = '联系人加载失败，请关闭后重试'
  } finally {
    loadingContacts.value = false
  }
}

function scheduleSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  const generation = ++searchGeneration
  const query = keyword.value.trim()
  if (!query) {
    searching.value = false
    searchResults.value = []
    return
  }
  searching.value = true
  searchTimer = setTimeout(() => {
    if (generation !== searchGeneration) return
    const normalizedQuery = query.toLocaleLowerCase('zh-CN')
    searchResults.value = allContacts.value.filter((user) =>
      [
        user.remark,
        user.nickname,
        user.username,
        user.deptName,
      ].some((value) => value?.toLocaleLowerCase('zh-CN').includes(normalizedQuery)),
    )
    searching.value = false
  }, 250)
}

function clearSearch() {
  keyword.value = ''
  searchGeneration += 1
  if (searchTimer) clearTimeout(searchTimer)
  searchResults.value = []
  searching.value = false
  void nextTick(() => searchInputRef.value?.focus())
}

function uniqueContacts(users: Contact[]): Contact[] {
  const result = new Map<string, Contact>()
  for (const user of users) {
    const id = memberId(user)
    if (!id || id === props.currentUserId) continue
    result.set(id, user)
  }
  return [...result.values()]
}

function flattenDepartments(nodes: DeptNode[]): DeptNode[] {
  return nodes.flatMap((node) => [node, ...flattenDepartments(node.children || [])])
}

function toggleGroup(name: string) {
  const next = new Set(expandedGroups.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  expandedGroups.value = next
}

function toggleMember(user: Contact) {
  if (submitting.value) return
  const id = memberId(user)
  const existing = selectedMembers.value.findIndex((member) => memberId(member) === id)
  if (existing >= 0) {
    selectedMembers.value.splice(existing, 1)
    return
  }
  if (!isActiveContact(user) || selectionFull.value) return
  selectedMembers.value.push(user)
  errorMessage.value = ''
}

function removeMember(user: Contact) {
  const id = memberId(user)
  selectedMembers.value = selectedMembers.value.filter((member) => memberId(member) !== id)
}

async function submitGroup() {
  if (!canSubmit.value) return
  submitting.value = true
  errorMessage.value = ''
  slowMessage.value = ''
  slowTimer = setTimeout(() => {
    slowMessage.value = '创建时间较长，请稍候…'
  }, 10_000)
  try {
    const response = await createConversation({
      type: 'GROUP',
      name: buildCompatibilityGroupName(),
      requestId: requestId.value,
      memberIds: selectedMembers.value.map(memberId),
    })
    emit('created', response.data)
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.message || '创建群聊失败，请稍后重试'
  } finally {
    if (slowTimer) clearTimeout(slowTimer)
    slowTimer = null
    slowMessage.value = ''
    submitting.value = false
  }
}

function buildCompatibilityGroupName(): string {
  const owner = userProfileStore.getProfile(props.currentUserId)
  const names = [
    owner ? displayName(owner) : '',
    ...selectedMembers.value.map(displayName),
  ].filter(Boolean)
  const memberCount = selectedMembers.value.length + 1
  const name = names.length <= 3
    ? names.join('、')
    : `${names[0]}、${names[1]}等${memberCount}人的群聊`
  return truncateByCodePoints(name || '群聊', 30)
}

function truncateByCodePoints(value: string, maxCodePoints: number): string {
  return Array.from(value).slice(0, maxCodePoints).join('')
}

function requestClose() {
  if (!submitting.value) emit('close')
}

function handleEnter(event: KeyboardEvent) {
  if (event.isComposing || !canSubmit.value) return
  if (event.target instanceof HTMLButtonElement) return
  event.preventDefault()
  void submitGroup()
}

function markAvatarFailed(url: string) {
  if (!url) return
  failedAvatars.value = new Set([...failedAvatars.value, url])
}

function createRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function memberId(user: Partial<Contact>) {
  return String(user.userId || user.id || '')
}

function displayName(user: Partial<Contact>) {
  return user.remark?.trim() || user.nickname?.trim() || user.username?.trim() || '未命名联系人'
}

function auxiliaryInfo(user: Partial<Contact>) {
  if (user.deptName?.trim()) return user.deptName
  if (user.username?.trim()) return `账号：${user.username}`
  return '组织信息未设置'
}

function avatarInitial(user: Partial<Contact>) {
  return displayName(user).slice(0, 1).toUpperCase()
}

function isActiveContact(user: Partial<Contact>) {
  return user.status !== 0 && user.status !== '0'
}
</script>

<style scoped>
.group-create-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--bg-overlay);
}

.group-create-dialog {
  width: min(720px, calc(100vw - 32px));
  height: min(560px, calc(100vh - 32px));
  min-height: 460px;
  overflow: hidden;
  color: var(--text-primary);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-dialog);
}

.group-create-header {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px 0 20px;
  border-bottom: 1px solid var(--border-subtle);
}

.group-create-header h2 {
  margin: 0;
  font-size: var(--font-lg);
  font-weight: 700;
  line-height: 1;
}

.icon-button,
.remove-member,
.search-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  background: transparent;
  border-radius: var(--radius-md);
  transition: color var(--transition-fast), background var(--transition-fast);
}

.icon-button {
  width: 32px;
  height: 32px;
}

.icon-button:hover:not(:disabled),
.remove-member:hover:not(:disabled),
.search-clear:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-hover-light);
}

.icon-button svg,
.remove-member svg,
.search-clear svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.group-create-content {
  height: calc(100% - 52px);
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
}

.group-create-content[aria-busy='true'] {
  cursor: progress;
}

.contact-picker {
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-subtle);
}

.contact-search {
  position: relative;
  flex: 0 0 auto;
  margin: 16px;
}

.contact-search > svg {
  position: absolute;
  left: 12px;
  top: 50%;
  width: 17px;
  height: 17px;
  color: var(--text-tertiary);
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 1.7;
  transform: translateY(-50%);
  pointer-events: none;
}

.contact-search input {
  width: 100%;
  height: 38px;
  padding: 0 38px 0 38px;
  color: var(--text-primary);
  font-size: var(--font-md);
  background: var(--bg-input-rest);
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  transition: border-color var(--transition-fast), background var(--transition-fast);
}

.contact-search input:focus {
  background: var(--bg-input-focus);
  border-color: var(--accent);
}

.contact-search input::placeholder {
  color: var(--text-tertiary);
}

.search-clear {
  position: absolute;
  top: 50%;
  right: 6px;
  width: 28px;
  height: 28px;
  transform: translateY(-50%);
}

.contact-scroll,
.selected-list {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.contact-scroll {
  flex: 1 1 0;
  overflow-y: scroll;
  padding: 0 10px 12px;
  scrollbar-color: var(--border) transparent;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
}

.contact-scroll::-webkit-scrollbar {
  width: 8px;
}

.contact-scroll::-webkit-scrollbar-thumb {
  background: var(--border);
  border: 2px solid transparent;
  border-radius: 999px;
  background-clip: padding-box;
}

.contact-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
  background-clip: padding-box;
}

.contact-scroll:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.contact-group + .contact-group {
  margin-top: 4px;
}

.contact-group-toggle,
.contact-group-label {
  width: 100%;
  min-height: 36px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  color: var(--text-primary);
  font-size: var(--font-base);
  font-weight: 600;
  text-align: left;
  background: transparent;
  border-radius: var(--radius-md);
}

.contact-group-toggle:hover {
  background: var(--bg-hover-light);
}

.contact-group-toggle svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
  transition: transform var(--transition-fast);
}

.contact-group-toggle svg.expanded {
  transform: rotate(90deg);
}

.group-count,
.contact-group-label span {
  margin-left: auto;
  color: var(--text-tertiary);
  font-size: var(--font-xs);
  font-weight: 400;
}

.contact-rows {
  display: flex;
  flex-direction: column;
}

:deep(.contact-row) {
  width: 100%;
  min-height: 54px;
  display: grid;
  grid-template-columns: 20px 36px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  color: var(--text-primary);
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  transition: background var(--transition-fast), border-color var(--transition-fast);
}

:deep(.contact-row:hover:not(:disabled)) {
  background: var(--bg-hover-light);
}

:deep(.contact-row.selected) {
  background: var(--accent-bg-light);
  border-color: var(--accent-bg-active);
}

:deep(.contact-row.disabled) {
  opacity: 0.52;
}

:deep(.selection-control) {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: transparent;
  border: 1.5px solid var(--border);
  border-radius: 50%;
}

:deep(.contact-row.selected .selection-control) {
  background: var(--accent);
  border-color: var(--accent);
}

:deep(.selection-control svg) {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.4;
}

.member-avatar,
:deep(.member-avatar) {
  width: 36px;
  height: 36px;
  min-width: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: var(--accent-text-on);
  font-size: var(--font-md);
  font-weight: 600;
  background: var(--accent-avatar);
  border-radius: 50%;
}

.member-avatar img,
:deep(.member-avatar img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.member-copy,
:deep(.member-copy) {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.member-copy strong,
:deep(.member-copy strong) {
  overflow: hidden;
  font-size: var(--font-base);
  font-weight: 500;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-copy span,
:deep(.member-copy span) {
  overflow: hidden;
  color: var(--text-tertiary);
  font-size: var(--font-xs);
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.disabled-label) {
  color: var(--text-tertiary);
  font-size: var(--font-xs);
}

.group-empty {
  padding: 9px 12px 12px 40px;
  color: var(--text-tertiary);
  font-size: var(--font-sm);
}

.picker-state,
.picker-empty {
  height: 100%;
  min-height: 250px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: var(--font-sm);
}

.picker-state {
  gap: 8px;
}

.picker-empty {
  flex-direction: column;
  gap: 7px;
  text-align: center;
}

.picker-empty > svg {
  width: 34px;
  height: 34px;
  margin-bottom: 3px;
  color: var(--text-tertiary);
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 1.5;
}

.picker-empty strong {
  color: var(--text-secondary);
  font-size: var(--font-md);
}

.picker-empty button {
  margin-top: 5px;
  padding: 5px 10px;
  color: var(--accent);
  font-size: var(--font-sm);
  background: var(--accent-bg-light);
  border-radius: var(--radius-md);
}

.selected-panel {
  min-width: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.selected-heading {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-subtle);
}

.selected-heading h3 {
  margin: 0 0 5px;
  font-size: var(--font-lg);
  font-weight: 700;
}

.selected-heading p {
  margin: 0;
  color: var(--text-tertiary);
  font-size: var(--font-sm);
}

.limit-badge {
  flex: 0 0 auto;
  padding: 4px 8px;
  color: var(--text-secondary);
  font-size: var(--font-xs);
  background: var(--bg-header);
  border-radius: 999px;
}

.selected-list {
  padding: 8px 12px;
}

.selected-member {
  min-height: 58px;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 32px;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: var(--radius-lg);
}

.selected-member:hover {
  background: var(--bg-hover-light);
}

.remove-member {
  width: 30px;
  height: 30px;
}

.selected-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  text-align: center;
}

.group-avatar-mark {
  width: 78px;
  height: 78px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 18px;
  color: var(--accent);
  font-size: 34px;
  font-weight: 700;
  background: var(--accent-bg-light);
  border: 1px solid var(--accent-bg-active);
  border-radius: 22px;
}

.selected-empty strong {
  margin-bottom: 7px;
  font-size: var(--font-md);
}

.selected-empty span {
  color: var(--text-tertiary);
  font-size: var(--font-sm);
}

.group-create-footer {
  padding: 12px 18px 16px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-surface);
}

.submit-feedback {
  min-height: 26px;
  display: flex;
  align-items: flex-start;
}

.submit-feedback p {
  margin: 0;
  font-size: var(--font-sm);
  line-height: 1.45;
}

.submit-hint,
.submit-note {
  color: var(--text-tertiary);
}

.submit-error {
  color: var(--danger);
}

.footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.secondary-button,
.primary-button {
  min-width: 104px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 18px;
  font-size: var(--font-md);
  border-radius: var(--radius-lg);
  transition: color var(--transition-fast), background var(--transition-fast), border-color var(--transition-fast);
}

.secondary-button {
  color: var(--text-secondary);
  background: var(--bg-surface);
  border: 1px solid var(--border);
}

.secondary-button:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-hover-light);
  border-color: var(--text-tertiary);
}

.primary-button {
  color: #fff;
  background: var(--accent);
  border: 1px solid var(--accent);
}

.primary-button:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}

.primary-button:disabled {
  color: var(--text-secondary);
  background: var(--accent-bg-active);
  border-color: var(--accent-bg-active);
  opacity: 0.72;
}

.loading-spinner {
  width: 14px;
  height: 14px;
  display: inline-block;
  flex: 0 0 auto;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: group-create-spin 0.7s linear infinite;
}

@keyframes group-create-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 760px), (max-height: 560px) {
  .group-create-overlay {
    padding: 8px;
  }

  .group-create-dialog {
    width: calc(100vw - 16px);
    height: calc(100vh - 16px);
    min-height: 0;
  }
}

@media (max-width: 620px) {
  .group-create-content {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(210px, 46%) minmax(0, 54%);
  }

  .contact-picker {
    border-right: 0;
    border-bottom: 1px solid var(--border-subtle);
  }

  .selected-heading {
    min-height: 58px;
    padding: 9px 14px;
  }

  .group-create-footer {
    padding: 8px 12px 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .loading-spinner {
    animation-duration: 1.4s;
  }

  .contact-group-toggle svg {
    transition: none;
  }
}
</style>

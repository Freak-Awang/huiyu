<template>
  <div class="chat-layout">
    <!-- Left Sidebar -->
    <div class="left-sidebar">
      <div class="sidebar-nav">
        <div
          class="nav-item"
          :class="{ active: activeTab === 'chat' }"
          @click="activeTab = 'chat'"
          title="消息"
        >
          <span class="nav-icon">💬</span>
          <span class="nav-label">消息</span>
        </div>
        <div
          class="nav-item"
          :class="{ active: activeTab === 'contacts' }"
          @click="activeTab = 'contacts'"
          title="通讯录"
        >
          <span class="nav-icon">👥</span>
          <span class="nav-label">通讯录</span>
        </div>
      </div>
      <div class="sidebar-footer">
        <div class="user-avatar-small" :title="authStore.currentUser?.nickname">
          <img
            v-if="authStore.currentUser?.avatar"
            :src="authStore.currentUser.avatar"
            class="avatar-img"
            alt=""
          />
          <span v-else class="avatar-placeholder">
            {{ (authStore.currentUser?.nickname || 'U')[0] }}
          </span>
        </div>
        <button class="logout-btn" @click="handleLogout" title="退出登录">↪</button>
      </div>
    </div>

    <!-- Middle Panel -->
    <div class="middle-panel">
      <!-- Chat List -->
      <template v-if="activeTab === 'chat'">
        <div class="panel-header">
          <span class="panel-title">消息</span>
          <button class="new-chat-btn" @click="showCreateDialog = true">+</button>
        </div>
        <div class="search-bar">
          <input
            v-model="searchKeyword"
            type="text"
            placeholder="搜索会话..."
            class="search-input"
          />
        </div>
        <div class="conversation-list">
          <!-- Pinned -->
          <template v-if="chatStore.pinnedConversations.length">
            <div class="list-section-label">置顶</div>
            <div
              v-for="conv in chatStore.pinnedConversations"
              :key="conv.conversationId"
              class="conv-item"
              :class="{ active: chatStore.currentConversation?.conversationId === conv.conversationId }"
              @click="handleSelectConv(conv)"
            >
              <div class="conv-avatar">
                <img v-if="conv.avatar" :src="conv.avatar" alt="" />
                <span v-else>{{ (conv.name || '群')[0] }}</span>
                <span v-if="onlineUsers[conv.members?.[0]?.userId ?? '']" class="online-dot"></span>
              </div>
              <div class="conv-info">
                <div class="conv-top">
                  <span class="conv-name">{{ conv.name }}</span>
                  <span class="conv-time">{{ formatTime(conv.lastMessage?.createdAt) }}</span>
                </div>
                <div class="conv-bottom">
                  <span class="conv-preview">{{ conv.lastMessage?.content || '暂无消息' }}</span>
                  <span
                    v-if="chatStore.getUnreadCount(conv.conversationId)"
                    class="unread-badge"
                  >{{ chatStore.getUnreadCount(conv.conversationId) }}</span>
                </div>
              </div>
              <span class="pin-icon">📌</span>
            </div>
          </template>
          <!-- Unpinned -->
          <div
            v-for="conv in filteredConversations"
            :key="conv.conversationId"
            class="conv-item"
            :class="{ active: chatStore.currentConversation?.conversationId === conv.conversationId }"
            @click="handleSelectConv(conv)"
          >
            <div class="conv-avatar">
              <img v-if="conv.avatar" :src="conv.avatar" alt="" />
              <span v-else>{{ (conv.name || '群')[0] }}</span>
              <span v-if="onlineUsers[conv.members?.[0]?.userId ?? '']" class="online-dot"></span>
            </div>
            <div class="conv-info">
              <div class="conv-top">
                <span class="conv-name">{{ conv.name }}</span>
                <span class="conv-time">{{ formatTime(conv.lastMessage?.createdAt) }}</span>
              </div>
              <div class="conv-bottom">
                <span class="conv-preview">{{ conv.lastMessage?.content || '暂无消息' }}</span>
                <span
                  v-if="chatStore.getUnreadCount(conv.conversationId)"
                  class="unread-badge"
                >{{ chatStore.getUnreadCount(conv.conversationId) }}</span>
              </div>
            </div>
          </div>
          <div v-if="chatStore.conversations.length === 0" class="empty-hint">
            暂无会话
          </div>
        </div>
      </template>

      <!-- Contacts -->
      <template v-if="activeTab === 'contacts'">
        <div class="panel-header">
          <span class="panel-title">通讯录</span>
        </div>
        <div class="search-bar">
          <input
            v-model="contactSearchKeyword"
            type="text"
            placeholder="搜索联系人..."
            class="search-input"
            @input="onContactSearch"
          />
        </div>
        <div class="contacts-list">
          <template v-if="contactSearchKeyword">
            <div
              v-for="user in searchedUsers"
              :key="user.userId || user.id"
              class="contact-item"
              @dblclick="createSingleChat(user)"
            >
              <div class="contact-avatar">
                <img v-if="user.avatar" :src="user.avatar" alt="" />
                <span v-else>{{ (user.nickname || user.username || '?')[0] }}</span>
              </div>
              <div class="contact-info">
                <span class="contact-name">{{ user.nickname || user.username }}</span>
                <span class="contact-dept">{{ user.deptName || '' }}</span>
              </div>
            </div>
            <div v-if="searchedUsers.length === 0" class="empty-hint">无结果</div>
          </template>
          <template v-else>
            <div
              v-for="dept in deptTree"
              :key="dept.deptId"
              class="dept-group"
            >
              <div class="dept-header" @click="toggleDept(dept.deptId)">
                <span class="dept-arrow">{{ expandedDepts.has(dept.deptId) ? '▼' : '▶' }}</span>
                <span class="dept-name">{{ dept.name }}</span>
              </div>
              <template v-if="expandedDepts.has(dept.deptId)">
                <div
                  v-for="user in deptUsersMap[dept.deptId]"
                  :key="user.userId || user.id"
                  class="contact-item"
                  @dblclick="createSingleChat(user)"
                >
                  <div class="contact-avatar">
                    <img v-if="user.avatar" :src="user.avatar" alt="" />
                    <span v-else>{{ (user.nickname || user.username || '?')[0] }}</span>
                  </div>
                  <div class="contact-info">
                    <span class="contact-name">{{ user.nickname || user.username }}</span>
                  </div>
                </div>
              </template>
              <!-- Sub depts -->
              <template v-if="dept.children && expandedDepts.has(dept.deptId)">
                <div
                  v-for="child in dept.children"
                  :key="child.deptId"
                  class="dept-group" style="padding-left: 16px"
                >
                  <div class="dept-header" @click="toggleDept(child.deptId)">
                    <span class="dept-arrow">{{ expandedDepts.has(child.deptId) ? '▼' : '▶' }}</span>
                    <span class="dept-name">{{ child.name }}</span>
                  </div>
                  <template v-if="expandedDepts.has(child.deptId)">
                    <div
                      v-for="user in deptUsersMap[child.deptId]"
                      :key="user.userId || user.id"
                      class="contact-item"
                      @dblclick="createSingleChat(user)"
                    >
                      <div class="contact-avatar">
                        <img v-if="user.avatar" :src="user.avatar" alt="" />
                        <span v-else>{{ (user.nickname || user.username || '?')[0] }}</span>
                      </div>
                      <div class="contact-info">
                        <span class="contact-name">{{ user.nickname || user.username }}</span>
                      </div>
                    </div>
                  </template>
                </div>
              </template>
            </div>
          </template>
        </div>
      </template>
    </div>

    <!-- Right Panel -->
    <div class="right-panel">
      <template v-if="chatStore.currentConversation">
        <div class="chat-header">
          <div class="chat-header-info">
            <span class="chat-header-name">{{ chatStore.currentConversation.name }}</span>
            <span class="chat-header-meta">
              {{ chatStore.currentConversation.type === 'GROUP' ? `${chatStore.currentConversation.memberCount ?? 0}人` : '私聊' }}
            </span>
          </div>
          <div class="chat-header-actions">
            <button
              class="action-btn"
              :title="chatStore.currentConversation.pinned ? '取消置顶' : '置顶'"
              @click="togglePin"
            >📌</button>
          </div>
        </div>

        <div class="message-area" ref="messageAreaRef" @scroll="onMessageScroll">
          <div class="message-list">
            <div
              v-for="msg in chatStore.currentMessages"
              :key="msg.messageId || msg.clientMsgId"
              class="message-item"
              :class="{ 'message-self': msg.senderId === authStore.currentUser?.userId }"
            >
              <div class="message-avatar">
                <img v-if="msg.senderAvatar" :src="msg.senderAvatar" alt="" />
                <span v-else>{{ (msg.senderName || 'U')[0] }}</span>
              </div>
              <div class="message-body">
                <div class="message-sender">{{ msg.senderName }}</div>
                <div class="message-content">
                  <template v-if="msg.messageType === 'TEXT'">
                    <div class="text-bubble">{{ msg.content }}</div>
                  </template>
                  <template v-else-if="msg.messageType === 'IMAGE'">
                    <img
                      :src="msg.content"
                      class="image-bubble"
                      @click="previewImage = msg.content"
                      alt="图片"
                    />
                  </template>
                  <template v-else-if="msg.messageType === 'FILE'">
                    <div class="file-bubble" @click="downloadFile(msg.content)">
                      <span class="file-icon">📎</span>
                      <span class="file-info">{{ getFileInfo(msg.content).name }}</span>
                      <span class="file-size">{{ getFileInfo(msg.content).size }}</span>
                    </div>
                  </template>
                </div>
                <div class="message-time">{{ formatTime(msg.createdAt) }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="input-area">
          <div class="input-toolbar">
            <label class="tool-btn" title="发送图片">
              📷
              <input type="file" accept="image/*" hidden @change="onSendImage" />
            </label>
            <label class="tool-btn" title="发送文件">
              📁
              <input type="file" hidden @change="onSendFile" />
            </label>
          </div>
          <div class="input-box">
            <textarea
              v-model="messageText"
              class="message-input"
              placeholder="输入消息..."
              rows="3"
              @keydown.enter.exact.prevent="handleSendText"
            ></textarea>
            <button class="send-btn" @click="handleSendText">发送</button>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="no-conversation">
          <div class="no-conv-icon">💬</div>
          <p>选择一个会话开始聊天</p>
        </div>
      </template>
    </div>

    <!-- Create Conversation Dialog -->
    <div v-if="showCreateDialog" class="dialog-overlay" @click.self="closeCreateDialog">
      <div class="dialog-box">
        <div class="dialog-header">
          <span>{{ createType === 'single' ? '发起单聊' : '创建群聊' }}</span>
          <button class="dialog-close" @click="closeCreateDialog">✕</button>
        </div>
        <div class="dialog-body">
          <div class="dialog-tabs">
            <span
              :class="{ active: createType === 'single' }"
              @click="createType = 'single'"
            >单聊</span>
            <span
              :class="{ active: createType === 'group' }"
              @click="createType = 'group'"
            >群聊</span>
          </div>

          <template v-if="createType === 'single'">
            <input
              v-model="createSearchUser"
              class="dialog-input"
              placeholder="搜索用户..."
              @input="onSearchCreateUser"
            />
            <div class="create-user-list">
              <div
                v-for="user in createSearchResults"
                :key="user.userId || user.id"
                class="create-user-item"
                @click="doCreateSingleChat(user)"
              >
                <div class="contact-avatar">
                  <img v-if="user.avatar" :src="user.avatar" alt="" />
                  <span v-else>{{ (user.nickname || user.username || '?')[0] }}</span>
                </div>
                <span class="contact-name">{{ user.nickname || user.username }}</span>
              </div>
            </div>
          </template>

          <template v-if="createType === 'group'">
            <input
              v-model="createGroupName"
              class="dialog-input"
              placeholder="群聊名称"
            />
            <input
              v-model="createSearchMember"
              class="dialog-input"
              placeholder="搜索并添加成员..."
              @input="onSearchCreateMember"
            />
            <div class="selected-members" v-if="createSelectedMembers.length">
              <span class="section-label">已选成员:</span>
              <span
                v-for="member in createSelectedMembers"
                :key="member.userId || member.id"
                class="member-tag"
              >
                {{ member.nickname || member.username }}
                <button @click="removeMemberSelection(member)">✕</button>
              </span>
            </div>
            <div class="create-user-list">
              <div
                v-for="user in createMemberResults"
                :key="user.userId || user.id"
                class="create-user-item"
                @click="addMemberSelection(user)"
              >
                <div class="contact-avatar">
                  <img v-if="user.avatar" :src="user.avatar" alt="" />
                  <span v-else>{{ (user.nickname || user.username || '?')[0] }}</span>
                </div>
                <span class="contact-name">{{ user.nickname || user.username }}</span>
              </div>
            </div>
            <button
              class="dialog-submit"
              :disabled="!createGroupName || createSelectedMembers.length === 0"
              @click="doCreateGroupChat"
            >创建群聊</button>
          </template>
        </div>
      </div>
    </div>

    <!-- Image Preview -->
    <div v-if="previewImage" class="dialog-overlay preview-overlay" @click="previewImage = ''">
      <img :src="previewImage" class="preview-img" alt="预览" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useChatStore } from '../stores/chat'
import { WebSocketManager, type WsMessage } from '../utils/websocket'
import { getDeptTree, type DeptNode } from '../api/dept'
import { getUsersByDept, searchUsers } from '../api/user'
import { createConversation, pinConversation } from '../api/conversation'
import { normalizeMessage } from '../api/message'
import { uploadFile } from '../api/file'
import { getFileUrl } from '../api/file'

const router = useRouter()
const authStore = useAuthStore()
const chatStore = useChatStore()

const activeTab = ref<'chat' | 'contacts'>('chat')
const searchKeyword = ref('')
const contactSearchKeyword = ref('')
const onlineUsers = ref<Record<string, boolean>>({})
const wsConnected = ref(false)

let wsManager: WebSocketManager | null = null
const canSendMessage = computed(() => !!chatStore.currentConversation && wsConnected.value)

// Filtered conversations
const filteredConversations = computed(() => {
  if (!searchKeyword.value) return chatStore.unpinnedConversations
  const kw = searchKeyword.value.toLowerCase()
  return chatStore.unpinnedConversations.filter(
    (c) => c.name?.toLowerCase().includes(kw)
  )
})

// Dept tree
const deptTree = ref<DeptNode[]>([])
const expandedDepts = ref(new Set<string>())
const deptUsersMap = ref<Record<string, any[]>>({})
const UNASSIGNED_DEPT_ID = '__unassigned__'

async function loadDeptTree() {
  try {
    const [deptRes, unassignedRes] = await Promise.all([
      getDeptTree(),
      getUsersByDept(),
    ])
    const unassignedUsers = unassignedRes.data ?? []
    deptTree.value = unassignedUsers.length
      ? [
          ...deptRes.data,
          {
            id: UNASSIGNED_DEPT_ID,
            deptId: UNASSIGNED_DEPT_ID,
            name: '未分配部门',
            parentId: null,
            children: [],
          },
        ]
      : deptRes.data
    deptUsersMap.value[UNASSIGNED_DEPT_ID] = unassignedUsers
  } catch {
    // ignore
  }
}

async function toggleDept(deptId: string) {
  if (expandedDepts.value.has(deptId)) {
    expandedDepts.value.delete(deptId)
  } else {
    expandedDepts.value.add(deptId)
    if (!deptUsersMap.value[deptId]) {
      try {
        const res = await getUsersByDept(deptId === UNASSIGNED_DEPT_ID ? undefined : deptId)
        deptUsersMap.value[deptId] = res.data
      } catch {
        deptUsersMap.value[deptId] = []
      }
    }
  }
}

// Contact search
const searchedUsers = ref<any[]>([])
let contactSearchTimer: ReturnType<typeof setTimeout> | null = null

function onContactSearch() {
  if (contactSearchTimer) clearTimeout(contactSearchTimer)
  contactSearchTimer = setTimeout(async () => {
    const kw = contactSearchKeyword.value.trim()
    if (!kw) {
      searchedUsers.value = []
      return
    }
    try {
      const res = await searchUsers(kw, 1, 50)
      searchedUsers.value = res.data
    } catch {
      searchedUsers.value = []
    }
  }, 300)
}

async function createSingleChat(user: any) {
  const userId = user.userId || user.id
  const myId = authStore.currentUser?.userId
  if (!myId || userId === myId) return
  try {
    const res = await createConversation({
      type: 'SINGLE',
      targetUserId: userId,
    })
    await chatStore.fetchConversations()
    let conv = chatStore.conversations.find(
      (c) => c.conversationId === res.data.conversationId
    )
    if (!conv) {
      chatStore.upsertConversation(res.data)
      conv = res.data
    }
    if (conv) {
      activeTab.value = 'chat'
      await chatStore.selectConversation(conv.conversationId)
      closeCreateDialog()
      scrollToBottom()
    }
  } catch (err: any) {
    alert(err?.response?.data?.message || '创建会话失败')
  }
}

// Select conversation
const messageAreaRef = ref<HTMLElement | null>(null)
const messageText = ref('')
const previewImage = ref('')
let loadingOlderMessages = false

async function handleSelectConv(conv: any) {
  try {
    await chatStore.selectConversation(conv.conversationId)
  } catch (err: any) {
    alert(err?.response?.data?.message || '加载消息失败')
  }
  scrollToBottom()
}

async function togglePin() {
  const conv = chatStore.currentConversation
  if (!conv) return
  const newPinned = !conv.pinned
  try {
    await pinConversation(conv.conversationId, newPinned)
    conv.pinned = newPinned
  } catch {
    // ignore
  }
}

// Scroll
function scrollToBottom() {
  nextTick(() => {
    const el = messageAreaRef.value
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  })
}

async function onMessageScroll() {
  const el = messageAreaRef.value
  if (el && el.scrollTop === 0 && !loadingOlderMessages) {
    const conv = chatStore.currentConversation
    if (!conv) return
    const msgs = chatStore.currentMessages
    if (msgs.length > 0) {
      loadingOlderMessages = true
      try {
        await chatStore.fetchMessages(conv.conversationId, msgs[0].messageId)
      } catch (err: any) {
        alert(err?.response?.data?.message || '加载历史消息失败')
      } finally {
        loadingOlderMessages = false
      }
    }
  }
}

// Send message
function handleSendText() {
  const text = messageText.value.trim()
  if (!text) return
  const conv = chatStore.currentConversation
  if (!conv || !wsManager || !authStore.currentUser) return
  if (!wsConnected.value || !wsManager.isConnected()) {
    alert('WebSocket 未连接，暂时无法发送消息')
    return
  }

  const clientMsgId = generateId()
  const sent = wsManager.send('MESSAGE_SEND', {
    conversationId: conv.conversationId,
    messageType: 'TEXT',
    content: text,
    clientMsgId,
  })
  if (!sent) {
    alert('消息发送失败，请稍后重试')
    return
  }

  // Optimistic add
  chatStore.addMessage({
    messageId: '',
    conversationId: conv.conversationId,
    senderId: authStore.currentUser.userId,
    senderName: authStore.currentUser.nickname,
    senderAvatar: authStore.currentUser.avatar || '',
    messageType: 'TEXT',
    content: text,
    clientMsgId,
    createdAt: new Date().toISOString(),
  })

  messageText.value = ''
  scrollToBottom()
}

async function onSendImage(e: Event) {
  const input = e.target as HTMLInputElement
  if (!canSendMessage.value) {
    alert('WebSocket 未连接，暂时无法发送消息')
    input.value = ''
    return
  }
  const file = input.files?.[0]
  if (!file) return
  try {
    const res = await uploadFile(file)
    const url = res.data.url || getFileUrl(res.data.id)
    sendFileMessage('IMAGE', url)
  } catch (err: any) {
    alert(err?.response?.data?.message || '上传图片失败')
  }
  input.value = ''
}

async function onSendFile(e: Event) {
  const input = e.target as HTMLInputElement
  if (!canSendMessage.value) {
    alert('WebSocket 未连接，暂时无法发送消息')
    input.value = ''
    return
  }
  const file = input.files?.[0]
  if (!file) return
  try {
    const res = await uploadFile(file)
    const url = res.data.url || getFileUrl(res.data.id)
    const fileData = JSON.stringify({
      name: file.name,
      url,
      size: formatFileSize(file.size),
    })
    sendFileMessage('FILE', fileData)
  } catch (err: any) {
    alert(err?.response?.data?.message || '上传文件失败')
  }
  input.value = ''
}

function sendFileMessage(type: string, content: string) {
  const conv = chatStore.currentConversation
  if (!conv || !wsManager || !authStore.currentUser) return
  if (!wsConnected.value || !wsManager.isConnected()) {
    alert('WebSocket 未连接，暂时无法发送消息')
    return
  }

  const clientMsgId = generateId()
  const sent = wsManager.send('MESSAGE_SEND', {
    conversationId: conv.conversationId,
    messageType: type,
    content,
    clientMsgId,
  })
  if (!sent) {
    alert('消息发送失败，请稍后重试')
    return
  }

  chatStore.addMessage({
    messageId: '',
    conversationId: conv.conversationId,
    senderId: authStore.currentUser.userId,
    senderName: authStore.currentUser.nickname,
    senderAvatar: authStore.currentUser.avatar || '',
    messageType: type as any,
    content,
    clientMsgId,
    createdAt: new Date().toISOString(),
  })
  scrollToBottom()
}

// WebSocket message handler
function handleWsMessage(msg: WsMessage) {
  switch (msg.cmd) {
    case 'MESSAGE_RECEIVE': {
      const data = msg.data
      const receivedMessage = normalizeMessage({
        ...data,
        createdAt:
          data.createdAt ||
          data.createTime ||
          (data.timestamp ? new Date(Number(data.timestamp)).toISOString() : undefined),
      })
      chatStore.receiveMessage(receivedMessage)
      // If current conv, scroll down
      if (chatStore.currentConversation?.conversationId === receivedMessage.conversationId) {
        scrollToBottom()
        chatStore.markAsRead(receivedMessage.conversationId)
      }
      break
    }
    case 'MESSAGE_ACK': {
      const data = msg.data
      chatStore.updateMessageStatus(data.clientMsgId, data.messageId, data.status)
      break
    }
    case 'MESSAGE_SEND_REPLY': {
      // Server may also send reply for a send
      const data = msg.data
      if (data.clientMsgId) {
        chatStore.updateMessageStatus(data.clientMsgId, data.messageId, data.status)
      }
      break
    }
    case 'ONLINE_STATUS': {
      const data = msg.data
      if (data && typeof data === 'object') {
        if (data.userId !== undefined) {
          onlineUsers.value[String(data.userId)] = !!data.online
        } else {
          for (const [uid, online] of Object.entries(data)) {
            onlineUsers.value[uid] = !!online
          }
        }
      }
      break
    }
    case 'PONG': {
      break
    }
    default:
      break
  }
}

function initWebSocket() {
  if (!authStore.isLoggedIn) return
  if (wsManager) {
    wsManager.disconnect()
  }
  const token = authStore.token
  if (!token) return
  wsManager = new WebSocketManager(token, handleWsMessage, (connected) => {
    wsConnected.value = connected
  })
  wsManager.connect()
}

// Create dialog
const showCreateDialog = ref(false)
const createType = ref<'single' | 'group'>('single')
const createSearchUser = ref('')
const createSearchResults = ref<any[]>([])
const createGroupName = ref('')
const createSearchMember = ref('')
const createMemberResults = ref<any[]>([])
const createSelectedMembers = ref<any[]>([])

function closeCreateDialog() {
  showCreateDialog.value = false
  createSearchUser.value = ''
  createSearchResults.value = []
  createGroupName.value = ''
  createSearchMember.value = ''
  createMemberResults.value = []
  createSelectedMembers.value = []
}

let createSearchTimer: ReturnType<typeof setTimeout> | null = null

function onSearchCreateUser() {
  if (createSearchTimer) clearTimeout(createSearchTimer)
  createSearchTimer = setTimeout(async () => {
    const kw = createSearchUser.value.trim()
    if (!kw) {
      createSearchResults.value = []
      return
    }
    try {
      const res = await searchUsers(kw, 1, 20)
      createSearchResults.value = res.data
    } catch {
      createSearchResults.value = []
    }
  }, 300)
}

function onSearchCreateMember() {
  if (createSearchTimer) clearTimeout(createSearchTimer)
  createSearchTimer = setTimeout(async () => {
    const kw = createSearchMember.value.trim()
    if (!kw) {
      createMemberResults.value = []
      return
    }
    try {
      const res = await searchUsers(kw, 1, 20)
      const myId = authStore.currentUser?.userId
      createMemberResults.value = (res.data || []).filter(
        (u: any) => (u.userId || u.id) !== myId
      )
    } catch {
      createMemberResults.value = []
    }
  }, 300)
}

function addMemberSelection(user: any) {
  const uid = user.userId || user.id
  if (!createSelectedMembers.value.find((m) => (m.userId || m.id) === uid)) {
    createSelectedMembers.value.push(user)
  }
}

function removeMemberSelection(user: any) {
  const uid = user.userId || user.id
  createSelectedMembers.value = createSelectedMembers.value.filter(
    (m) => (m.userId || m.id) !== uid
  )
}

async function doCreateSingleChat(user: any) {
  await createSingleChat(user)
}

async function doCreateGroupChat() {
  if (!createGroupName.value || createSelectedMembers.value.length === 0) return
  try {
    const memberIds = createSelectedMembers.value.map((m) => m.userId || m.id)
    await createConversation({
      type: 'GROUP',
      name: createGroupName.value,
      memberIds,
    })
    await chatStore.fetchConversations()
    closeCreateDialog()
  } catch (err: any) {
    alert(err?.response?.data?.message || '创建群聊失败')
  }
}

// Utility
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 10)
}

function formatTime(ts?: string): string {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === now.toDateString()) return time
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `昨天 ${time}`
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`
}

function formatFileSize(size: number): string {
  if (!size) return ''
  if (size < 1024) return `${size}B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`
  return `${(size / (1024 * 1024)).toFixed(1)}MB`
}

function getFileInfo(content: string): { name: string; size: string; url: string } {
  try {
    return JSON.parse(content)
  } catch {
    return { name: content, size: '', url: '' }
  }
}

function downloadFile(content: string) {
  const info = getFileInfo(content)
  if (info.url) {
    window.open(info.url, '_blank')
  }
}

async function handleLogout() {
  wsManager?.disconnect()
  await authStore.logout()
  router.push('/login')
}

onMounted(async () => {
  await authStore.init()
  if (authStore.isLoggedIn) {
    await chatStore.fetchConversations()
    await loadDeptTree()
    initWebSocket()
  }
})

onUnmounted(() => {
  wsManager?.disconnect()
})

watch(
  () => authStore.isLoggedIn,
  (val) => {
    if (val) {
      chatStore.fetchConversations()
      loadDeptTree()
      initWebSocket()
    }
  }
)
</script>

<style scoped>
.chat-layout {
  display: flex;
  height: 100%;
  width: 100%;
  background: #f5f5f5;
}

/* Left Sidebar */
.left-sidebar {
  width: 60px;
  min-width: 60px;
  background: #2e2e2e;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 12px 0;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 6px;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 0;
  border-radius: 8px;
  cursor: pointer;
  color: #aaa;
  transition: all 0.2s;
  gap: 2px;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.nav-item.active {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.nav-icon {
  font-size: 22px;
}

.nav-label {
  font-size: 11px;
}

.sidebar-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 0 6px;
}

.user-avatar-small {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #5566cc;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  overflow: hidden;
}

.user-avatar-small img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.logout-btn {
  background: none;
  border: none;
  color: #aaa;
  font-size: 16px;
  cursor: pointer;
}

.logout-btn:hover {
  color: #fff;
}

/* Middle Panel */
.middle-panel {
  width: 280px;
  min-width: 280px;
  background: #ebebeb;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #ddd;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: #ebebeb;
}

.panel-title {
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.new-chat-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: #e0e0e0;
  border: none;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #666;
}

.new-chat-btn:hover {
  background: #d0d0d0;
}

.search-bar {
  padding: 0 12px 10px;
}

.search-input {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: #dcdcdc;
  font-size: 13px;
  color: #333;
  transition: background 0.2s;
}

.search-input::placeholder {
  color: #999;
}

.search-input:focus {
  background: #fff;
}

.conversation-list,
.contacts-list {
  flex: 1;
  overflow-y: auto;
}

.list-section-label {
  padding: 6px 16px;
  font-size: 12px;
  color: #999;
}

.conv-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.15s;
  position: relative;
  gap: 10px;
}

.conv-item:hover {
  background: #e0e0e0;
}

.conv-item.active {
  background: #d0d5f0;
}

.pin-icon {
  font-size: 10px;
}

.conv-avatar {
  width: 40px;
  height: 40px;
  min-width: 40px;
  border-radius: 50%;
  background: #667eea;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 16px;
  overflow: hidden;
  position: relative;
}

.conv-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.online-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  background: #4caf50;
  border: 2px solid #fff;
  border-radius: 50%;
}

.conv-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.conv-top,
.conv-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.conv-name {
  font-size: 14px;
  font-weight: 500;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}

.conv-time {
  font-size: 11px;
  color: #aaa;
  white-space: nowrap;
}

.conv-preview {
  font-size: 12px;
  color: #999;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}

.unread-badge {
  background: #e74c3c;
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}

.empty-hint {
  text-align: center;
  padding: 40px 0;
  color: #bbb;
  font-size: 14px;
}

/* Contacts */
.dept-group {
  /* nested */
}

.dept-header {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  cursor: pointer;
  gap: 6px;
  font-size: 14px;
  color: #333;
}

.dept-header:hover {
  background: #e0e0e0;
}

.dept-arrow {
  font-size: 10px;
  color: #999;
  width: 14px;
}

.dept-name {
  font-weight: 500;
}

.contact-item {
  display: flex;
  align-items: center;
  padding: 8px 16px 8px 32px;
  cursor: pointer;
  gap: 10px;
  transition: background 0.15s;
}

.contact-item:hover {
  background: #e0e0e0;
}

.contact-avatar {
  width: 34px;
  height: 34px;
  min-width: 34px;
  border-radius: 50%;
  background: #667eea;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 14px;
  overflow: hidden;
}

.contact-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.contact-info {
  display: flex;
  flex-direction: column;
}

.contact-name {
  font-size: 13px;
  color: #333;
}

.contact-dept {
  font-size: 11px;
  color: #aaa;
}

/* Right Panel */
.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #f8f8f8;
  min-width: 0;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: #f0f0f0;
  border-bottom: 1px solid #e0e0e0;
  min-height: 56px;
}

.chat-header-info {
  display: flex;
  flex-direction: column;
}

.chat-header-name {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.chat-header-meta {
  font-size: 12px;
  color: #999;
}

.action-btn {
  background: none;
  border: none;
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  color: #999;
}

.action-btn:hover {
  background: #e0e0e0;
  color: #333;
}

/* Message Area */
.message-area {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.message-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message-item {
  display: flex;
  gap: 10px;
  max-width: 70%;
}

.message-item.message-self {
  flex-direction: row-reverse;
  align-self: flex-end;
}

.message-avatar {
  width: 34px;
  height: 34px;
  min-width: 34px;
  border-radius: 50%;
  background: #667eea;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 14px;
  overflow: hidden;
  align-self: flex-start;
}

.message-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.message-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.message-item.message-self .message-body {
  align-items: flex-end;
}

.message-sender {
  font-size: 12px;
  color: #999;
}

.message-content {
  display: flex;
  flex-direction: column;
}

.text-bubble {
  background: #fff;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 14px;
  color: #333;
  line-height: 1.5;
  word-break: break-word;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  white-space: pre-wrap;
}

.message-self .text-bubble {
  background: #667eea;
  color: #fff;
}

.image-bubble {
  max-width: 240px;
  max-height: 240px;
  border-radius: 8px;
  cursor: pointer;
  object-fit: cover;
}

.file-bubble {
  background: #fff;
  padding: 10px 14px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  font-size: 13px;
}

.file-icon {
  font-size: 24px;
}

.file-info {
  color: #667eea;
}

.file-size {
  color: #999;
  font-size: 11px;
}

.message-time {
  font-size: 11px;
  color: #ccc;
  margin-top: 2px;
}

/* Input Area */
.input-area {
  border-top: 1px solid #e0e0e0;
  background: #f0f0f0;
  padding: 8px 16px 12px;
}

.input-toolbar {
  display: flex;
  gap: 8px;
  padding-bottom: 6px;
}

.tool-btn {
  font-size: 18px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background 0.15s;
}

.tool-btn:hover {
  background: #e0e0e0;
}

.input-box {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}

.message-input {
  flex: 1;
  resize: none;
  border: none;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
  background: #fff;
  line-height: 1.5;
  min-height: 44px;
  max-height: 120px;
}

.send-btn {
  padding: 8px 24px;
  background: #667eea;
  color: #fff;
  border-radius: 8px;
  font-size: 14px;
  border: none;
  cursor: pointer;
  transition: background 0.2s;
  white-space: nowrap;
}

.send-btn:hover {
  background: #5a6fd8;
}

/* No conversation */
.no-conversation {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #ccc;
}

.no-conv-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.no-conversation p {
  font-size: 16px;
}

/* Dialog */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-box {
  width: 420px;
  max-height: 80vh;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #eee;
  font-size: 16px;
  font-weight: 600;
}

.dialog-close {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: #999;
}

.dialog-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
}

.dialog-tabs {
  display: flex;
  gap: 12px;
  margin-bottom: 14px;
}

.dialog-tabs span {
  padding: 4px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  color: #666;
  background: #f0f0f0;
}

.dialog-tabs span.active {
  background: #667eea;
  color: #fff;
}

.dialog-input {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  margin-bottom: 10px;
  background: #f8f9fa;
}

.dialog-input:focus {
  border-color: #667eea;
  background: #fff;
}

.create-user-list {
  max-height: 240px;
  overflow-y: auto;
}

.create-user-item {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  gap: 10px;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.15s;
}

.create-user-item:hover {
  background: #f0f0f0;
}

.section-label {
  font-size: 12px;
  color: #999;
  margin-right: 8px;
}

.selected-members {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-bottom: 10px;
}

.member-tag {
  background: #667eea;
  color: #fff;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.member-tag button {
  background: none;
  border: none;
  color: #fff;
  cursor: pointer;
  font-size: 12px;
}

.dialog-submit {
  width: 100%;
  padding: 10px;
  margin-top: 12px;
  background: #667eea;
  color: #fff;
  border-radius: 8px;
  font-size: 14px;
  border: none;
  cursor: pointer;
}

.dialog-submit:hover {
  background: #5a6fd8;
}

.dialog-submit:disabled {
  background: #bbb;
  cursor: not-allowed;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  font-weight: 500;
}

/* Image Preview */
.preview-overlay {
  cursor: pointer;
}

.preview-img {
  max-width: 80vw;
  max-height: 80vh;
  border-radius: 8px;
}
</style>

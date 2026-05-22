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
                    v-if="chatStore.getMentionUnreadCount(conv.conversationId)"
                    class="mention-badge"
                  >@我</span>
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
                  v-if="chatStore.getMentionUnreadCount(conv.conversationId)"
                  class="mention-badge"
                >@我</span>
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
            <button
              v-if="chatStore.currentConversation.type === 'GROUP'"
              class="chat-header-meta member-count-btn"
              @click="openMembersDrawer"
            >
              {{ chatStore.currentConversation.memberCount ?? 0 }}人
            </button>
            <span v-else class="chat-header-meta">私聊</span>
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
                    <div class="text-bubble">
                      <span
                        v-for="(segment, index) in renderTextSegments(msg)"
                        :key="index"
                        :class="{ mention: segment.mention, 'mention-self': segment.self }"
                      >{{ segment.text }}</span>
                    </div>
                  </template>
                  <template v-else-if="msg.messageType === 'IMAGE'">
                    <img
                      :src="getImageUrl(msg.content)"
                      class="image-bubble"
                      @click="previewImage = getImageUrl(msg.content)"
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
                  <template v-else-if="msg.messageType === 'STICKER'">
                    <div class="sticker-bubble">
                      <template v-if="getStickerInfo(msg.content)">
                        <img
                          :src="getStickerInfo(msg.content)?.url"
                          class="sticker-img"
                          :alt="getStickerInfo(msg.content)?.name"
                        />
                      </template>
                      <span v-else class="sticker-error">表情加载失败</span>
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
            <button
              ref="emojiButtonRef"
              class="tool-btn"
              title="表情"
              type="button"
              @click="toggleEmojiPanel"
            >😊</button>
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
              ref="messageInputRef"
              v-model="messageText"
              class="message-input"
              placeholder="输入消息..."
              rows="3"
              @input="onMessageInput"
              @keydown="handleMessageKeydown"
            ></textarea>
            <div v-if="showMentionPicker && mentionCandidates.length" class="mention-picker">
              <div
                v-for="(member, index) in mentionCandidates"
                :key="member.userId"
                class="mention-option"
                :class="{ active: index === mentionSelectedIndex }"
                @mousedown.prevent="selectMention(member)"
              >
                <div class="mention-avatar">
                  <img v-if="member.avatar" :src="member.avatar" alt="" />
                  <span v-else>{{ getMemberName(member)[0] }}</span>
                </div>
                <span>{{ getMemberName(member) }}</span>
              </div>
            </div>
            <div v-if="showEmojiPanel" ref="emojiPanelRef" class="emoji-panel">
              <div class="emoji-tabs">
                <button
                  type="button"
                  :class="{ active: emojiActiveTab === 'emoji' }"
                  @click="emojiActiveTab = 'emoji'"
                >Emoji</button>
                <button
                  type="button"
                  :class="{ active: emojiActiveTab === 'sticker' }"
                  @click="emojiActiveTab = 'sticker'"
                >大表情</button>
              </div>

              <div v-if="emojiActiveTab === 'emoji'" class="emoji-content">
                <div v-if="recentEmojis.length" class="emoji-section">
                  <div class="emoji-section-title">最近使用</div>
                  <div class="emoji-grid">
                    <button
                      v-for="emoji in recentEmojis"
                      :key="`recent-${emoji}`"
                      type="button"
                      class="emoji-item"
                      @click="insertEmoji(emoji)"
                    >{{ emoji }}</button>
                  </div>
                </div>
                <div class="emoji-group-tabs">
                  <button
                    v-for="(group, index) in EMOJI_GROUPS"
                    :key="group.name"
                    type="button"
                    :class="{ active: emojiActiveGroup === index }"
                    @click="emojiActiveGroup = index"
                  >{{ group.name }}</button>
                </div>
                <div class="emoji-grid">
                  <button
                    v-for="emoji in EMOJI_GROUPS[emojiActiveGroup].emojis"
                    :key="emoji"
                    type="button"
                    class="emoji-item"
                    @click="insertEmoji(emoji)"
                  >{{ emoji }}</button>
                </div>
              </div>

              <div v-else class="emoji-content">
                <div v-if="recentStickers.length" class="emoji-section">
                  <div class="emoji-section-title">最近使用</div>
                  <div class="sticker-grid">
                    <button
                      v-for="sticker in recentStickers"
                      :key="`recent-${sticker.id}`"
                      type="button"
                      class="sticker-option"
                      :title="sticker.name"
                      @click="sendSticker(sticker)"
                    >
                      <img :src="sticker.url" :alt="sticker.name" />
                    </button>
                  </div>
                </div>
                <div class="sticker-grid">
                  <button
                    v-for="sticker in STICKERS"
                    :key="sticker.id"
                    type="button"
                    class="sticker-option"
                    :title="sticker.name"
                    @click="sendSticker(sticker)"
                  >
                    <img :src="sticker.url" :alt="sticker.name" />
                  </button>
                </div>
              </div>
            </div>
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

      <div v-if="showMembersDrawer" class="member-drawer">
        <div class="member-drawer-header">
          <span>群成员</span>
          <button class="dialog-close" @click="showMembersDrawer = false">✕</button>
        </div>
        <input
          v-model="memberSearch"
          class="member-search"
          placeholder="搜索成员..."
        />
        <div class="member-list">
          <div
            v-for="member in filteredGroupMembers"
            :key="member.userId"
            class="member-row"
          >
            <div class="member-avatar">
              <img v-if="member.avatar" :src="member.avatar" alt="" />
              <span v-else>{{ getMemberName(member)[0] }}</span>
            </div>
            <div class="member-info">
              <span class="member-name">{{ getMemberName(member) }}</span>
              <span class="member-role">{{ formatMemberRole(member.role) }}</span>
            </div>
          </div>
          <div v-if="filteredGroupMembers.length === 0" class="empty-hint">暂无成员</div>
        </div>
      </div>
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
import {
  createConversation,
  normalizeConversation,
  pinConversation,
  type ConversationMember,
} from '../api/conversation'
import {
  buildTextMessageContent,
  normalizeMessage,
  type Message,
  type MessageMention,
} from '../api/message'
import { uploadFile } from '../api/file'
import { getFileUrl } from '../api/file'
import { EMOJI_GROUPS } from '../constants/emoji'
import {
  STICKERS,
  buildStickerContent,
  parseStickerContent,
  type Sticker,
} from '../constants/stickers'

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
const messageInputRef = ref<HTMLTextAreaElement | null>(null)
const emojiButtonRef = ref<HTMLElement | null>(null)
const emojiPanelRef = ref<HTMLElement | null>(null)
const messageText = ref('')
const previewImage = ref('')
const draftMentions = ref<MessageMention[]>([])
const showMentionPicker = ref(false)
const mentionSearch = ref('')
const mentionSelectedIndex = ref(0)
const showEmojiPanel = ref(false)
const emojiActiveTab = ref<'emoji' | 'sticker'>('emoji')
const emojiActiveGroup = ref(0)
const recentEmojis = ref<string[]>([])
const recentStickers = ref<Sticker[]>([])
const showMembersDrawer = ref(false)
const memberSearch = ref('')
let loadingOlderMessages = false
const RECENT_EMOJIS_KEY = 'im_recent_emojis'
const RECENT_STICKERS_KEY = 'im_recent_stickers'

const sortedGroupMembers = computed(() => {
  const roleOrder: Record<string, number> = { owner: 0, admin: 1, member: 2 }
  const members = chatStore.currentConversation?.members || []
  return [...members].sort((a, b) => {
    const roleDiff = (roleOrder[a.role || 'member'] ?? 3) - (roleOrder[b.role || 'member'] ?? 3)
    if (roleDiff !== 0) return roleDiff
    return getMemberName(a).localeCompare(getMemberName(b), 'zh-CN')
  })
})

const filteredGroupMembers = computed(() => {
  const keyword = memberSearch.value.trim().toLowerCase()
  if (!keyword) return sortedGroupMembers.value
  return sortedGroupMembers.value.filter((member) =>
    getMemberName(member).toLowerCase().includes(keyword)
  )
})

const mentionCandidates = computed(() => {
  const conv = chatStore.currentConversation
  const currentUserId = String(authStore.currentUser?.userId ?? '')
  if (!conv || conv.type !== 'GROUP') return []
  const keyword = mentionSearch.value.trim().toLowerCase()
  return sortedGroupMembers.value
    .filter((member) => member.userId !== currentUserId)
    .filter((member) => !keyword || getMemberName(member).toLowerCase().includes(keyword))
    .slice(0, 8)
})

async function handleSelectConv(conv: any) {
  try {
    await chatStore.selectConversation(conv.conversationId)
    closeMentionPicker()
    closeEmojiPanel()
    showMembersDrawer.value = false
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

async function openMembersDrawer() {
  const conv = chatStore.currentConversation
  if (!conv || conv.type !== 'GROUP') return
  showMembersDrawer.value = true
  memberSearch.value = ''
  await chatStore.refreshConversation(conv.conversationId)
}

function getMemberName(member: ConversationMember): string {
  return member.nickname || `用户${member.userId}`
}

function formatMemberRole(role?: string): string {
  if (role === 'owner') return '群主'
  if (role === 'admin') return '管理员'
  return '成员'
}

function onMessageInput(event: Event) {
  pruneDraftMentions()
  const conv = chatStore.currentConversation
  if (!conv || conv.type !== 'GROUP') {
    closeMentionPicker()
    return
  }
  const input = event.target as HTMLTextAreaElement
  const cursor = input.selectionStart ?? messageText.value.length
  const beforeCursor = messageText.value.slice(0, cursor)
  const match = beforeCursor.match(/(^|\s)@([^\s@]*)$/)
  if (!match) {
    closeMentionPicker()
    return
  }
  mentionSearch.value = match[2] || ''
  mentionSelectedIndex.value = 0
  showMentionPicker.value = true
  showEmojiPanel.value = false
}

function handleMessageKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && showEmojiPanel.value) {
    event.preventDefault()
    closeEmojiPanel()
    return
  }

  if (showMentionPicker.value && mentionCandidates.value.length) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      mentionSelectedIndex.value = (mentionSelectedIndex.value + 1) % mentionCandidates.value.length
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      mentionSelectedIndex.value =
        (mentionSelectedIndex.value - 1 + mentionCandidates.value.length) % mentionCandidates.value.length
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      selectMention(mentionCandidates.value[mentionSelectedIndex.value])
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMentionPicker()
      return
    }
  }

  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSendText()
  }
}

function selectMention(member: ConversationMember) {
  const input = messageInputRef.value
  const cursor = input?.selectionStart ?? messageText.value.length
  const beforeCursor = messageText.value.slice(0, cursor)
  const atIndex = beforeCursor.lastIndexOf('@')
  if (atIndex < 0) return

  const name = getMemberName(member)
  const mentionText = `@${name} `
  messageText.value =
    messageText.value.slice(0, atIndex) + mentionText + messageText.value.slice(cursor)

  if (!draftMentions.value.some((mention) => mention.userId === member.userId)) {
    draftMentions.value.push({ userId: member.userId, nickname: name })
  }
  closeMentionPicker()

  nextTick(() => {
    const nextCursor = atIndex + mentionText.length
    messageInputRef.value?.focus()
    messageInputRef.value?.setSelectionRange(nextCursor, nextCursor)
  })
}

function closeMentionPicker() {
  showMentionPicker.value = false
  mentionSearch.value = ''
  mentionSelectedIndex.value = 0
}

function pruneDraftMentions(): MessageMention[] {
  const text = messageText.value
  const seen = new Set<string>()
  draftMentions.value = draftMentions.value.filter((mention) => {
    if (seen.has(mention.userId)) return false
    seen.add(mention.userId)
    return text.includes(`@${mention.nickname}`)
  })
  return draftMentions.value
}

function renderTextSegments(msg: Message) {
  const text = msg.displayContent || msg.content
  const mentions = msg.mentions || []
  if (!mentions.length) return [{ text, mention: false, self: false }]

  const labels = mentions
    .map((mention) => ({
      ...mention,
      label: `@${mention.nickname}`,
      self: mention.userId === String(authStore.currentUser?.userId ?? ''),
    }))
    .sort((a, b) => b.label.length - a.label.length)
  const segments: Array<{ text: string; mention: boolean; self: boolean }> = []
  let cursor = 0

  while (cursor < text.length) {
    let nextIndex = -1
    let nextMention: (typeof labels)[number] | null = null
    for (const mention of labels) {
      const index = text.indexOf(mention.label, cursor)
      if (index >= 0 && (nextIndex < 0 || index < nextIndex)) {
        nextIndex = index
        nextMention = mention
      }
    }
    if (nextIndex < 0 || !nextMention) {
      segments.push({ text: text.slice(cursor), mention: false, self: false })
      break
    }
    if (nextIndex > cursor) {
      segments.push({ text: text.slice(cursor, nextIndex), mention: false, self: false })
    }
    segments.push({ text: nextMention.label, mention: true, self: nextMention.self })
    cursor = nextIndex + nextMention.label.length
  }

  return segments.length ? segments : [{ text, mention: false, self: false }]
}

function toggleEmojiPanel() {
  if (!chatStore.currentConversation) {
    alert('请先选择会话')
    return
  }
  showEmojiPanel.value = !showEmojiPanel.value
  if (showEmojiPanel.value) {
    closeMentionPicker()
  }
}

function closeEmojiPanel() {
  showEmojiPanel.value = false
}

function insertEmoji(emoji: string) {
  const input = messageInputRef.value
  const start = input?.selectionStart ?? messageText.value.length
  const end = input?.selectionEnd ?? start
  messageText.value = messageText.value.slice(0, start) + emoji + messageText.value.slice(end)
  rememberEmoji(emoji)
  pruneDraftMentions()
  closeEmojiPanel()

  nextTick(() => {
    const nextCursor = start + emoji.length
    messageInputRef.value?.focus()
    messageInputRef.value?.setSelectionRange(nextCursor, nextCursor)
  })
}

function sendSticker(sticker: Sticker) {
  const conv = chatStore.currentConversation
  if (!conv || !wsManager || !authStore.currentUser) {
    alert('请先选择会话')
    return
  }
  if (!wsConnected.value || !wsManager.isConnected()) {
    alert('WebSocket 未连接，暂时无法发送表情')
    return
  }

  const clientMsgId = generateId()
  const content = buildStickerContent(sticker)
  const sent = wsManager.send('MESSAGE_SEND', {
    conversationId: conv.conversationId,
    messageType: 'STICKER',
    content,
    clientMsgId,
  })
  if (!sent) {
    alert('表情发送失败，请稍后重试')
    return
  }

  rememberSticker(sticker)
  closeEmojiPanel()
  chatStore.addMessage({
    messageId: '',
    conversationId: conv.conversationId,
    senderId: authStore.currentUser.userId,
    senderName: authStore.currentUser.nickname,
    senderAvatar: authStore.currentUser.avatar || '',
    messageType: 'STICKER',
    content,
    displayContent: `[表情] ${sticker.name}`,
    mentions: [],
    clientMsgId,
    createdAt: new Date().toISOString(),
  })
  scrollToBottom()
}

function getStickerInfo(content: string): Sticker | null {
  return parseStickerContent(content)
}

function getImageUrl(content: string): string {
  if (!content) return ''
  try {
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === 'object' && typeof parsed.url === 'string') {
      return parsed.url
    }
  } catch {
    // Existing IMAGE messages are stored as raw URLs.
  }
  return content
}

function rememberEmoji(emoji: string) {
  recentEmojis.value = [emoji, ...recentEmojis.value.filter((item) => item !== emoji)].slice(0, 24)
  localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(recentEmojis.value))
}

function rememberSticker(sticker: Sticker) {
  recentStickers.value = [sticker, ...recentStickers.value.filter((item) => item.id !== sticker.id)].slice(0, 12)
  localStorage.setItem(RECENT_STICKERS_KEY, JSON.stringify(recentStickers.value.map((item) => item.id)))
}

function loadRecentEmojiState() {
  try {
    const storedEmojis = JSON.parse(localStorage.getItem(RECENT_EMOJIS_KEY) || '[]')
    recentEmojis.value = Array.isArray(storedEmojis)
      ? storedEmojis.filter((item) => typeof item === 'string').slice(0, 24)
      : []
  } catch {
    recentEmojis.value = []
  }

  try {
    const storedStickerIds = JSON.parse(localStorage.getItem(RECENT_STICKERS_KEY) || '[]')
    recentStickers.value = Array.isArray(storedStickerIds)
      ? storedStickerIds
          .map((id) => STICKERS.find((sticker) => sticker.id === id))
          .filter((sticker): sticker is Sticker => !!sticker)
          .slice(0, 12)
      : []
  } catch {
    recentStickers.value = []
  }
}

function handleDocumentMouseDown(event: MouseEvent) {
  if (!showEmojiPanel.value) return
  const target = event.target as Node
  if (emojiPanelRef.value?.contains(target) || emojiButtonRef.value?.contains(target)) {
    return
  }
  closeEmojiPanel()
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
  const mentions = pruneDraftMentions()
  const content = buildTextMessageContent(text, mentions)
  const sent = wsManager.send('MESSAGE_SEND', {
    conversationId: conv.conversationId,
    messageType: 'TEXT',
    content,
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
    content,
    displayContent: text,
    mentions,
    clientMsgId,
    createdAt: new Date().toISOString(),
  })

  messageText.value = ''
  draftMentions.value = []
  closeMentionPicker()
  closeEmojiPanel()
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
    displayContent: content,
    mentions: [],
    clientMsgId,
    createdAt: new Date().toISOString(),
  })
  scrollToBottom()
}

// WebSocket message handler
async function handleWsMessage(msg: WsMessage) {
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
      const conv = await chatStore.receiveMessage(
        receivedMessage,
        String(authStore.currentUser?.userId ?? '')
      )
      if (!conv) {
        alert('收到新消息，但会话信息加载失败，请刷新后重试')
      }
      // If current conv, scroll down
      if (chatStore.currentConversation?.conversationId === receivedMessage.conversationId) {
        scrollToBottom()
        chatStore.markAsRead(receivedMessage.conversationId)
      }
      break
    }
    case 'CONVERSATION_CREATED': {
      if (msg.data) {
        chatStore.upsertConversation(normalizeConversation(msg.data))
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
    const res = await createConversation({
      type: 'GROUP',
      name: createGroupName.value,
      memberIds,
    })
    chatStore.upsertConversation(res.data)
    activeTab.value = 'chat'
    await chatStore.selectConversation(res.data.conversationId)
    closeCreateDialog()
    scrollToBottom()
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
  loadRecentEmojiState()
  document.addEventListener('mousedown', handleDocumentMouseDown)
  await authStore.init()
  if (authStore.isLoggedIn) {
    await chatStore.fetchConversations()
    await loadDeptTree()
    initWebSocket()
  }
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleDocumentMouseDown)
  wsManager?.disconnect()
})

watch(
  () => chatStore.currentConversation?.conversationId,
  () => {
    closeMentionPicker()
    closeEmojiPanel()
  }
)

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

.mention-badge {
  background: #ff7a45;
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 10px;
  white-space: nowrap;
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
  position: relative;
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

.member-count-btn {
  width: fit-content;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}

.member-count-btn:hover {
  color: #667eea;
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

.mention {
  color: #4f63d8;
  font-weight: 600;
}

.message-self .mention {
  color: #fff4a3;
}

.mention-self {
  background: rgba(255, 122, 69, 0.16);
  border-radius: 4px;
  padding: 0 2px;
}

.image-bubble {
  max-width: 240px;
  max-height: 240px;
  border-radius: 8px;
  cursor: pointer;
  object-fit: cover;
}

.sticker-bubble {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px;
}

.sticker-img {
  width: 96px;
  height: 96px;
  object-fit: contain;
}

.sticker-error {
  font-size: 11px;
  color: #999;
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
  border: none;
  background: none;
  line-height: 1;
}

.tool-btn:hover {
  background: #e0e0e0;
}

.input-box {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  position: relative;
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

.mention-picker {
  position: absolute;
  left: 0;
  bottom: calc(100% + 6px);
  width: 240px;
  max-height: 260px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
  padding: 6px;
  z-index: 30;
}

.emoji-panel {
  position: absolute;
  left: 0;
  bottom: calc(100% + 6px);
  width: 320px;
  max-height: 360px;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
  padding: 10px;
  z-index: 35;
  overflow-y: auto;
}

.emoji-tabs,
.emoji-group-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}

.emoji-tabs button,
.emoji-group-tabs button {
  border: none;
  border-radius: 6px;
  background: #f0f0f0;
  color: #666;
  cursor: pointer;
  font-size: 12px;
  padding: 5px 10px;
}

.emoji-tabs button.active,
.emoji-group-tabs button.active {
  background: #667eea;
  color: #fff;
}

.emoji-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.emoji-section-title {
  font-size: 12px;
  color: #999;
  margin-bottom: 6px;
}

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 4px;
}

.emoji-item {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: #f8f8f8;
  cursor: pointer;
  font-size: 20px;
}

.emoji-item:hover {
  background: #eef0ff;
}

.sticker-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.sticker-option {
  border: none;
  border-radius: 8px;
  background: #f8f8f8;
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.sticker-option:hover {
  background: #eef0ff;
}

.sticker-option img {
  width: 48px;
  height: 48px;
  object-fit: contain;
}

.mention-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #333;
}

.mention-option:hover,
.mention-option.active {
  background: #eef0ff;
}

.mention-avatar,
.member-avatar {
  width: 28px;
  height: 28px;
  min-width: 28px;
  border-radius: 50%;
  background: #667eea;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-size: 12px;
}

.mention-avatar img,
.member-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
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

.member-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 300px;
  background: #fff;
  border-left: 1px solid #ddd;
  box-shadow: -10px 0 28px rgba(0, 0, 0, 0.08);
  z-index: 20;
  display: flex;
  flex-direction: column;
}

.member-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid #eee;
  font-weight: 600;
  color: #333;
}

.member-search {
  margin: 12px;
  height: 34px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 0 10px;
  font-size: 13px;
  background: #f8f9fa;
}

.member-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 12px;
}

.member-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 8px;
  border-radius: 8px;
}

.member-row:hover {
  background: #f5f6fb;
}

.member-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.member-name {
  font-size: 13px;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.member-role {
  font-size: 11px;
  color: #999;
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

<!-- 聊天主界面：左侧导航栏 + 中间面板（会话列表/通讯录） + 右侧聊天区域（消息列表+输入框） -->
<template>
  <div
    class="chat-layout"
    :class="{
      'compact-mode': settingsStore.general.compactMode,
      'dark-theme': settingsStore.general.theme === 'dark',
      'desktop-window': hasDesktopWindowControls,
      'window-shaking': isWindowShaking,
    }"
  >
    <DesktopWindowControls />

    <!-- 左侧导航栏：消息/通讯录切换、在线状态、更多、退出 -->
    <aside class="left-sidebar" aria-label="主导航">
      <nav class="sidebar-nav">
        <div
          class="user-avatar-sidebar"
          :title="authStore.currentUser?.nickname"
          @click="openOwnProfile"
        >
          <img
            v-if="authStore.currentUser?.avatar && !failedAvatars.has(authStore.currentUser.avatar)"
            :src="authStore.currentUser.avatar"
            class="avatar-img"
            @error="failedAvatars.add(authStore.currentUser.avatar)"
            alt=""
          />
          <span v-else class="avatar-placeholder">
            {{ (authStore.currentUser?.nickname || 'U')[0] }}
          </span>
          <span
            class="sidebar-presence-dot"
            :class="`presence-${selfPresence}`"
            :title="selfPresenceLabel"
            @click.stop="presenceMenuOpen = !presenceMenuOpen"
          ></span>
          <div v-if="presenceMenuOpen" class="presence-menu" @click.stop>
            <button
              v-for="option in PRESENCE_OPTIONS"
              :key="option.value"
              type="button"
              :class="{ active: manualPresence === option.value }"
              @click="setManualPresence(option.value)"
            >
              <span class="presence-dot-inline" :class="`presence-${option.value}`"></span>
              <span>{{ option.label }}</span>
            </button>
          </div>
        </div>
        <button
          class="nav-item"
          :class="{ active: activeTab === 'chat' }"
          :aria-current="activeTab === 'chat' ? 'page' : undefined"
          type="button"
          @click="activeTab = 'chat'"
          title="消息"
        >
          <img :src="messageIcon" class="nav-icon" alt="消息" />
          <span class="nav-label">消息</span>
        </button>
        <button
          class="nav-item"
          :class="{ active: activeTab === 'groups' }"
          :aria-current="activeTab === 'groups' ? 'page' : undefined"
          type="button"
          @click="activeTab = 'groups'"
          title="群聊"
        >
          <img :src="groupIcon" class="nav-icon" alt="群聊" />
          <span class="nav-label">群聊</span>
        </button>
        <button
          class="nav-item"
          :class="{ active: activeTab === 'contacts' }"
          :aria-current="activeTab === 'contacts' ? 'page' : undefined"
          type="button"
          @click="activeTab = 'contacts'"
          title="通讯录"
        >
          <img :src="contactsIcon" class="nav-icon" alt="通讯录" />
          <span class="nav-label">通讯录</span>
        </button>
      </nav>
      <div class="sidebar-footer">
        <button class="settings-btn" type="button" @click="showTransferCenter = true" title="文件传输中心" aria-label="文件传输中心">
          <img :src="transferIcon" alt="文件传输中心" />
        </button>
        <button class="settings-btn" type="button" @click="showSettingsDialog = true" title="更多">
          <img :src="sidebarMoreIcon" alt="更多" />
        </button>
      </div>
    </aside>

    <TransferCenter :open="showTransferCenter" :items="transferCenterItems" :busy-ids="transferBusyIds" @close="showTransferCenter = false" @action="handleTransferAction" @conversation="openConversationFromNotification" />

    <!-- 中间面板：会话列表 或 通讯录 -->
    <aside class="middle-panel" :aria-label="activeTab === 'chat' ? '会话列表' : activeTab === 'groups' ? '群聊列表' : '通讯录'">
      <!-- Chat List -->
      <template v-if="activeTab === 'chat'">
        <div class="panel-header">
          <span class="panel-title">消息</span>
          <button
            class="new-chat-btn"
            type="button"
            title="创建群聊"
            aria-label="创建群聊"
            @click="showCreateGroupDialog = true"
          >
            <img :src="newChatIcon" alt="" />
          </button>
        </div>
        <div class="search-bar">
          <input
            v-model="searchKeyword"
            type="text"
            placeholder="搜索"
            aria-label="搜索会话"
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
              <ConversationAvatar
                class="conv-avatar"
                :class="{ offline: isConversationOffline(conv) }"
                :type="conv.type"
                :src="getConversationAvatar(conv)"
                :name="getConversationName(conv)"
                :alt="`${getConversationName(conv)}头像`"
              >
                <span
                  v-if="showConversationPresence(conv)"
                  class="online-dot"
                  :class="`presence-${getConversationPresence(conv)}`"
                ></span>
              </ConversationAvatar>
              <div class="conv-info">
                <div class="conv-top">
                  <span class="conv-name">{{ getConversationName(conv) }}</span>
                  <span class="conv-time">{{ formatTime(conv.lastMessage?.createdAt) }}</span>
                </div>
                <div class="conv-bottom">
                  <span class="conv-preview">{{ conversationDrafts.preview(conv.conversationId) ? '[草稿] ' + conversationDrafts.preview(conv.conversationId) : getMessagePreviewContent(conv.lastMessage) || '暂无消息' }}</span>
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
              <img :src="pinIcon" class="pin-icon" alt="置顶" />
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
            <ConversationAvatar
              class="conv-avatar"
              :class="{ offline: isConversationOffline(conv) }"
              :type="conv.type"
              :src="getConversationAvatar(conv)"
              :name="getConversationName(conv)"
              :alt="`${getConversationName(conv)}头像`"
            >
              <span
                v-if="showConversationPresence(conv)"
                class="online-dot"
                :class="`presence-${getConversationPresence(conv)}`"
              ></span>
            </ConversationAvatar>
            <div class="conv-info">
              <div class="conv-top">
                <span class="conv-name">{{ getConversationName(conv) }}</span>
                <span class="conv-time">{{ formatTime(conv.lastMessage?.createdAt) }}</span>
              </div>
              <div class="conv-bottom">
                <span class="conv-preview">{{ conversationDrafts.preview(conv.conversationId) ? '[草稿] ' + conversationDrafts.preview(conv.conversationId) : getMessagePreviewContent(conv.lastMessage) || '暂无消息' }}</span>
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

      <!-- Groups -->
      <template v-if="activeTab === 'groups'">
        <div class="panel-header">
          <span class="panel-title">群聊</span>
          <button
            class="new-chat-btn"
            type="button"
            title="创建群聊"
            aria-label="创建群聊"
            @click="showCreateGroupDialog = true"
          >
            <img :src="newChatIcon" alt="" />
          </button>
        </div>
        <div class="search-bar">
          <input
            v-model="groupSearchKeyword"
            type="text"
            placeholder="搜索群聊..."
            aria-label="搜索群聊"
            class="search-input"
          />
        </div>
        <div class="conversation-list">
          <div
            v-for="conv in filteredGroups"
            :key="conv.conversationId"
            class="conv-item"
            :class="{ active: chatStore.currentConversation?.conversationId === conv.conversationId }"
            @click="handleSelectConv(conv)"
          >
            <ConversationAvatar
              class="conv-avatar"
              :type="conv.type"
              :src="getConversationAvatar(conv)"
              :name="getConversationName(conv)"
              :alt="`${getConversationName(conv)}头像`"
            />
            <div class="conv-info">
              <div class="conv-top">
                <span class="conv-name">{{ getConversationName(conv) }}</span>
                <span class="conv-time">{{ formatTime(conv.lastMessage?.createdAt) }}</span>
              </div>
              <div class="conv-bottom">
                <span class="conv-preview">{{ conv.memberCount ? `${conv.memberCount}人` : '群聊' }}</span>
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
          <div v-if="filteredGroups.length === 0" class="empty-hint">
            {{ groupSearchKeyword ? '无结果' : '暂无群聊' }}
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
              @dblclick="startSingleChat(user)"
            >
              <div class="contact-avatar" :class="{ offline: isUserOffline(user) }" @click.stop="openUserProfile(user)" @dblclick.stop>
                <img v-if="getUserAvatar(user) && !failedAvatars.has(getUserAvatar(user))" :src="getUserAvatar(user)" @error="failedAvatars.add(getUserAvatar(user))" alt="" />
                <span v-else>{{ (getResolvedUser(user).nickname || getResolvedUser(user).username || '?')[0] }}</span>
                <span v-if="!isUserOffline(user)" class="online-dot" :class="`presence-${getUserPresence(user)}`"></span>
              </div>
              <div class="contact-info">
                <span class="contact-name">{{ getResolvedUser(user).nickname || getResolvedUser(user).username }}</span>
                <span v-if="getResolvedUser(user).signature" class="contact-signature">{{ getResolvedUser(user).signature }}</span>
                <span class="contact-dept">{{ getResolvedUser(user).deptName || '' }}</span>
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
                  @dblclick="startSingleChat(user)"
                >
                  <div class="contact-avatar" :class="{ offline: isUserOffline(user) }" @click.stop="openUserProfile(user)" @dblclick.stop>
                    <img v-if="getUserAvatar(user) && !failedAvatars.has(getUserAvatar(user))" :src="getUserAvatar(user)" @error="failedAvatars.add(getUserAvatar(user))" alt="" />
                    <span v-else>{{ (getResolvedUser(user).nickname || getResolvedUser(user).username || '?')[0] }}</span>
                    <span v-if="!isUserOffline(user)" class="online-dot" :class="`presence-${getUserPresence(user)}`"></span>
                  </div>
                  <div class="contact-info">
                    <span class="contact-name">{{ getResolvedUser(user).nickname || getResolvedUser(user).username }}</span>
                    <span v-if="getResolvedUser(user).signature" class="contact-signature">{{ getResolvedUser(user).signature }}</span>
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
                      @dblclick="startSingleChat(user)"
                    >
                      <div class="contact-avatar" :class="{ offline: isUserOffline(user) }" @click.stop="openUserProfile(user)" @dblclick.stop>
                        <img v-if="getUserAvatar(user) && !failedAvatars.has(getUserAvatar(user))" :src="getUserAvatar(user)" @error="failedAvatars.add(getUserAvatar(user))" alt="" />
                        <span v-else>{{ (getResolvedUser(user).nickname || getResolvedUser(user).username || '?')[0] }}</span>
                        <span v-if="!isUserOffline(user)" class="online-dot" :class="`presence-${getUserPresence(user)}`"></span>
                      </div>
                      <div class="contact-info">
                        <span class="contact-name">{{ getResolvedUser(user).nickname || getResolvedUser(user).username }}</span>
                        <span v-if="getResolvedUser(user).signature" class="contact-signature">{{ getResolvedUser(user).signature }}</span>
                      </div>
                    </div>
                  </template>
                </div>
              </template>
            </div>
          </template>
        </div>
      </template>
    </aside>

    <!-- 右侧面板：聊天消息区 + 输入区 -->
    <main class="right-panel">
      <template v-if="chatStore.currentConversation">
        <div class="chat-header">
          <ConversationAvatar
            class="chat-header-avatar"
            :type="chatStore.currentConversation.type"
            :src="getConversationAvatar(chatStore.currentConversation)"
            :name="getConversationName(chatStore.currentConversation)"
            :alt="`${getConversationName(chatStore.currentConversation)}头像`"
          />
          <div class="chat-header-info">
            <span class="chat-header-name">{{ getConversationName(chatStore.currentConversation) }}</span>
            <span
              v-if="chatStore.currentConversation.type === 'GROUP'"
              class="chat-header-meta"
            >
              {{ chatStore.currentConversation.memberCount ?? 0 }}人
            </span>
            <span v-else class="chat-header-meta"></span>
          </div>
          <div class="chat-header-actions">
            <button class="action-btn" type="button" title="更多" aria-label="会话设置" @click="toggleMoreDrawer">
              <img :src="moreIcon" alt="更多" />
            </button>
          </div>
        </div>

        <div class="message-area" ref="messageAreaRef" @scroll="onMessageScroll">
          <div class="message-list">
            <div
              v-for="msg in chatStore.currentMessages"
              :key="msg.messageId || msg.clientMsgId"
              :id="messageElementId(msg.messageId || msg.clientMsgId || '')"
              class="message-item"
              :class="{
                'message-self': msg.senderId === authStore.currentUser?.userId,
                'message-highlighted': highlightedMessageId === msg.messageId,
              }"
            >
              <div
                class="message-avatar"
                :title="getUserSignatureTitle(getMessageSenderName(msg), getMessageSenderSignature(msg))"
                @click="openMessageProfile(msg)"
              >
                <img v-if="getMessageSenderAvatar(msg) && !failedAvatars.has(getMessageSenderAvatar(msg))" :src="getMessageSenderAvatar(msg)" @error="failedAvatars.add(getMessageSenderAvatar(msg))" alt="" />
                <span v-else>{{ (getMessageSenderName(msg) || 'U')[0] }}</span>
              </div>
              <div class="message-body">
                <div class="message-sender" :title="getUserSignatureTitle(getMessageSenderName(msg), getMessageSenderSignature(msg))">
                  {{ getMessageSenderName(msg) }}
                </div>
                <div class="message-content">
                  <template v-if="msg.status === 'RECALLED'">
                    <div class="text-bubble recalled-bubble">消息已撤回</div>
                  </template>
                  <template v-else-if="msg.messageType === 'TEXT'">
                    <div class="text-bubble">
                      <div v-if="msg.replyTo" class="reply-preview">
                        {{ msg.replyTo.senderName }}：{{ msg.replyTo.text }}
                      </div>
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
                    <div
                      v-if="getP2pInfo(msg.content)"
                      class="file-bubble p2p-file-bubble"
                    >
                      <span class="file-bubble-main">
                        <span class="file-bubble-name">{{ getP2pInfo(msg.content)?.name }}</span>
                        <span class="file-bubble-meta">{{ formatFileSize(getP2pInfo(msg.content)?.totalSize || 0) }} · 局域网直传</span>
                        <span class="file-bubble-meta">{{ transferStatusLabel(getP2pBubbleItem(msg)) }} · {{ transferProgressText(getP2pBubbleItem(msg)) }}</span>
                        <span v-if="getP2pState(msg)?.error" class="file-bubble-meta p2p-error">{{ getP2pState(msg)?.error }}</span>
                      </span>
                      <span class="p2p-file-actions">
                        <button type="button" class="p2p-action" :disabled="isP2pPrimaryDisabled(msg)" @click="handleP2pPrimary(msg)">{{ getP2pActionLabel(msg) }}</button>
                        <button v-if="canRevealP2p(msg)" type="button" class="p2p-cancel" @click="revealP2pMessage(msg)">位置</button>
                        <button v-if="canCancelP2p(msg)" type="button" class="p2p-cancel" @click="cancelP2pMessage(msg)">取消</button>
                        <button v-if="canStopSharingP2p(msg)" type="button" class="p2p-cancel" @click="handleTransferAction('stopSharing', getP2pBubbleItem(msg))">停止分享</button>
                        <button type="button" class="p2p-cancel" @click="showTransferCenter = true">详情</button>
                      </span>
                    </div>
                    <div
                      v-else
                      class="file-bubble legacy-attachment-disabled"
                    >
                      <span class="file-bubble-main">
                        <span class="file-bubble-name">旧版服务器文件已停用</span>
                        <span class="file-bubble-meta">请发送方重新使用 P2P 发送</span>
                      </span>
                    </div>
                  </template>
                  <template v-else-if="msg.messageType === 'FOLDER'">
                    <div v-if="getP2pInfo(msg.content)" class="folder-bubble">
                      <div class="file-bubble folder-bubble-card p2p-file-bubble">
                        <span class="file-bubble-main">
                          <span class="file-bubble-name">{{ getP2pInfo(msg.content)?.name }}</span>
                          <span class="file-bubble-meta">{{ getP2pInfo(msg.content)?.fileCount }} 个文件 · {{ getP2pInfo(msg.content)?.directoryCount || 0 }} 个目录 · {{ formatFileSize(getP2pInfo(msg.content)?.totalSize || 0) }} · 局域网直传</span>
                          <span class="file-bubble-meta">{{ transferStatusLabel(getP2pBubbleItem(msg)) }} · {{ transferProgressText(getP2pBubbleItem(msg)) }}</span>
                          <span v-if="getP2pState(msg)?.error" class="file-bubble-meta p2p-error">{{ getP2pState(msg)?.error }}</span>
                        </span>
                        <span class="p2p-file-actions">
                          <button type="button" class="p2p-action" :disabled="isP2pPrimaryDisabled(msg)" @click="handleP2pPrimary(msg)">{{ getP2pActionLabel(msg) }}</button>
                          <button v-if="canRevealP2p(msg)" type="button" class="p2p-cancel" @click="revealP2pMessage(msg)">位置</button>
                          <button v-if="canCancelP2p(msg)" type="button" class="p2p-cancel" @click="cancelP2pMessage(msg)">取消</button>
                        <button v-if="canStopSharingP2p(msg)" type="button" class="p2p-cancel" @click="handleTransferAction('stopSharing', getP2pBubbleItem(msg))">停止分享</button>
                        <button type="button" class="p2p-cancel" @click="showTransferCenter = true">详情</button>
                        </span>
                      </div>
                    </div>
                    <div v-else class="folder-bubble">
                      <div class="file-bubble folder-bubble-card legacy-attachment-disabled">
                        <span class="file-bubble-main">
                          <span class="file-bubble-name">旧版服务器文件夹已停用</span>
                          <span class="file-bubble-meta">请发送方重新使用 P2P 发送</span>
                        </span>
                      </div>
                    </div>
                  </template>
                  <template v-else-if="msg.messageType === 'SHAKE'">
                    <div class="text-bubble shake-bubble">
                      <img :src="shakeIcon" alt="" class="shake-bubble-icon" />
                      <span>{{ msg.senderId === String(authStore.currentUser?.userId ?? '') ? '你' : getMessageSenderName(msg) }}发送了一个窗口抖动</span>
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
                      <span v-else class="sticker-error">本地表情不可用</span>
                    </div>
                  </template>
                </div>
                <div class="message-time">
                  {{ formatTime(msg.createdAt) }}
                  <span v-if="getReadReceiptText(msg)" class="message-read-receipt">
                    · {{ getReadReceiptText(msg) }}
                  </span>
                  <span v-if="msg.status === 'SENDING'"> · 发送中</span>
                  <button
                    v-if="msg.status !== 'RECALLED'"
                    type="button"
                    class="message-action-link"
                    @click="startReply(msg)"
                  >
                    回复
                  </button>
                  <button
                    v-if="canRecallMessage(msg)"
                    type="button"
                    class="message-action-link"
                    @click="recallCurrentMessage(msg)"
                  >
                    撤回
                  </button>
                  <button
                    v-if="msg.status === 'FAILED'"
                    type="button"
                    class="message-retry"
                    @click="retryMessage(msg)"
                  >
                    发送失败，重试
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          class="input-area"
          :class="{ 'is-file-drag-active': isAttachmentDragActive }"
          @dragenter="handleAttachmentDragEnter"
          @dragover="handleAttachmentDragOver"
          @dragleave="handleAttachmentDragLeave"
          @drop="handleAttachmentDrop"
        >
          <div
            v-if="isAttachmentDragActive"
            class="attachment-drop-overlay"
            aria-hidden="true"
          >
            <img :src="fileIcon" alt="" />
            <strong>松开以添加到当前会话</strong>
            <span>图片、视频和文件将在点击发送后上传</span>
          </div>
          <div v-if="replyTarget" class="reply-target">
            <span>回复 {{ replyTarget.senderName }}：{{ replyTarget.text }}</span>
            <button type="button" @click="replyTarget = null">✕</button>
          </div>
          <div class="input-box">
            <div class="message-field">
              <div class="message-content-scroll">
                <AttachmentDraftTray
                  ref="attachmentDraftTrayRef"
                  :drafts="currentAttachmentDrafts"
                  :disabled="false"
                  @remove="removeAttachmentDraft"
                  @pause="pauseAttachmentDraft"
                  @retry="retryAttachmentDraft"
                  @focus-input="focusMessageInputAtStart"
                />
                <p
                  v-if="attachmentFeedback"
                  class="attachment-feedback"
                  :class="{ error: attachmentFeedbackIsError }"
                  role="alert"
                >{{ attachmentFeedback }}</p>
                <p v-if="draftSaveError" class="attachment-feedback error" role="alert">{{ draftSaveError }}</p>
                <textarea
                  ref="messageInputRef"
                  v-model="messageText"
                  class="message-input"
                  rows="3"
                  aria-label="输入消息"
                  placeholder="输入消息，按 Enter 发送"
                  :disabled="isSendingMessage"
                  @input="onMessageInput"
                  @keydown="handleMessageKeydown"
                  @paste="handleMessagePaste"
                ></textarea>
              </div>
              <div class="input-toolbar">
                <button
                  ref="emojiButtonRef"
                  class="tool-btn"
                  title="表情"
                  type="button"
                  @click="toggleEmojiPanel"
                >
                  <img :src="emojiIcon" alt="表情" />
                </button>
                <label
                  class="tool-btn"
                  :class="{ disabled: isSendingMessage }"
                  title="发送图片"
                  :aria-disabled="isSendingMessage"
                  role="button"
                  :tabindex="isSendingMessage ? -1 : 0"
                  @keydown.enter.prevent="activateFileLabel"
                  @keydown.space.prevent="activateFileLabel"
                >
                  <img :src="imageIcon" alt="" />
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp,.png,.jpg,.jpeg,.gif,.webp"
                    multiple
                    hidden
                    :disabled="isSendingMessage"
                    @change="onSendImage"
                  />
                </label>
                <label
                  class="tool-btn"
                  :class="{ disabled: isSendingMessage }"
                  title="发送文件（单文件最多 2GB，双方桌面端直传）"
                  :aria-disabled="isSendingMessage"
                  role="button"
                  :tabindex="isSendingMessage ? -1 : 0"
                  @keydown.enter.prevent="activateFileLabel"
                  @keydown.space.prevent="activateFileLabel"
                  @click.capture="guardP2pPicker"
                >
                  <img :src="fileIcon" alt="" />
                  <input type="file" multiple hidden :disabled="isSendingMessage" @change="onSendFile" />
                </label>
                <label
                  class="tool-btn"
                  :class="{ disabled: isSendingMessage }"
                  title="发送文件夹（最多 20GB、10,000 个文件及 10,000 个目录）"
                  :aria-disabled="isSendingMessage"
                  role="button"
                  :tabindex="isSendingMessage ? -1 : 0"
                  @keydown.enter.prevent="activateFileLabel"
                  @keydown.space.prevent="activateFileLabel"
                  @click.capture="guardP2pPicker"
                >
                  <svg class="tool-folder-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M3.5 6.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
                  </svg>
                  <input type="file" webkitdirectory directory multiple hidden :disabled="isSendingMessage" @change="onSendFolder" />
                </label>
                <button
                  class="tool-btn"
                  title="发送窗口抖动"
                  type="button"
                  :disabled="isSendingMessage"
                  @click="sendShakeMessage()"
                >
                  <img :src="shakeIcon" alt="窗口抖动" />
                </button>
              </div>
              <button
                class="send-btn"
                type="button"
                :disabled="isSendingMessage"
                @click="handleSendText"
              >{{ isSendingMessage ? '发送中...' : '发送' }}</button>
            </div>
            <div v-if="showMentionPicker && mentionCandidates.length" class="mention-picker">
              <div
                v-for="(member, index) in mentionCandidates"
                :key="member.userId"
                class="mention-option"
                :class="{ active: index === mentionSelectedIndex }"
                @mousedown.prevent="selectMention(member)"
              >
                <div class="mention-avatar">
                  <img v-if="getUserAvatar(member) && !failedAvatars.has(getUserAvatar(member))" :src="getUserAvatar(member)" @error="failedAvatars.add(getUserAvatar(member))" alt="" />
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
                <div class="emoji-section">
                  <div class="emoji-section-title sticker-section-header">
                    <span>我的表情</span>
                    <button type="button" class="sticker-manage-btn" @click="pickCustomSticker">添加</button>
                  </div>
                  <input
                    ref="customStickerInputRef"
                    type="file"
                    :accept="CUSTOM_STICKER_LIMITS.accept"
                    hidden
                    @change="onCustomStickerSelected"
                  />
                  <div v-if="customStickers.length" class="sticker-grid">
                    <div
                      v-for="sticker in customStickers"
                      :key="sticker.id"
                      class="custom-sticker-option"
                    >
                      <button
                        type="button"
                        class="sticker-option"
                        :title="sticker.name"
                        @click="sendSticker(sticker)"
                      >
                        <img :src="sticker.url" :alt="sticker.name" />
                      </button>
                      <div class="custom-sticker-actions">
                        <button type="button" @click="renameCustomSticker(sticker)">重命名</button>
                        <button type="button" @click="removeCustomSticker(sticker)">删除</button>
                      </div>
                    </div>
                  </div>
                  <div v-else class="sticker-empty">还没有自定义表情</div>
                  <div v-if="customStickerError" class="sticker-error-text">{{ customStickerError }}</div>
                </div>
                <div class="emoji-section">
                  <div class="emoji-section-title">内置表情</div>
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
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="no-conversation">
          <img :src="messageIcon" class="no-conv-icon" alt="消息" />
          <p>选择一个会话开始聊天</p>
        </div>
      </template>

      <div v-if="showMembersDrawer" class="member-drawer">
        <div class="member-drawer-header">
          <button
            class="member-drawer-back"
            type="button"
            :aria-label="memberDrawerBackLabel"
            @click="handleMemberDrawerBack"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <strong class="member-drawer-title">{{ memberDrawerTitle }}</strong>
          <div v-if="memberDrawerMode === 'list' && canManageCurrentGroup" class="member-drawer-actions">
            <button type="button" aria-label="邀请成员" title="邀请成员" @click="openMemberSubMode('invite')">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <button type="button" aria-label="编辑群聊资料" title="编辑群聊资料" @click="openMemberSubMode('settings')">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V20h-3v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 14.7a1.7 1.7 0 0 0-1.55-1H5v-3h.45A1.7 1.7 0 0 0 7 9.7a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.12-2.12.06.06A1.7 1.7 0 0 0 10.66 6a1.7 1.7 0 0 0 1-1.55V4h3v.45a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06A1.7 1.7 0 0 0 19.4 9.7a1.7 1.7 0 0 0 1.55 1H21v3h-.05a1.7 1.7 0 0 0-1.55 1.3Z" />
              </svg>
            </button>
          </div>
        </div>

        <template v-if="memberDrawerMode === 'list'">
          <label class="member-search-box">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6" />
              <path d="m16 16 4 4" />
            </svg>
            <input v-model="memberSearch" type="search" placeholder="搜索" aria-label="搜索群聊成员" />
          </label>
          <div class="member-list">
            <div
              v-for="member in filteredGroupMembers"
              :key="member.userId"
              class="member-row"
            >
              <button class="member-profile-button" type="button" @click="openUserProfile(member)">
                <span class="member-avatar" :class="{ offline: isUserOffline(member) }">
                  <img
                    v-if="getUserAvatar(member) && !failedAvatars.has(getUserAvatar(member))"
                    :src="getUserAvatar(member)"
                    :alt="`${getMemberName(member)}头像`"
                    @error="failedAvatars.add(getUserAvatar(member))"
                  />
                  <span v-else>{{ getMemberName(member)[0] }}</span>
                </span>
                <span class="member-name">{{ getMemberName(member) }}</span>
              </button>
              <span
                v-if="member.role === 'owner' || member.role === 'admin'"
                class="member-role-badge"
                :class="`member-role-${member.role}`"
              >
                {{ formatMemberRole(member.role) }}
              </span>
              <button
                v-if="hasMemberManagementActions(member)"
                class="member-menu-trigger"
                type="button"
                :aria-label="`管理${getMemberName(member)}`"
                :aria-expanded="activeMemberActionsId === member.userId"
                @click.stop="toggleMemberActions(member.userId)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="5" cy="12" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="19" cy="12" r="1.5" />
                </svg>
              </button>
              <div v-if="activeMemberActionsId === member.userId" class="member-action-menu">
                <button v-if="canUpdateMemberRole(member)" type="button" @click="toggleMemberRole(member)">
                  {{ member.role === 'admin' ? '取消管理员' : '设为管理员' }}
                </button>
                <button v-if="canTransferGroupOwner(member)" type="button" @click="transferGroupOwner(member)">
                  转让群主
                </button>
                <button
                  v-if="canRemoveGroupMember(member)"
                  type="button"
                  class="danger"
                  @click="removeGroupMember(member)"
                >
                  {{ member.userId === String(authStore.currentUser?.userId ?? '') ? '退出群聊' : '移除成员' }}
                </button>
              </div>
            </div>
            <div v-if="filteredGroupMembers.length === 0" class="member-empty">未找到相关成员</div>
          </div>
        </template>

        <div v-else-if="memberDrawerMode === 'invite'" class="member-invite-panel">
          <label class="member-search-box">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6" />
              <path d="m16 16 4 4" />
            </svg>
            <input
              v-model="memberAddKeyword"
              type="search"
              placeholder="搜索联系人"
              aria-label="搜索并邀请成员"
              @input="onSearchAddMember"
            />
          </label>
          <div class="member-invite-results">
            <button
              v-for="user in memberAddResults"
              :key="user.userId || user.id"
              type="button"
              @click="addGroupMember(user)"
            >
              <span class="member-avatar">
                <img
                  v-if="getUserAvatar(user) && !failedAvatars.has(getUserAvatar(user))"
                  :src="getUserAvatar(user)"
                  :alt="`${getResolvedUser(user).nickname || getResolvedUser(user).username}头像`"
                  @error="failedAvatars.add(getUserAvatar(user))"
                />
                <span v-else>{{ (getResolvedUser(user).nickname || getResolvedUser(user).username || '?')[0] }}</span>
              </span>
              <span>{{ getResolvedUser(user).nickname || getResolvedUser(user).username }}</span>
              <small>邀请</small>
            </button>
            <div v-if="memberAddKeyword.trim() && memberAddResults.length === 0" class="member-empty">
              未找到可邀请的联系人
            </div>
          </div>
        </div>

        <div
          v-else-if="memberDrawerMode === 'settings' && chatStore.currentConversation?.type === 'GROUP'"
          class="group-settings-box"
        >
          <div class="group-avatar-setting">
            <ConversationAvatar
              :type="'GROUP'"
              :src="getConversationAvatar(chatStore.currentConversation)"
              :name="chatStore.currentConversation.name"
              alt="群头像"
              :size="56"
            />
            <div class="group-avatar-details">
              <span class="group-avatar-label">群头像</span>
              <div v-if="canEditCurrentGroupAvatar" class="group-avatar-actions">
                <button
                  type="button"
                  class="group-avatar-action"
                  :disabled="groupAvatarSaving"
                  @click="openGroupAvatarPicker"
                >
                  {{ groupAvatarSaving ? '处理中...' : '修改头像' }}
                </button>
                <button
                  v-if="chatStore.currentConversation.avatarType === 'custom'"
                  type="button"
                  class="group-avatar-action danger"
                  :disabled="groupAvatarSaving"
                  @click="restoreGroupAvatar"
                >
                  恢复默认
                </button>
                <input
                  ref="groupAvatarInputRef"
                  class="visually-hidden"
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  aria-label="选择群头像图片"
                  @change="onGroupAvatarSelected"
                />
              </div>
              <p
                v-if="groupAvatarStatus"
                class="group-avatar-status"
                :class="{ error: groupAvatarStatusIsError }"
                :role="groupAvatarStatusIsError ? 'alert' : 'status'"
                aria-live="polite"
              >
                {{ groupAvatarStatus }}
              </p>
            </div>
          </div>
          <label class="group-setting-field">
            <span>群名称</span>
            <input type="text" :value="groupSettingsName" @input="onGroupNameInput" />
          </label>
          <button
            type="button"
            class="dialog-submit compact-submit"
            :disabled="groupSettingsSaving"
            @click="saveGroupSettings"
          >
            {{ groupSettingsSaving ? '保存中...' : '保存群聊资料' }}
          </button>
          <p v-if="groupSettingsStatus" class="group-settings-status">{{ groupSettingsStatus }}</p>
        </div>

        <div
          v-else-if="memberDrawerMode === 'announcement' && chatStore.currentConversation?.type === 'GROUP'"
          class="group-announcement-editor"
        >
          <label class="group-setting-field">
            <span>群公告</span>
            <textarea
              :value="groupSettingsAnnouncement"
              rows="8"
              :disabled="!canManageCurrentGroup"
              placeholder="填写群公告"
              @input="onGroupAnnouncementInput"
            ></textarea>
          </label>
          <button
            v-if="canManageCurrentGroup"
            type="button"
            class="dialog-submit compact-submit"
            :disabled="groupSettingsSaving"
            @click="saveGroupAnnouncement"
          >
            {{ groupSettingsSaving ? '保存中...' : '保存群公告' }}
          </button>
          <p v-if="groupSettingsStatus" class="group-settings-status">{{ groupSettingsStatus }}</p>
        </div>
      </div>

      <div v-if="showSearchDrawer" class="search-drawer">
        <div class="search-drawer-header">
          <button class="drawer-back-btn" type="button" @click="closeSearchDrawer">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span>返回</span>
          </button>
          <span class="search-drawer-title">搜索聊天记录</span>
        </div>

        <div class="search-drawer-input-row">
          <input
            v-model="chatSearchKeyword"
            ref="searchDrawerInputRef"
            class="search-drawer-input"
            placeholder="输入关键字搜索..."
            @keyup.enter="runChatSearch"
          />
          <button class="search-drawer-btn" @click="runChatSearch">搜索</button>
        </div>

        <div class="search-drawer-results">
          <template v-if="chatSearchResults.length">
            <button
              v-for="result in chatSearchResults"
              :key="result.messageId"
              type="button"
              class="search-result-row"
              @click="jumpToSearchResult(result)"
            >
              <span>{{ getMessageSenderName(result) }}</span>
              <span>{{ result.displayContent || result.content }}</span>
              <span>{{ formatTime(result.createdAt) }}</span>
            </button>
          </template>
          <div v-else-if="hasSearched" class="empty-hint">无搜索结果</div>
          <div v-else class="empty-hint">输入关键字开始搜索</div>
        </div>
      </div>

      <!-- 更多功能抽屉 -->
      <aside
        v-if="showMoreDrawer"
        class="more-drawer"
        aria-label="会话设置"
      >
        <div class="more-drawer-header">
          <button
            class="more-drawer-back"
            type="button"
            aria-label="返回上一级"
            @click="showMoreDrawer = false"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span>返回</span>
          </button>
        </div>

        <div class="more-drawer-body">
          <section class="more-profile-card">
            <ConversationAvatar
              :type="chatStore.currentConversation!.type"
              :src="getConversationAvatar(chatStore.currentConversation!)"
              :name="getConversationName(chatStore.currentConversation!)"
              :alt="`${getConversationName(chatStore.currentConversation!)}头像`"
              :size="40"
            />
            <div class="more-profile-copy">
              <strong>{{ getConversationName(chatStore.currentConversation!) }}</strong>
            </div>

          </section>

          <template v-if="chatStore.currentConversation?.type === 'GROUP'">
            <section class="more-members-card">
              <button class="more-section-heading" type="button" @click="onMoreMembers">
                <strong>群聊成员</strong>
                <span>查看{{ chatStore.currentConversation.memberCount ?? sortedGroupMembers.length }}名群成员</span>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
              <div class="more-member-grid">
                <button
                  v-for="member in drawerGroupMembers"
                  :key="member.userId"
                  class="more-member-cell"
                  type="button"
                  :title="getMemberName(member)"
                  @click="openUserProfile(member)"
                >
                  <span class="more-member-avatar" :class="{ offline: isUserOffline(member) }">
                    <img
                      v-if="getUserAvatar(member) && !failedAvatars.has(getUserAvatar(member))"
                      :src="getUserAvatar(member)"
                      :alt="`${getMemberName(member)}头像`"
                      @error="failedAvatars.add(getUserAvatar(member))"
                    />
                    <span v-else>{{ getMemberName(member)[0] }}</span>
                  </span>
                  <span class="more-member-name">{{ getMemberName(member) }}</span>
                </button>
                <button class="more-member-cell" type="button" @click="onMoreInvite">
                  <span class="more-member-avatar more-member-add" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                  <span class="more-member-name">{{ canManageCurrentGroup ? '邀请' : '成员' }}</span>
                </button>
              </div>
            </section>

            <section class="more-field-group">
              <span class="more-field-label">群公告</span>
              <button class="more-field-row" type="button" @click="onMoreAnnouncement">
                <span :class="{ muted: !chatStore.currentConversation.announcement }">
                  {{ chatStore.currentConversation.announcement || '暂无群公告' }}
                </span>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </section>

            <section v-if="canManageCurrentGroup" class="more-field-group">
              <span class="more-field-label">资料管理</span>
              <button class="more-field-row" type="button" @click="onMoreGroupSettings">
                <span>群资料设置</span>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </section>

          </template>

          <section class="more-settings-card">
            <button
              class="more-setting-row"
              type="button"
              :aria-pressed="chatStore.currentConversation?.pinned"
              @click="onMoreTogglePin"
            >
              <span>设为置顶</span>
              <span class="more-switch" :class="{ active: chatStore.currentConversation?.pinned }">
                <span></span>
              </span>
            </button>
            <button
              class="more-setting-row"
              type="button"
              :aria-pressed="chatStore.currentConversation?.muted"
              @click="onMoreToggleMute"
            >
              <span>消息免打扰</span>
              <span class="more-switch" :class="{ active: chatStore.currentConversation?.muted }">
                <span></span>
              </span>
            </button>
          </section>

          <section class="more-action-card">
            <button type="button" @click="onMoreSearch">
              <span>查找聊天记录</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            <button type="button" class="more-delete-row" @click="clearCurrentConversationRecords">
              删除聊天记录
            </button>
          </section>

          <button
            v-if="chatStore.currentConversation?.type === 'GROUP'"
            class="more-leave-btn"
            type="button"
            @click="isCurrentUserGroupOwner ? disbandCurrentGroup() : leaveCurrentGroup()"
          >
            {{ isCurrentUserGroupOwner ? '解散群聊' : '退出群聊' }}
          </button>
        </div>
      </aside>
    </main>

    <div v-if="showGroupAvatarPreview" class="dialog-overlay" @click.self="cancelGroupAvatarPreview">
      <div class="dialog-box group-avatar-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="group-avatar-preview-title">
        <div class="dialog-header">
          <span id="group-avatar-preview-title">确认群头像</span>
          <button class="dialog-close" aria-label="关闭头像预览" @click="cancelGroupAvatarPreview">✕</button>
        </div>
        <div class="dialog-body group-avatar-preview-body">
          <ConversationAvatar
            :type="'GROUP'"
            :src="groupAvatarPreviewUrl"
            name="群"
            alt="待上传的群头像预览"
            :size="120"
          />
          <p>{{ selectedGroupAvatar?.name }}</p>
          <p
            v-if="groupAvatarStatus"
            class="group-avatar-status"
            :class="{ error: groupAvatarStatusIsError }"
            :role="groupAvatarStatusIsError ? 'alert' : 'status'"
            aria-live="polite"
          >
            {{ groupAvatarStatus }}
          </p>
          <div class="group-avatar-preview-actions">
            <button type="button" class="dialog-cancel" :disabled="groupAvatarSaving" @click="cancelGroupAvatarPreview">取消</button>
            <button type="button" class="dialog-submit" :disabled="groupAvatarSaving" @click="confirmGroupAvatarUpload">
              {{ groupAvatarSaving ? `上传中 ${groupAvatarProgress}%` : '确认上传' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <CreateGroupDialog
      v-if="showCreateGroupDialog"
      :conversations="chatStore.conversations"
      :current-user-id="String(authStore.currentUser?.userId || '')"
      @close="showCreateGroupDialog = false"
      @created="handleGroupCreated"
    />

    <!-- 图片预览全屏遮罩 -->
    <div v-if="previewImage" class="dialog-overlay preview-overlay" @click="previewImage = ''">
      <img :src="previewImage" class="preview-img" alt="预览" />
    </div>

    <SettingsDialog
      v-if="showSettingsDialog"
      @close="showSettingsDialog = false"
      @logout="handleLogout"
      @open-profile="openOwnProfileFromSettings"
      @recent-cache-cleared="clearRecentEmojiState"
      @local-cache-cleared="handleLocalCacheCleared"
    />
    <ProfileDialog
      v-if="showProfileDialog"
      :user="selectedProfileUser"
      :presence="getProfilePresence(selectedProfileUser)"
      @close="showProfileDialog = false"
      @saved="handleProfileSaved"
    />
  </div>
</template>

<script setup lang="ts">
// 聊天主界面：管理会话列表、通讯录、消息收发、附件上传、表情/贴纸、@提及、WebSocket 通信、在线状态等核心功能

import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore, type UserInfo } from '../stores/auth'
import { useChatStore } from '../stores/chat'
import { useConversationDrafts, type ConversationDraft } from '../stores/conversationDrafts'
import { createMessageSender } from '../utils/messageSender'
import { isChatForeground, isConversationBeingRead } from '../utils/chatAttention'
import { useSettingsStore } from '../stores/settings'
import { useUserProfileStore, type UserProfileSnapshot } from '../stores/userProfiles'
import {
  useAttachmentDraftStore,
  resolveDraftKind,
  type AttachmentDraft,
  type AttachmentDraftClassification,
} from '../stores/attachmentDrafts'
import { useP2pTransferStore } from '../stores/p2pTransfers'
import SettingsDialog from '../components/SettingsDialog.vue'
import ProfileDialog from '../components/ProfileDialog.vue'
import AttachmentDraftTray from '../components/AttachmentDraftTray.vue'
import TransferCenter, { transferActions, primaryTransferAction, transferStatusLabel, transferProgressText, type TransferCenterItem, type TransferAction } from '../components/TransferCenter.vue'
import ConversationAvatar from '../components/ConversationAvatar.vue'
import CreateGroupDialog from '../components/CreateGroupDialog.vue'
import DesktopWindowControls from '../components/DesktopWindowControls.vue'
import { WebSocketManager, type WsMessage } from '../utils/websocket'
import { createWebSocketTicket } from '../api/auth'
import { getDeptTree, type DeptNode } from '../api/dept'
import { getUserProfile, getUsersByDept, searchUsers } from '../api/user'
import {
  addMembers,
  createConversation,
  disbandGroup,
  muteConversation,
  normalizeConversation,
  pinConversation,
  removeMember,
  restoreDefaultGroupAvatar,
  transferConversationOwner,
  updateConversationSettings,
  updateMemberRole,
  uploadGroupAvatar,
  type Conversation,
  type ConversationMember,
} from '../api/conversation'
import {
  buildTextMessageContent,
  getMessagePreviewContent,
  isAllMention,
  MESSAGE_MENTION_ALL_ID,
  normalizeMessage,
  recallMessage,
  searchMessages as searchServerMessages,
  type Message,
  type MessageMention,
} from '../api/message'
import {
  canUseLocalMessageStore,
  clearLocalConversationMessages,
  searchLocalMessages,
  upsertLocalMessage,
} from '../utils/localMessageStore'
import {
  downloadFileBlob,
  getFileUrl,
  uploadConversationImage,
} from '../api/file'
import { parseP2pAttachmentContent, type P2pAttachmentContent } from '../utils/p2pProtocol'
import { createAttachmentQueue, createAttachmentTaskPersistence } from '../utils/attachmentQueue'
import {
  DragDepthTracker,
  collectDroppedItems,
  droppedDirectoryNames,
  hasFileDragPayload,
  type DroppedFolder,
} from '../utils/fileDrop'
import { EMOJI_GROUPS } from '../constants/emoji'
import {
  STICKERS,
  buildStickerContent,
  parseStickerContent,
  type Sticker,
} from '../constants/stickers'
import { RECENT_EMOJIS_KEY, RECENT_STICKERS_KEY } from '../utils/recentUsage'
import { extractFileDownloadId } from '../utils/fileUrl'
import {
  CUSTOM_STICKER_LIMITS,
  addCustomStickerRecord,
  deleteCustomStickerRecord,
  listCustomStickerRecords,
  renameCustomStickerRecord,
  type CustomStickerRecord,
} from '../utils/customStickers'
import {
  PRESENCE_OPTIONS,
  getPresenceLabel,
  isPresenceOnline,
  normalizePresenceStatus,
  type PresenceStatus,
} from '../utils/presence'
import messageIcon from '../assets/icons/消息.svg'
import contactsIcon from '../assets/icons/联系人.svg'
import groupIcon from '../assets/icons/群聊.svg'
import moreIcon from '../assets/icons/三横点.svg'
import sidebarMoreIcon from '../assets/icons/三横杠.svg'
import transferIcon from '../assets/icons/文件传输.svg'
import newChatIcon from '../assets/icons/新建会话.svg'
import pinIcon from '../assets/icons/置顶.svg'
import emojiIcon from '../assets/icons/emoji.svg'
import fileIcon from '../assets/icons/文件夹.svg'
import imageIcon from '../assets/icons/图片.svg'
import shakeIcon from '../assets/icons/窗口抖动.svg'

const router = useRouter()
const authStore = useAuthStore()
const chatStore = useChatStore()
const settingsStore = useSettingsStore()
const userProfileStore = useUserProfileStore()
const attachmentDraftStore = useAttachmentDraftStore()
const p2pTransferStore = useP2pTransferStore()
const attachmentQueue = createAttachmentQueue()
const showTransferCenter = ref(false)
const transferBusyIds = ref<string[]>([])
const transferNotificationStates = new Map<string, string>()
const attachmentTaskPersistence = createAttachmentTaskPersistence()
let attachmentAccountGeneration = 0

const activeTab = ref<'chat' | 'groups' | 'contacts'>('chat') // 左侧导航当前激活标签
const showSettingsDialog = ref(false) // 设置弹窗可见性
const showProfileDialog = ref(false) // 用户资料弹窗可见性
const selectedProfileUserId = ref('')
const selectedProfileFallback = ref<UserProfileSnapshot | null>(null)
const selectedProfileUser = computed<any | null>(() => {
  if (!selectedProfileUserId.value) return null
  return userProfileStore.resolveProfile(selectedProfileFallback.value || selectedProfileUserId.value)
})
const searchKeyword = ref('') // 会话搜索关键词
const groupSearchKeyword = ref('') // 群聊搜索关键词
const contactSearchKeyword = ref('') // 通讯录搜索关键词
const failedAvatars = ref(new Set<string>()) // 加载失败的头像 URL 集合
const manualPresence = ref<PresenceStatus>('online') // 用户手动设置的在线状态
const presenceMenuOpen = ref(false) // 在线状态菜单是否打开
const wsConnected = ref(false) // WebSocket 连接状态

let wsManager: WebSocketManager | null = null // WebSocket 管理器实例
let removeNotificationOpenListener: (() => void) | null = null // 桌面通知点击回调清理函数
let idleTimer: ReturnType<typeof setTimeout> | null = null // 空闲检测定时器（5分钟无操作自动离开）
let autoAway = false // 是否因空闲自动设为离开状态

// 根据搜索关键词过滤未置顶会话列表
const filteredConversations = computed(() => {
  if (!searchKeyword.value) return chatStore.unpinnedConversations
  const kw = searchKeyword.value.toLowerCase()
  return chatStore.unpinnedConversations.filter(
    (c) => getConversationName(c).toLowerCase().includes(kw)
  )
})

// 我创建或加入的所有群聊（GROUP 类型会话），支持按群名搜索
const filteredGroups = computed(() => {
  const groups = chatStore.conversations.filter((c) => c.type === 'GROUP')
  if (!groupSearchKeyword.value) return groups
  const kw = groupSearchKeyword.value.toLowerCase()
  return groups.filter((c) => getConversationName(c).toLowerCase().includes(kw))
})

// 部门树数据
const deptTree = ref<DeptNode[]>([])
const expandedDepts = ref(new Set<string>())
const deptUsersMap = ref<Record<string, any[]>>({})
const UNASSIGNED_DEPT_ID = '__unassigned__'

// 加载部门树和未分配部门用户
async function loadDeptTree() {
  const [deptRes, unassignedRes] = await Promise.all([
    getDeptTree(),
    getUsersByDept(),
  ])
  const unassignedUsers = unassignedRes.data ?? []
  userProfileStore.upsertProfiles(unassignedUsers)
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
}

// 初始化加载会话列表、通讯录和待处理消息
async function loadInitialChatData() {
  const conversationTask = chatStore.fetchConversations().catch((err) => {
    console.warn('会话列表加载失败', err)
  })
  const contactsTask = loadDeptTree().catch((err) => {
    console.warn('通讯录加载失败', err)
  })

  await Promise.all([conversationTask, contactsTask])
}

// 展开/折叠部门节点，首次展开时加载该部门用户
async function toggleDept(deptId: string) {
  if (expandedDepts.value.has(deptId)) {
    expandedDepts.value.delete(deptId)
  } else {
    expandedDepts.value.add(deptId)
    if (!deptUsersMap.value[deptId]) {
      try {
        const res = await getUsersByDept(deptId === UNASSIGNED_DEPT_ID ? undefined : deptId)
        userProfileStore.upsertProfiles(res.data || [])
        deptUsersMap.value[deptId] = res.data
      } catch {
        deptUsersMap.value[deptId] = []
      }
    }
  }
}

// 通讯录搜索（防抖 300ms）
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
      userProfileStore.upsertProfiles(res.data || [])
      searchedUsers.value = res.data
    } catch {
      searchedUsers.value = []
    }
  }, 300)
}

// 消息区和输入框引用
const messageAreaRef = ref<HTMLElement | null>(null)
const messageInputRef = ref<HTMLTextAreaElement | null>(null)
const attachmentDraftTrayRef = ref<{ focusLast: () => void } | null>(null)
const emojiButtonRef = ref<HTMLElement | null>(null)
const emojiPanelRef = ref<HTMLElement | null>(null)
const customStickerInputRef = ref<HTMLInputElement | null>(null)
const conversationDrafts = useConversationDrafts(
  computed(() => authStore.currentUser?.userId || ''),
  computed(() => chatStore.currentConversation?.conversationId),
)
const { text: messageText, mentions: draftMentions, replyTo: replyTarget, error: draftSaveError } = conversationDrafts
const messageSender = createMessageSender(chatStore.updateMessageStatus, chatStore.setMessageStatus)
const previewImage = ref('')
const authenticatedImageUrls = ref<Record<string, string>>({})
const imageLoadsInProgress = new Set<string>()
let imageLoadGeneration = 0
const authenticatedAvatarUrls = ref<Record<string, string>>({})
const avatarLoadPromises = new Map<string, Promise<string>>()
let avatarLoadGeneration = 0
const isSendingMessage = ref(false)
const isAttachmentDragActive = ref(false)
const attachmentFeedback = ref('')
const attachmentFeedbackIsError = ref(false)
const attachmentDragDepth = new DragDepthTracker()
const hasDesktopWindowControls = !!window.imDesktop?.window
const showMentionPicker = ref(false)
const mentionSearch = ref('')
const mentionSelectedIndex = ref(0)
const showEmojiPanel = ref(false)
const emojiActiveTab = ref<'emoji' | 'sticker'>('emoji')
const emojiActiveGroup = ref(0)
const recentEmojis = ref<string[]>([])
const recentStickers = ref<Sticker[]>([])
const customStickers = ref<Sticker[]>([])
const customStickerError = ref('')
const showMoreDrawer = ref(false)
const showMembersDrawer = ref(false)
const memberDrawerMode = ref<'list' | 'invite' | 'settings' | 'announcement'>('list')
const memberDrawerReturnTarget = ref<'more' | 'members'>('more')
const activeMemberActionsId = ref('')
const memberSearch = ref('')
const memberAddKeyword = ref('')
const memberAddResults = ref<any[]>([])
const groupSettingsName = ref('')
const groupSettingsAnnouncement = ref('')
const groupSettingsSaving = ref(false)
const groupSettingsStatus = ref('')
const groupAvatarInputRef = ref<HTMLInputElement | null>(null)
const selectedGroupAvatar = ref<File | null>(null)
const groupAvatarPreviewUrl = ref('')
const showGroupAvatarPreview = ref(false)
const groupAvatarSaving = ref(false)
const groupAvatarProgress = ref(0)
const groupAvatarStatus = ref('')
const groupAvatarStatusIsError = ref(false)
const chatSearchKeyword = ref('')
const chatSearchResults = ref<Message[]>([])
const showSearchDrawer = ref(false)
const hasSearched = ref(false)
const searchDrawerInputRef = ref<HTMLInputElement | null>(null)
const highlightedMessageId = ref('')
let highlightMessageTimer: ReturnType<typeof setTimeout> | null = null
let loadingOlderMessages = false
let lastMarkedReadMessageId = ''
const currentAttachmentDrafts = computed(() =>
  attachmentDraftStore.draftsFor(chatStore.currentConversation?.conversationId).filter((draft) => !draft.submitted)
)
const transferCenterItems = computed<TransferCenterItem[]>(() => {
  const prepared: TransferCenterItem[] = Object.values(attachmentDraftStore.draftsByConversation).flat()
    .filter((draft) => draft.submitted).map((draft) => ({
      taskId: draft.id, transferId: draft.id, conversationId: draft.conversationId,
      name: draft.name, kind: draft.kind, direction: 'send', status: draft.status,
      progress: draft.progress, transferredBytes: draft.size * draft.progress, totalBytes: draft.size,
      error: draft.error, fileCount: draft.nativeSource?.fileCount ?? draft.folderFiles?.length,
      draft: true,
    }))
  const tasks = [...prepared, ...p2pTransferStore.tasks]
  return tasks.map((item) => ({ ...item,
    conversationName: (() => { const conversation = chatStore.conversations.find((entry) => entry.conversationId === item.conversationId); return conversation ? getConversationName(conversation) : '查看所属会话' })(),
  }))
})

async function handleTransferAction(action: TransferAction, item: TransferCenterItem) {
  const id = item.taskId || item.transferId
  if (transferBusyIds.value.includes(id)) return
  transferBusyIds.value.push(id)
  try {
    if (item.draft) {
      const draft = Object.values(attachmentDraftStore.draftsByConversation).flat().find((entry) => entry.id === id)
      if (!draft) return
      if (action === 'pause') pauseAttachmentDraft(draft)
      else if (action === 'resume') await retryAttachmentDraft(draft)
      else if (action === 'cancel') removeAttachmentDraft(draft)
      return
    }
    if (action === 'pause') await p2pTransferStore.pauseTransfer(id)
    else if (action === 'resume') await p2pTransferStore.resumeTransfer(id)
    else if (action === 'cancel') await p2pTransferStore.cancelTransfer(id)
    else if (action === 'stopSharing') await p2pTransferStore.stopSharing(id)
    else if (action === 'locateSource') await p2pTransferStore.locateSource(id)
    else if (action === 'open') await p2pTransferStore.openCompleted(id)
    else if (action === 'reveal') await p2pTransferStore.revealCompleted(id)
    else if (action === 'locateResult') await p2pTransferStore.locateResult(id)
    else if (action === 'receiveAgain') await p2pTransferStore.receiveAgain(id)
    else if (action === 'changeDestination') await p2pTransferStore.changeDestination(id)
    else if (action === 'retryCleanup') await p2pTransferStore.retryCleanup(id)
  } catch (error) {
    setAttachmentFeedback(error instanceof Error ? error.message : '文件操作失败', true)
  } finally { transferBusyIds.value = transferBusyIds.value.filter((value) => value !== id) }
}

watch(transferCenterItems, (items) => {
  for (const item of items) {
    const key = item.taskId || item.transferId
    const previous = transferNotificationStates.get(key)
    transferNotificationStates.set(key, item.status)
    if (!previous || previous === item.status || !['completed', 'failed'].includes(item.status) || !item.conversationId) continue
    const setting = settingsStore.notification
    const conversation = chatStore.conversations.find((entry) => entry.conversationId === item.conversationId)
    if (isChatForeground() || !setting.desktop || setting.doNotDisturb || setting.mentionOnly || conversation?.muted) continue
    const title = item.status === 'completed' ? '文件传输完成' : '文件传输失败'
    const body = setting.showPreview ? (item.name || '文件') + (item.error ? '：' + item.error : '') : '请打开文件传输中心查看'
    void window.imDesktop?.showMessageNotification?.({ title, body, conversationId: item.conversationId, silent: !setting.sound }).catch(() => false)
  }
}, { deep: true })

const totalUnreadCount = computed(() =>
  Array.from(chatStore.unreadCounts.values()).reduce((sum, count) => sum + count, 0)
)
const selfPresence = computed(() => {
  const userId = String(authStore.currentUser?.userId || '')
  return (userId && userProfileStore.presence[userId]) || manualPresence.value
})
const selfPresenceLabel = computed(() => getPresenceLabel(selfPresence.value))
const ALL_MENTION_MEMBER: ConversationMember = {
  userId: MESSAGE_MENTION_ALL_ID,
  nickname: '所有人',
  role: 'all',
}

const sortedGroupMembers = computed(() => {
  const roleOrder: Record<string, number> = { owner: 0, admin: 1, member: 2 }
  const members = chatStore.currentConversation?.members || []
  return [...members].sort((a, b) => {
    const roleDiff = (roleOrder[a.role || 'member'] ?? 3) - (roleOrder[b.role || 'member'] ?? 3)
    if (roleDiff !== 0) return roleDiff
    return getMemberName(a).localeCompare(getMemberName(b), 'zh-CN')
  })
})

const drawerGroupMembers = computed(() => sortedGroupMembers.value.slice(0, 14))

const memberDrawerTitle = computed(() => {
  if (memberDrawerMode.value === 'invite') return '邀请成员'
  if (memberDrawerMode.value === 'settings') return '群聊资料'
  if (memberDrawerMode.value === 'announcement') return '群公告'
  const count = chatStore.currentConversation?.memberCount ?? sortedGroupMembers.value.length
  return `群聊成员 ${count}`
})

const memberDrawerBackLabel = computed(() =>
  memberDrawerMode.value === 'list' || memberDrawerReturnTarget.value === 'more'
    ? '返回会话设置'
    : '返回群聊成员'
)

const filteredGroupMembers = computed(() => {
  const keyword = memberSearch.value.trim().toLowerCase()
  if (!keyword) return sortedGroupMembers.value
  return sortedGroupMembers.value.filter((member) =>
    getMemberName(member).toLowerCase().includes(keyword)
  )
})

const currentGroupMember = computed(() => {
  const currentUserId = String(authStore.currentUser?.userId ?? '')
  return sortedGroupMembers.value.find((member) => member.userId === currentUserId)
})

const canManageCurrentGroup = computed(() => {
  const role = currentGroupMember.value?.role
  return role === 'owner' || role === 'admin'
})

const isCurrentUserGroupOwner = computed(() => currentGroupMember.value?.role === 'owner')
const canEditCurrentGroupAvatar = computed(() => {
  const conversation = chatStore.currentConversation
  if (!conversation || conversation.type !== 'GROUP') return false
  return conversation.canEditAvatar || isCurrentUserGroupOwner.value
})

function getInitialReadReceipt(conv: Conversation) {
  const recipientCount = Math.max(0, (conv.memberCount || conv.members?.length || 1) - 1)
  return {
    readCount: 0,
    recipientCount,
    readStatus: recipientCount === 0 ? 1 : 0,
  }
}

function getUserId(user: any): string {
  return String(user?.userId || user?.id || '')
}

function getResolvedUser(user: UserProfileSnapshot | null | undefined): UserProfileSnapshot {
  return userProfileStore.resolveProfile(user)
}

function getUserAvatar(user: UserProfileSnapshot | null | undefined): string {
  return getResolvedUser(user).avatar || ''
}

function reconcileDirectoryMembership(profile: UserProfileSnapshot) {
  const userId = getUserId(profile)
  if (!userId) return
  for (const [deptId, users] of Object.entries(deptUsersMap.value)) {
    deptUsersMap.value[deptId] = users.filter((user) => getUserId(user) !== userId)
  }
  if (profile.status === 0 || profile.status === '0') return
  const targetDeptId = profile.deptId ? String(profile.deptId) : UNASSIGNED_DEPT_ID
  if (deptUsersMap.value[targetDeptId]) {
    deptUsersMap.value[targetDeptId] = [...deptUsersMap.value[targetDeptId], profile]
  }
}

function getConversationPeerId(conv: Conversation): string {
  if (conv.type === 'GROUP') return ''
  return conv.members?.find((member) => member.userId !== authStore.currentUser?.userId)?.userId
    || conv.members?.[0]?.userId
    || ''
}

function getConversationName(conv: Conversation): string {
  if (conv.type === 'GROUP') return conv.name
  const profile = userProfileStore.getProfile(getConversationPeerId(conv))
  return profile?.nickname || profile?.username || conv.name
}

function getConversationAvatar(conv: Conversation): string {
  if (conv.type === 'GROUP') return getAuthenticatedAvatarUrl(conv.avatar)
  return userProfileStore.getProfile(getConversationPeerId(conv))?.avatar || conv.avatar
}

function getMessageSenderProfile(message: Message): UserProfileSnapshot {
  return userProfileStore.resolveProfile({
    userId: message.senderId,
    nickname: message.senderName,
    avatar: message.senderAvatar,
    signature: message.senderSignature,
  })
}

function getMessageSenderName(message: Message): string {
  const profile = getMessageSenderProfile(message)
  return profile.nickname || profile.username || message.senderName
}

function getMessageSenderAvatar(message: Message): string {
  return getMessageSenderProfile(message).avatar || message.senderAvatar
}

function getMessageSenderSignature(message: Message): string {
  return getMessageSenderProfile(message).signature || message.senderSignature
}

function getUserPresence(user: any): PresenceStatus {
  const userId = getUserId(user)
  return userProfileStore.getPresence(userId)
}

function isUserOffline(user: any): boolean {
  return getUserPresence(user) === 'offline'
}

function getProfilePresence(user: any): PresenceStatus {
  if (!user) return selfPresence.value
  return getUserPresence(user)
}

function getConversationPresence(conv: Conversation): PresenceStatus {
  if (conv.type === 'GROUP') return 'offline'
  return userProfileStore.getPresence(getConversationPeerId(conv))
}

function isConversationOffline(conv: Conversation): boolean {
  return conv.type === 'SINGLE' && getConversationPresence(conv) === 'offline'
}

function showConversationPresence(conv: Conversation): boolean {
  return conv.type !== 'GROUP' && isPresenceOnline(getConversationPresence(conv))
}

function requestConversationPresence(conversationId?: string) {
  if (!conversationId || !wsManager?.isConnected()) return
  wsManager.send('ONLINE_STATUS', { conversationId })
}

function requestUserPresence(userId?: string) {
  if (!userId || !wsManager?.isConnected()) return
  wsManager.send('ONLINE_STATUS', { userId })
}

function applySelfPresence(status: PresenceStatus) {
  const userId = String(authStore.currentUser?.userId || '')
  if (userId) {
    userProfileStore.setPresence(userId, status)
  }
}

function setManualPresence(status: PresenceStatus) {
  manualPresence.value = status
  autoAway = false
  presenceMenuOpen.value = false
  applySelfPresence(status)
  if (wsManager?.isConnected()) {
    wsManager.send('ONLINE_STATUS', { status })
  }
  resetIdleTimer()
}

function resetIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
  if (manualPresence.value !== 'online') return
  idleTimer = setTimeout(() => {
    autoAway = true
    applySelfPresence('away')
    if (wsManager?.isConnected()) {
      wsManager.send('ONLINE_STATUS', { status: 'away' })
    }
  }, 5 * 60 * 1000)
}

function handleUserActivity() {
  if (manualPresence.value !== 'online') return
  if (autoAway) {
    autoAway = false
    applySelfPresence('online')
    if (wsManager?.isConnected()) {
      wsManager.send('ONLINE_STATUS', { status: 'online' })
    }
  }
  resetIdleTimer()
}

function openOwnProfile() {
  if (!authStore.currentUser) return
  userProfileStore.upsertProfile(authStore.currentUser)
  selectedProfileUserId.value = authStore.currentUser.userId
  selectedProfileFallback.value = authStore.currentUser
  showProfileDialog.value = true
  presenceMenuOpen.value = false
}

function openOwnProfileFromSettings() {
  showSettingsDialog.value = false
  openOwnProfile()
}

async function openUserProfile(user: any) {
  if (getUserId(user) === authStore.currentUser?.userId) {
    openOwnProfile()
    return
  }
  const userId = getUserId(user)
  userProfileStore.seedSnapshot(user)
  selectedProfileUserId.value = userId
  selectedProfileFallback.value = user
  showProfileDialog.value = true
  requestUserPresence(userId)
  try {
    const res = await getUserProfile(userId)
    userProfileStore.upsertProfile(res.data)
  } catch {
    // Conversation/message snapshots remain available when profile lookup fails.
  }
}

function openMessageProfile(message: Message) {
  if (message.senderId === authStore.currentUser?.userId) {
    openOwnProfile()
    return
  }
  openUserProfile({
    userId: message.senderId,
    nickname: message.senderName,
    avatar: message.senderAvatar,
    signature: message.senderSignature,
  })
}

function handleProfileSaved(user: UserInfo) {
  userProfileStore.upsertProfile(user)
  selectedProfileUserId.value = user.userId
  selectedProfileFallback.value = user
}

const mentionCandidates = computed(() => {
  const conv = chatStore.currentConversation
  const currentUserId = String(authStore.currentUser?.userId ?? '')
  if (!conv || conv.type !== 'GROUP') return []
  const keyword = mentionSearch.value.trim().toLowerCase()
  const candidates: ConversationMember[] = []
  if (canManageCurrentGroup.value && matchesAllMentionKeyword(keyword)) {
    candidates.push(ALL_MENTION_MEMBER)
  }
  candidates.push(...sortedGroupMembers.value
    .filter((member) => member.userId !== currentUserId)
    .filter((member) => !keyword || getMemberName(member).toLowerCase().includes(keyword)))
  return candidates.slice(0, 8)
})

function matchesAllMentionKeyword(keyword: string): boolean {
  return !keyword || '所有人'.includes(keyword) || 'all'.includes(keyword)
}

// 切换选中会话：加载消息、请求在线状态、关闭附属面板、滚动到底部
async function handleSelectConv(conv: any) {
  try {
    await chatStore.selectConversation(conv.conversationId)
    requestConversationPresence(conv.conversationId)
    closeMentionPicker()
    closeEmojiPanel()
    showMoreDrawer.value = false
    showMembersDrawer.value = false
    resetChatSearch()
    lastMarkedReadMessageId = ''
    scrollToBottom(true)
    updateUnreadBadge()
  } catch (err: any) {
    alert(err?.response?.data?.message || '加载消息失败')
  }
}

// 从剪贴板提取图片文件（支持 item 和 files 两种读取方式）
function getImageFilesFromClipboard(event: ClipboardEvent): File[] {
  const clipboardData = event.clipboardData
  if (!clipboardData) return []

  const itemFiles = Array.from(clipboardData.items)
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => !!file)

  if (itemFiles.length) return itemFiles

  return Array.from(clipboardData.files).filter((file) => file.type.startsWith('image/'))
}

// 设置附件操作反馈信息
function setAttachmentFeedback(message: string, isError = false) {
  attachmentFeedback.value = message
  attachmentFeedbackIsError.value = isError
}

function p2pAttachmentBlockReason(conversationId = chatStore.currentConversation?.conversationId) {
  const conversation = chatStore.conversations.find((item) => item.conversationId === conversationId)
  if (!conversation) return '请先选择会话'
  if (conversation.type === 'GROUP') return '纯 P2P 第一版暂不支持群文件和文件夹'
  if (!p2pTransferStore.desktopSupported) return 'P2P 文件传输仅支持桌面客户端'
  return ''
}

// 添加附件到当前会话的草稿列表，处理重复和错误；extraMessages 会合并进反馈提示
function addAttachmentFiles(
  files: File[],
  classification: AttachmentDraftClassification = 'auto',
  extraMessages: string[] = [],
  targetConversationId = chatStore.currentConversation?.conversationId,
) {
  const conversationId = targetConversationId
  if (!conversationId || !authStore.currentUser) {
    setAttachmentFeedback('请先选择会话，再添加附件', true)
    return false
  }
  if (!files.length) {
    setAttachmentFeedback('没有检测到可添加的文件', true)
    return false
  }

  if (classification === 'file') {
    const reason = p2pAttachmentBlockReason(conversationId)
    if (reason) {
      setAttachmentFeedback(reason, true)
      return false
    }
  }

  const result = attachmentDraftStore.addFiles(conversationId, files, classification)
  const messages: string[] = [...extraMessages]
  const p2pDrafts = result.added.filter((draft) => draft.kind !== 'image')
  const p2pReason = p2pDrafts.length ? p2pAttachmentBlockReason(conversationId) : ''
  if (p2pReason) {
    p2pDrafts.forEach((draft) => attachmentDraftStore.removeDraft(conversationId, draft.id))
    result.added.splice(0, result.added.length, ...result.added.filter((draft) => draft.kind === 'image'))
    messages.push(p2pReason)
  }
  if (result.duplicateCount) messages.push(`已忽略 ${result.duplicateCount} 个重复项`)
  if (result.errors.length) messages.push(...result.errors)
  setAttachmentFeedback(messages.join('；'), result.errors.length > 0 || !result.added.length)
  return result.added.length > 0
}

function removeAttachmentDraft(draft: AttachmentDraft) {
  p2pTransferStore.discardPreparedDraft(draft.id)
  attachmentDraftStore.removeDraft(draft.conversationId, draft.id)
  void deleteNativeDraftTask(draft)
  setAttachmentFeedback('')
}

function pauseAttachmentDraft(draft: AttachmentDraft) {
  if (!['queued', 'hashing', 'uploading'].includes(draft.status)) return
  attachmentDraftStore.updateDraft(draft.conversationId, draft.id, {
    status: 'paused',
    error: undefined,
  })
  draft.controller?.abort('pause')
}

async function retryAttachmentDraft(draft: AttachmentDraft) {
  if (draft.controller?.signal.aborted) await attachmentQueue.waitFor(draft.id)
  if (!attachmentDraftStore.draftsFor(draft.conversationId).some((item) => item.id === draft.id)) return
  enqueueAttachmentDraft(draft)
}

// 附件拖拽进入：检测文件拖拽，显示拖放提示
function handleAttachmentDragEnter(event: DragEvent) {
  if (!hasFileDragPayload(event.dataTransfer)) return
  event.preventDefault()
  const depth = attachmentDragDepth.enter()
  isAttachmentDragActive.value = true
  if (depth === 1) setAttachmentFeedback('松开以添加到当前会话')
}

// 附件拖拽悬停：允许 drop 操作
function handleAttachmentDragOver(event: DragEvent) {
  if (!hasFileDragPayload(event.dataTransfer)) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

// 附件拖拽离开：深度计数归零时隐藏拖放提示
function handleAttachmentDragLeave(event: DragEvent) {
  if (!isAttachmentDragActive.value) return
  event.preventDefault()
  if (attachmentDragDepth.leave() === 0) {
    isAttachmentDragActive.value = false
    if (attachmentFeedback.value === '松开以添加到当前会话') attachmentFeedback.value = ''
  }
}

// 附件放置：散文件直接添加，文件夹作为整体草稿添加
async function handleAttachmentDrop(event: DragEvent) {
  if (!hasFileDragPayload(event.dataTransfer)) return
  event.preventDefault()
  event.stopPropagation()
  attachmentDragDepth.reset()
  isAttachmentDragActive.value = false
  const conversationId = chatStore.currentConversation?.conversationId
  const accountId = String(authStore.currentUser?.userId || '')
  const generation = attachmentAccountGeneration
  if (!conversationId || !accountId) { setAttachmentFeedback('请先选择会话', true); return }
  const droppedNativeFiles = Array.from(event.dataTransfer?.files || [])
  const directories = droppedDirectoryNames(event.dataTransfer?.items)
  const imageFiles = droppedNativeFiles.filter((file) => !directories.has(file.name) && resolveDraftKind(file, 'auto') === 'image')
  const nativeFiles = droppedNativeFiles.filter((file) => directories.has(file.name) || resolveDraftKind(file, 'auto') !== 'image')
  if (window.imDesktop?.importP2pSources && imageFiles.length) addAttachmentFiles(imageFiles, 'image', [], conversationId)
  if (window.imDesktop?.importP2pSources && imageFiles.length && !nativeFiles.length) return
  if (window.imDesktop?.importP2pSources && nativeFiles.length) {
    const reason = p2pAttachmentBlockReason()
    if (reason) { setAttachmentFeedback(reason, true); return }
    setAttachmentFeedback('正在扫描附件；可继续聊天')
    try {
      const result = await window.imDesktop.importP2pSources(nativeFiles)
      if (chatDisposed || generation !== attachmentAccountGeneration || String(authStore.currentUser?.userId || '') !== accountId) return
      if (!result.canceled) attachmentDraftStore.addNativeSources(conversationId, result.sources)
      if (chatStore.currentConversation?.conversationId === conversationId) setAttachmentFeedback('附件已添加；文件夹将完整发送，最多 2GB/文件、20GB/文件夹、10,000 个文件')
    } catch (error) {
      if (generation === attachmentAccountGeneration) setAttachmentFeedback(error instanceof Error ? error.message : '附件扫描失败，未添加任何文件', true)
    }
    return
  }
  let dropped: Awaited<ReturnType<typeof collectDroppedItems>>
  try { dropped = await collectDroppedItems(event.dataTransfer) } catch (error) {
    if (generation === attachmentAccountGeneration) setAttachmentFeedback(error instanceof Error ? error.message : '文件夹读取失败', true)
    return
  }
  if (chatDisposed || generation !== attachmentAccountGeneration || String(authStore.currentUser?.userId || '') !== accountId) return
  const { files, folders } = dropped
  const notes: string[] = []
  let folderHasError = false
  for (const folder of folders) {
    const result = addAttachmentFolder(folder, conversationId)
    notes.push(...result.messages)
    folderHasError = folderHasError || result.isError
  }
  if (files.length) {
    addAttachmentFiles(files, 'auto', notes, conversationId)
  } else if (notes.length) {
    setAttachmentFeedback(notes.join('；'), folderHasError)
  }
}

// 添加文件夹附件草稿，返回反馈信息（不直接设置，由调用方合并展示）
function addAttachmentFolder(folder: DroppedFolder, conversationId = chatStore.currentConversation?.conversationId) {
  if (!conversationId || !authStore.currentUser) {
    return { messages: ['请先选择会话，再添加附件'], isError: true }
  }
  const reason = p2pAttachmentBlockReason(conversationId)
  if (reason) return { messages: [reason], isError: true }
  const result = attachmentDraftStore.addFolder(conversationId, folder)
  const messages: string[] = []
  if (result.duplicateCount) messages.push(`已忽略重复的文件夹「${folder.name}」`)
  if (result.errors.length) messages.push(...result.errors)
  return { messages, isError: result.errors.length > 0 }
}

function preventWindowFileDrop(event: DragEvent) {
  if (!hasFileDragPayload(event.dataTransfer)) return
  event.preventDefault()
  if (event.type === 'drop') {
    attachmentDragDepth.reset()
    isAttachmentDragActive.value = false
  }
}

function handleWindowDragLeave(event: DragEvent) {
  if (!isAttachmentDragActive.value || event.relatedTarget) return
  attachmentDragDepth.reset()
  isAttachmentDragActive.value = false
  if (attachmentFeedback.value === '松开以添加到当前会话') attachmentFeedback.value = ''
}

function handleMessagePaste(event: ClipboardEvent) {
  const files = getImageFilesFromClipboard(event)
  if (!files.length) return

  event.preventDefault()
  addAttachmentFiles(files, 'image')
  closeMentionPicker()
  closeEmojiPanel()
}

// 切换会话置顶状态
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

// 切换会话免打扰状态
async function toggleMute() {
  const conv = chatStore.currentConversation
  if (!conv) return
  const newMuted = !conv.muted
  try {
    await muteConversation(conv.conversationId, newMuted)
    conv.muted = newMuted
  } catch {
    // ignore
  }
}

// 更多抽屉：切换显示
async function toggleMoreDrawer() {
  showSearchDrawer.value = false
  showMembersDrawer.value = false
  const shouldOpen = !showMoreDrawer.value
  showMoreDrawer.value = shouldOpen
  if (!shouldOpen) return

  const conv = chatStore.currentConversation
  if (!conv) return
  if (conv.type === 'GROUP') {
    await chatStore.refreshConversation(conv.conversationId)
  }
}

// 更多抽屉菜单：打开搜索
function onMoreSearch() {
  showMoreDrawer.value = false
  openSearchDrawer()
}

// 更多抽屉菜单：打开群成员
function onMoreMembers() {
  showMoreDrawer.value = false
  void openMembersDrawer('list')
}

function onMoreInvite() {
  if (!canManageCurrentGroup.value) {
    onMoreMembers()
    return
  }
  showMoreDrawer.value = false
  void openMembersDrawer('invite')
}

function onMoreGroupSettings() {
  if (!canManageCurrentGroup.value) return
  showMoreDrawer.value = false
  void openMembersDrawer('settings')
}

function onMoreAnnouncement() {
  showMoreDrawer.value = false
  void openMembersDrawer('announcement')
}

// 更多抽屉菜单：切换置顶
function onMoreTogglePin() {
  void togglePin()
}

// 更多抽屉菜单：切换免打扰
function onMoreToggleMute() {
  void toggleMute()
}

async function clearCurrentConversationRecords() {
  const conv = chatStore.currentConversation
  if (!conv) return
  if (!window.confirm('确定清除当前设备上的该会话聊天记录吗？服务器保留的历史消息不会被删除。')) return
  chatStore.clearConversationMessages(conv.conversationId)
  p2pTransferStore.discardPreparedConversation(conv.conversationId)
  attachmentDraftStore.clearConversation(conv.conversationId)
  await clearLocalConversationMessages(conv.conversationId)
  showMoreDrawer.value = false
}

function leaveCurrentGroup() {
  if (!currentGroupMember.value) return
  void removeGroupMember(currentGroupMember.value)
}

// 解散群聊（仅群主）
async function disbandCurrentGroup() {
  const conv = chatStore.currentConversation
  if (!conv || conv.type !== 'GROUP') return
  if (!window.confirm('确定解散该群聊吗？所有成员将被移出，聊天记录将被清除。')) return
  try {
    await disbandGroup(conv.conversationId)
    showMoreDrawer.value = false
    showMembersDrawer.value = false
    chatStore.currentConversation = null
    await chatStore.fetchConversations()
  } catch (err: any) {
    alert(err?.response?.data?.message || '解散群聊失败')
  }
}

// 搜索聊天记录（优先本地搜索，回退服务端搜索）
async function runChatSearch() {
  const conv = chatStore.currentConversation
  const keyword = chatSearchKeyword.value.trim()
  if (!conv || !keyword) return
  try {
    if (canUseLocalMessageStore()) {
      chatSearchResults.value = await searchLocalMessages(conv.conversationId, keyword, 20)
    } else {
      const res = await searchServerMessages(conv.conversationId, keyword, 20)
      chatSearchResults.value = res.data.records
    }
    hasSearched.value = true
    showSearchDrawer.value = true
  } catch (err: any) {
    alert(err?.response?.data?.message || '搜索聊天记录失败')
  }
}

// 打开搜索抽屉
function openSearchDrawer() {
  showMoreDrawer.value = false
  showMembersDrawer.value = false
  showSearchDrawer.value = true
  hasSearched.value = false
  chatSearchKeyword.value = ''
  chatSearchResults.value = []
  nextTick(() => searchDrawerInputRef.value?.focus())
}

// 关闭搜索抽屉
// 关闭搜索抽屉，回到更多抽屉
function closeSearchDrawer() {
  showSearchDrawer.value = false
  showMoreDrawer.value = true
}

// 关闭群成员抽屉，回到更多抽屉
function closeMembersDrawer() {
  showMembersDrawer.value = false
  memberDrawerMode.value = 'list'
  memberDrawerReturnTarget.value = 'more'
  activeMemberActionsId.value = ''
  showMoreDrawer.value = true
}

function handleMemberDrawerBack() {
  if (memberDrawerMode.value === 'list' || memberDrawerReturnTarget.value === 'more') {
    closeMembersDrawer()
    return
  }
  memberDrawerReturnTarget.value = 'more'
  setMemberDrawerMode('list')
}

function openMemberSubMode(mode: 'invite' | 'settings') {
  memberDrawerReturnTarget.value = 'members'
  setMemberDrawerMode(mode)
}

function setMemberDrawerMode(mode: 'list' | 'invite' | 'settings' | 'announcement') {
  memberDrawerMode.value = mode
  activeMemberActionsId.value = ''
  if (mode !== 'list') memberSearch.value = ''
  if (mode !== 'invite') {
    memberAddKeyword.value = ''
    memberAddResults.value = []
  }
}

function hasMemberManagementActions(member: ConversationMember) {
  return canUpdateMemberRole(member) || canTransferGroupOwner(member) || canRemoveGroupMember(member)
}

function toggleMemberActions(userId: string) {
  activeMemberActionsId.value = activeMemberActionsId.value === userId ? '' : userId
}

function messageElementId(messageId: string): string {
  return `chat-message-${encodeURIComponent(messageId)}`
}

function clearMessageHighlight() {
  highlightedMessageId.value = ''
  if (highlightMessageTimer) {
    clearTimeout(highlightMessageTimer)
    highlightMessageTimer = null
  }
}

function resetChatSearch() {
  showSearchDrawer.value = false
  chatSearchKeyword.value = ''
  chatSearchResults.value = []
  hasSearched.value = false
  clearMessageHighlight()
}

// 将搜索命中的历史消息合入当前列表，滚动到目标并短暂高亮。
async function jumpToSearchResult(msg: Message) {
  const currentConversationId = chatStore.currentConversation?.conversationId
  if (!msg.messageId || msg.conversationId !== currentConversationId) {
    resetChatSearch()
    return
  }
  chatStore.mergeHistoricalMessage(msg)
  showSearchDrawer.value = false
  highlightedMessageId.value = msg.messageId
  await nextTick()
  document.getElementById(messageElementId(msg.messageId))?.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  })
  if (highlightMessageTimer) clearTimeout(highlightMessageTimer)
  highlightMessageTimer = setTimeout(() => {
    highlightedMessageId.value = ''
    highlightMessageTimer = null
  }, 2400)
}

// 打开群成员抽屉：刷新会话数据、加载群设置
async function openMembersDrawer(
  mode: 'list' | 'invite' | 'settings' | 'announcement' = 'list',
  returnTarget: 'more' | 'members' = 'more',
) {
  const conv = chatStore.currentConversation
  if (!conv || conv.type !== 'GROUP') return
  resetChatSearch()
  showMoreDrawer.value = false
  showMembersDrawer.value = true
  memberDrawerMode.value = mode
  memberDrawerReturnTarget.value = returnTarget
  activeMemberActionsId.value = ''
  memberSearch.value = ''
  memberAddKeyword.value = ''
  memberAddResults.value = []
  groupSettingsStatus.value = ''
  groupAvatarStatus.value = ''
  groupAvatarStatusIsError.value = false
  const refreshed = await chatStore.refreshConversation(conv.conversationId)
  groupSettingsName.value = refreshed?.name || conv.name || ''
  groupSettingsAnnouncement.value = refreshed?.announcement || conv.announcement || ''
}

function openGroupAvatarPicker() {
  if (!canEditCurrentGroupAvatar.value || groupAvatarSaving.value) return
  if (groupAvatarInputRef.value) {
    groupAvatarInputRef.value.value = ''
    groupAvatarInputRef.value.click()
  }
}

function onGroupAvatarSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
  if (!allowedTypes.has(file.type)) {
    groupAvatarStatus.value = '仅支持 JPG、PNG、GIF 和 WebP 图片'
    groupAvatarStatusIsError.value = true
    input.value = ''
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    groupAvatarStatus.value = '群头像图片不能超过 5MB'
    groupAvatarStatusIsError.value = true
    input.value = ''
    return
  }
  clearGroupAvatarSelection()
  selectedGroupAvatar.value = file
  groupAvatarPreviewUrl.value = URL.createObjectURL(file)
  groupAvatarStatus.value = ''
  groupAvatarStatusIsError.value = false
  groupAvatarProgress.value = 0
  showGroupAvatarPreview.value = true
}

function clearGroupAvatarSelection() {
  if (groupAvatarPreviewUrl.value) {
    URL.revokeObjectURL(groupAvatarPreviewUrl.value)
  }
  groupAvatarPreviewUrl.value = ''
  selectedGroupAvatar.value = null
  if (groupAvatarInputRef.value) groupAvatarInputRef.value.value = ''
}

function cancelGroupAvatarPreview() {
  if (groupAvatarSaving.value) return
  showGroupAvatarPreview.value = false
  clearGroupAvatarSelection()
}

async function confirmGroupAvatarUpload() {
  const conv = chatStore.currentConversation
  const file = selectedGroupAvatar.value
  if (!conv || conv.type !== 'GROUP' || !file || !canEditCurrentGroupAvatar.value) return
  let avatarSaved = false
  groupAvatarSaving.value = true
  groupAvatarProgress.value = 0
  groupAvatarStatus.value = ''
  groupAvatarStatusIsError.value = false
  try {
    const res = await uploadGroupAvatar(
      conv.conversationId,
      file,
      (progress) => {
        groupAvatarProgress.value = Math.round(progress * 100)
      },
    )
    chatStore.upsertConversation(res.data)
    avatarSaved = true
    showGroupAvatarPreview.value = false
    clearGroupAvatarSelection()
    const avatarFileId = extractFileDownloadId(res.data.avatar)
    if (avatarFileId) {
      await loadAuthenticatedAvatar(avatarFileId)
    }
    groupAvatarStatus.value = '群头像已更新'
  } catch (err: any) {
    groupAvatarStatus.value = avatarSaved
      ? '群头像已保存，但新头像加载失败，请稍后刷新重试'
      : err?.response?.data?.message || err?.message || '群头像上传失败'
    groupAvatarStatusIsError.value = true
  } finally {
    groupAvatarSaving.value = false
  }
}

async function restoreGroupAvatar() {
  const conv = chatStore.currentConversation
  if (!conv || conv.type !== 'GROUP' || !canEditCurrentGroupAvatar.value || groupAvatarSaving.value) return
  if (!window.confirm('恢复系统默认"群"字头像？')) return
  groupAvatarSaving.value = true
  groupAvatarStatus.value = ''
  groupAvatarStatusIsError.value = false
  try {
    const res = await restoreDefaultGroupAvatar(conv.conversationId)
    chatStore.upsertConversation(res.data)
    groupAvatarStatus.value = '已恢复默认群头像'
  } catch (err: any) {
    groupAvatarStatus.value = err?.response?.data?.message || err?.message || '恢复默认头像失败'
    groupAvatarStatusIsError.value = true
  } finally {
    groupAvatarSaving.value = false
  }
}

function onGroupNameInput(event: Event) {
  groupSettingsName.value = (event.target as HTMLInputElement).value
  groupSettingsStatus.value = ''
}

function onGroupAnnouncementInput(event: Event) {
  groupSettingsAnnouncement.value = (event.target as HTMLTextAreaElement).value
  groupSettingsStatus.value = ''
}

// 保存群资料（群名称；群头像通过独立上传接口保存）
async function saveGroupSettings() {
  const conv = chatStore.currentConversation
  if (!conv || conv.type !== 'GROUP') return
  const name = groupSettingsName.value.trim()
  if (!name) {
    groupSettingsStatus.value = '群名称不能为空'
    return
  }
  groupSettingsSaving.value = true
  groupSettingsStatus.value = ''
  try {
    const res = await updateConversationSettings(conv.conversationId, {
      name,
    })
    chatStore.upsertConversation(res.data)
    groupSettingsName.value = res.data.name
    groupSettingsStatus.value = '群资料已保存'
  } catch (err: any) {
    const message = err?.response?.data?.message || err?.message || ''
    groupSettingsStatus.value = message.includes('No static resource') || err?.response?.status === 404
      ? '保存失败：后端服务未更新或未重启，请重启后端后再试'
      : message || '保存群资料失败'
  } finally {
    groupSettingsSaving.value = false
  }
}

async function saveGroupAnnouncement() {
  const conv = chatStore.currentConversation
  if (!conv || conv.type !== 'GROUP' || !canManageCurrentGroup.value) return
  groupSettingsSaving.value = true
  groupSettingsStatus.value = ''
  try {
    const res = await updateConversationSettings(conv.conversationId, {
      announcement: groupSettingsAnnouncement.value,
    })
    chatStore.upsertConversation(res.data)
    groupSettingsAnnouncement.value = res.data.announcement || ''
    groupSettingsStatus.value = '群公告已保存'
  } catch (err: any) {
    const message = err?.response?.data?.message || err?.message || ''
    groupSettingsStatus.value = message.includes('No static resource') || err?.response?.status === 404
      ? '保存失败：后端服务未更新或未重启，请重启后端后再试'
      : message || '保存群公告失败'
  } finally {
    groupSettingsSaving.value = false
  }
}

// 获取成员显示名称（昵称 > 用户名 > 用户ID）
function getMemberName(member: ConversationMember): string {
  const profile = getResolvedUser(member)
  return profile.nickname || profile.username || `用户${member.userId}`
}

function getUserSignatureTitle(name: string, signature?: string): string {
  return signature ? `${name || '用户'}：${signature}` : name || ''
}

function formatMemberRole(role?: string): string {
  if (role === 'owner') return '群主'
  if (role === 'admin') return '管理员'
  return '成员'
}

function canRemoveGroupMember(member: ConversationMember): boolean {
  const currentUserId = String(authStore.currentUser?.userId ?? '')
  if (!currentUserId) return false
  if (member.role === 'owner') return false
  if (member.userId === currentUserId) return true
  if (isCurrentUserGroupOwner.value) return true
  return currentGroupMember.value?.role === 'admin' && (member.role || 'member') === 'member'
}

function canUpdateMemberRole(member: ConversationMember): boolean {
  const currentUserId = String(authStore.currentUser?.userId ?? '')
  return isCurrentUserGroupOwner.value && member.userId !== currentUserId && member.role !== 'owner'
}

function canTransferGroupOwner(member: ConversationMember): boolean {
  const currentUserId = String(authStore.currentUser?.userId ?? '')
  return isCurrentUserGroupOwner.value
    && member.userId !== currentUserId
    && member.role !== 'owner'
}

// 转让群主
async function transferGroupOwner(member: ConversationMember) {
  const conv = chatStore.currentConversation
  if (!conv || conv.type !== 'GROUP' || !canTransferGroupOwner(member)) return
  const memberName = getMemberName(member)
  if (!window.confirm(`确认将群主转让给"${memberName}"？转让后你将成为普通成员。`)) return
  try {
    const res = await transferConversationOwner(conv.conversationId, member.userId)
    chatStore.upsertConversation(res.data)
    activeMemberActionsId.value = ''
    groupSettingsStatus.value = `群主已转让给 ${memberName}`
  } catch (err: any) {
    groupSettingsStatus.value = err?.response?.data?.message || err?.message || '群主转让失败'
  }
}

async function toggleMemberRole(member: ConversationMember) {
  const conv = chatStore.currentConversation
  if (!conv) return
  const nextRole = member.role === 'admin' ? 'member' : 'admin'
  try {
    const res = await updateMemberRole(conv.conversationId, member.userId, nextRole)
    chatStore.upsertConversation(res.data)
    activeMemberActionsId.value = ''
  } catch (err: any) {
    alert(err?.response?.data?.message || '更新成员角色失败')
  }
}

let addMemberSearchTimer: ReturnType<typeof setTimeout> | null = null

function onSearchAddMember() {
  if (addMemberSearchTimer) clearTimeout(addMemberSearchTimer)
  addMemberSearchTimer = setTimeout(async () => {
    const kw = memberAddKeyword.value.trim()
    if (!kw) {
      memberAddResults.value = []
      return
    }
    try {
      const res = await searchUsers(kw, 1, 20)
      userProfileStore.upsertProfiles(res.data || [])
      const existingIds = new Set(sortedGroupMembers.value.map((member) => member.userId))
      memberAddResults.value = (res.data || []).filter(
        (user: any) => !existingIds.has(String(user.userId || user.id))
      )
    } catch {
      memberAddResults.value = []
    }
  }, 300)
}

async function addGroupMember(user: any) {
  const conv = chatStore.currentConversation
  const userId = String(user.userId || user.id || '')
  if (!conv || !userId) return
  try {
    await addMembers(conv.conversationId, [userId])
    await chatStore.refreshConversation(conv.conversationId)
    memberAddKeyword.value = ''
    memberAddResults.value = []
  } catch (err: any) {
    alert(err?.response?.data?.message || '添加成员失败')
  }
}

// 移除群成员或退出群聊
async function removeGroupMember(member: ConversationMember) {
  const conv = chatStore.currentConversation
  if (!conv) return
  const isSelf = member.userId === String(authStore.currentUser?.userId ?? '')
  const confirmed = window.confirm(isSelf ? '确定退出该群聊吗？' : `确定移除"${getMemberName(member)}"吗？`)
  if (!confirmed) return
  try {
    await removeMember(conv.conversationId, member.userId)
    activeMemberActionsId.value = ''
    if (isSelf) {
      showMembersDrawer.value = false
      showMoreDrawer.value = false
      chatStore.currentConversation = null
      await chatStore.fetchConversations()
      return
    }
    await chatStore.refreshConversation(conv.conversationId)
  } catch (err: any) {
    alert(err?.response?.data?.message || '移除成员失败')
  }
}

// 消息输入事件：检测 @ 触发提及选择器
function onMessageInput(event: Event) {
  draftMentions.value = pruneDraftMentions(conversationDrafts.snapshot(chatStore.currentConversation?.conversationId || ''))
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

function focusMessageInputAtStart() {
  nextTick(() => {
    messageInputRef.value?.focus()
    messageInputRef.value?.setSelectionRange(0, 0)
  })
}

// 消息输入键盘事件：支持附件原子项导航、面板操作与发送快捷键
function handleMessageKeydown(event: KeyboardEvent) {
  const input = event.currentTarget as HTMLTextAreaElement
  const caretAtStart = input.selectionStart === 0 && input.selectionEnd === 0
  const attachments = currentAttachmentDrafts.value
  if (!event.isComposing && caretAtStart && attachments.length && !isSendingMessage.value) {
    if (event.key === 'Backspace') {
      event.preventDefault()
      removeAttachmentDraft(attachments[attachments.length - 1])
      return
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      attachmentDraftTrayRef.value?.focusLast()
      return
    }
  }

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

  const sendShortcut = settingsStore.general.sendShortcut
  const shouldSend =
    sendShortcut === 'ctrlEnter'
      ? event.key === 'Enter' && event.ctrlKey
      : event.key === 'Enter' && !event.shiftKey
  if (shouldSend) {
    event.preventDefault()
    handleSendMessage()
  }
}

// 选中 @ 提及成员：替换输入框中的 @ 文本，记录提及信息
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
    draftMentions.value = [...draftMentions.value, {
      type: member.userId === MESSAGE_MENTION_ALL_ID ? 'all' : 'user',
      userId: member.userId,
      nickname: name,
    }]
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

// 清理草稿中的提及列表：移除文本中不再存在的 @ 提及
function pruneDraftMentions(draft: ConversationDraft): MessageMention[] {
  const text = draft.text
  const seen = new Set<string>()
  return draft.mentions.filter((mention) => {
    if (seen.has(mention.userId)) return false
    seen.add(mention.userId)
    return text.includes(`@${mention.nickname}`)
  })
}

// 将消息文本拆分为普通文本和 @ 提及片段，用于高亮显示
function renderTextSegments(msg: Message) {
  const text = msg.displayContent || msg.content
  const mentions = msg.mentions || []
  if (!mentions.length) return [{ text, mention: false, self: false }]

  const labels = mentions
    .map((mention) => ({
      ...mention,
      label: `@${mention.nickname}`,
      self: isAllMention(mention) || mention.userId === String(authStore.currentUser?.userId ?? ''),
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
  draftMentions.value = pruneDraftMentions(conversationDrafts.snapshot(chatStore.currentConversation?.conversationId || ''))
  closeEmojiPanel()

  nextTick(() => {
    const nextCursor = start + emoji.length
    messageInputRef.value?.focus()
    messageInputRef.value?.setSelectionRange(nextCursor, nextCursor)
  })
}

// 发送贴纸消息
function sendSticker(sticker: Sticker) {
  const conv = chatStore.currentConversation
  if (!conv || !wsManager || !authStore.currentUser) {
    alert('请先选择会话')
    return
  }

  const clientMsgId = generateId()
  const content = buildStickerContent(sticker)
  const localMessage: Message = {
    messageId: '',
    conversationId: conv.conversationId,
    senderId: authStore.currentUser.userId,
    senderName: authStore.currentUser.nickname,
    senderAvatar: authStore.currentUser.avatar || '',
    senderSignature: authStore.currentUser.signature || '',
    messageType: 'STICKER',
    content,
    displayContent: `[表情] ${sticker.name}`,
    mentions: [],
    clientMsgId,
    createdAt: new Date().toISOString(),
    status: 'SENDING',
    ...getInitialReadReceipt(conv),
  }
  chatStore.addMessage(localMessage)
  sendOutgoingMessage(localMessage)
  rememberSticker(sticker)
  closeEmojiPanel()
  scrollToBottom(true)
}

// 从消息内容中解析贴纸信息（支持自定义和内置贴纸）
function getStickerInfo(content: string): Sticker | null {
  const parsed = parseStickerContent(content)
  if (!parsed) return null
  if (parsed.source === 'custom' || parsed.localOnly) {
    return customStickers.value.find((sticker) => sticker.id === parsed.id) || null
  }
  return parsed
}

// 获取图片 URL：通过认证下载后返回 Blob URL，支持缓存和加载中状态
function getImageUrl(content: string): string {
  if (!content) return ''
  let fallback = content
  let fileId = ''
  try {
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === 'object') {
      fallback = typeof parsed.url === 'string' ? parsed.url : ''
      fileId = String(parsed.fileId || '')
    }
  } catch {
    // Existing IMAGE messages are stored as raw URLs.
  }
  if (!fileId) {
    fileId = extractFileDownloadId(fallback)
  }
  if (!fileId) return fallback
  if (!authenticatedImageUrls.value[fileId] && !imageLoadsInProgress.has(fileId)) {
    imageLoadsInProgress.add(fileId)
    const generation = imageLoadGeneration
    void downloadFileBlob(fileId)
      .then((response) => {
        if (generation === imageLoadGeneration) {
          authenticatedImageUrls.value[fileId] = URL.createObjectURL(response.data)
        }
      })
      .catch(() => undefined)
      .finally(() => imageLoadsInProgress.delete(fileId))
  }
  return authenticatedImageUrls.value[fileId] || ''
}

// 群头像属于受保护的会话文件，普通 <img> 请求不会携带 Bearer Token。
// 先通过 Axios 认证下载，再使用 Blob URL 展示，并按文件 ID 复用结果。
function getAuthenticatedAvatarUrl(source: string): string {
  const fileId = extractFileDownloadId(source)
  if (!fileId) return source
  if (!authenticatedAvatarUrls.value[fileId]) {
    void loadAuthenticatedAvatar(fileId).catch(() => undefined)
  }
  return authenticatedAvatarUrls.value[fileId] || ''
}

function loadAuthenticatedAvatar(fileId: string): Promise<string> {
  const cached = authenticatedAvatarUrls.value[fileId]
  if (cached) return Promise.resolve(cached)

  const pending = avatarLoadPromises.get(fileId)
  if (pending) return pending

  const generation = avatarLoadGeneration
  const promise = downloadFileBlob(fileId)
    .then((response) => {
      if (generation !== avatarLoadGeneration) return ''
      const blobUrl = URL.createObjectURL(response.data)
      authenticatedAvatarUrls.value[fileId] = blobUrl
      return blobUrl
    })
    .finally(() => avatarLoadPromises.delete(fileId))

  avatarLoadPromises.set(fileId, promise)
  return promise
}

function getP2pInfo(content: string): P2pAttachmentContent | null {
  return parseP2pAttachmentContent(content)
}

function getP2pState(msg: Message) {
  const info = getP2pInfo(msg.content)
  return info ? p2pTransferStore.stateFor(info.transferId) : undefined
}

function getP2pBubbleItem(msg: Message): TransferCenterItem {
  const info = getP2pInfo(msg.content)
  const state = getP2pState(msg)
  return state || { transferId: info?.transferId || '', direction: msg.senderId === String(authStore.currentUser?.userId || '') ? 'send' : 'receive', status: 'waiting', name: info?.name, kind: info?.kind, totalBytes: info?.totalSize, fileCount: info?.fileCount }
}

function getP2pActionLabel(msg: Message) {
  const item = getP2pBubbleItem(msg)
  if (!p2pTransferStore.desktopSupported) return '仅桌面端可接收'
  if (item.direction === 'send' && !getP2pState(msg)) return '本机无源文件，请重新发送'
  return primaryTransferAction(item)?.label || transferStatusLabel(item)
}

function isP2pPrimaryDisabled(msg: Message) {
  const item = getP2pBubbleItem(msg)
  if (item.direction === 'send' && !getP2pState(msg)) return true
  return !p2pTransferStore.desktopSupported || !primaryTransferAction(item)
}

function canStopSharingP2p(msg: Message) {
  const item = getP2pBubbleItem(msg)
  return !!getP2pState(msg) && item.direction === 'send' && !['STOPPED', 'RECALLED'].includes(item.shareState || '') && !['cancelled', 'stopped', 'recalled'].includes(item.status)
}

function canCancelP2p(msg: Message) {
  const state = getP2pState(msg)
  return !!state && transferActions(state).some((action) => action.value === 'cancel')
}

function canRevealP2p(msg: Message) {
  const mine = msg.senderId === String(authStore.currentUser?.userId || '')
  return !mine && getP2pState(msg)?.status === 'completed'
}

async function handleP2pPrimary(msg: Message) {
  const info = getP2pInfo(msg.content)
  if (!info) return
  const state = getP2pState(msg)
  try {
    if (state) {
      const action = primaryTransferAction(state)
      if (action) await handleTransferAction(action.value, state)
      return
    }
    await p2pTransferStore.receiveAttachment(info, { messageId: msg.messageId, conversationId: msg.conversationId })
  } catch (error) { setAttachmentFeedback(error instanceof Error ? error.message : 'P2P 文件操作失败', true) }
}

async function cancelP2pMessage(msg: Message) {
  const info = getP2pInfo(msg.content)
  if (!info) return
  await p2pTransferStore.cancelTransfer(info.transferId).catch((error) => {
    alert(error instanceof Error ? error.message : '取消 P2P 传输失败')
  })
}

async function revealP2pMessage(msg: Message) {
  const info = getP2pInfo(msg.content)
  if (!info) return
  await p2pTransferStore.revealCompleted(info.transferId).catch((error) => {
    alert(error instanceof Error ? error.message : '无法打开文件所在位置')
  })
}

// 清理所有已认证图片的 Blob URL，切换会话时调用
function clearAuthenticatedImages() {
  imageLoadGeneration += 1
  Object.values(authenticatedImageUrls.value).forEach((url) => URL.revokeObjectURL(url))
  authenticatedImageUrls.value = {}
  imageLoadsInProgress.clear()
}

function clearAuthenticatedAvatars() {
  avatarLoadGeneration += 1
  Object.values(authenticatedAvatarUrls.value).forEach((url) => URL.revokeObjectURL(url))
  authenticatedAvatarUrls.value = {}
  avatarLoadPromises.clear()
}

// 记录最近使用的 Emoji
function rememberEmoji(emoji: string) {
  recentEmojis.value = [emoji, ...recentEmojis.value.filter((item) => item !== emoji)].slice(0, 24)
  localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(recentEmojis.value))
}

// 记录最近使用的贴纸
function rememberSticker(sticker: Sticker) {
  recentStickers.value = [sticker, ...recentStickers.value.filter((item) => item.id !== sticker.id)].slice(0, 12)
  localStorage.setItem(RECENT_STICKERS_KEY, JSON.stringify(recentStickers.value.map((item) => stickerStorageKey(item))))
}

// 从 localStorage 加载最近使用的 Emoji 和贴纸
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
    const storedStickerKeys = JSON.parse(localStorage.getItem(RECENT_STICKERS_KEY) || '[]')
    recentStickers.value = Array.isArray(storedStickerKeys)
      ? storedStickerKeys
          .map((key) => findStickerByStorageKey(String(key)))
          .filter((sticker): sticker is Sticker => !!sticker)
          .slice(0, 12)
      : []
  } catch {
    recentStickers.value = []
  }
}

function clearRecentEmojiState() {
  recentEmojis.value = []
  recentStickers.value = []
}

function stickerStorageKey(sticker: Sticker): string {
  return `${sticker.source === 'custom' || sticker.localOnly ? 'custom' : 'builtin'}:${sticker.id}`
}

function findStickerByStorageKey(key: string): Sticker | undefined {
  const [source, id] = key.includes(':') ? key.split(':', 2) : ['builtin', key]
  return source === 'custom'
    ? customStickers.value.find((sticker) => sticker.id === id)
    : STICKERS.find((sticker) => sticker.id === id)
}

// 将自定义贴纸记录转换为 Sticker 对象（生成 Blob URL）
function toCustomSticker(record: CustomStickerRecord): Sticker {
  return {
    id: record.id,
    name: record.name,
    url: URL.createObjectURL(record.blob),
    source: 'custom',
    localOnly: true,
    mimeType: record.mimeType,
    size: record.size,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

// 释放所有自定义贴纸的 Blob URL
function revokeCustomStickerUrls() {
  for (const sticker of customStickers.value) {
    if (sticker.url?.startsWith('blob:')) {
      URL.revokeObjectURL(sticker.url)
    }
  }
}

// 加载自定义贴纸列表
async function loadCustomStickerState() {
  customStickerError.value = ''
  try {
    const records = await listCustomStickerRecords()
    if (chatDisposed) return
    revokeCustomStickerUrls()
    customStickers.value = records.map(toCustomSticker)
    loadRecentEmojiState()
  } catch (err: any) {
    customStickerError.value = err?.message || '自定义表情加载失败'
  }
}

function pickCustomSticker() {
  customStickerError.value = ''
  customStickerInputRef.value?.click()
}

async function onCustomStickerSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    await addCustomStickerRecord(file)
    await loadCustomStickerState()
  } catch (err: any) {
    customStickerError.value = err?.message || '添加自定义表情失败'
  }
}

async function renameCustomSticker(sticker: Sticker) {
  const nextName = window.prompt('表情名称', sticker.name)
  if (nextName === null) return
  try {
    await renameCustomStickerRecord(sticker.id, nextName)
    await loadCustomStickerState()
  } catch (err: any) {
    customStickerError.value = err?.message || '重命名失败'
  }
}

async function removeCustomSticker(sticker: Sticker) {
  if (!window.confirm(`删除表情"${sticker.name}"？`)) return
  try {
    await deleteCustomStickerRecord(sticker.id)
    recentStickers.value = recentStickers.value.filter((item) => stickerStorageKey(item) !== stickerStorageKey(sticker))
    localStorage.setItem(RECENT_STICKERS_KEY, JSON.stringify(recentStickers.value.map((item) => stickerStorageKey(item))))
    await loadCustomStickerState()
  } catch (err: any) {
    customStickerError.value = err?.message || '删除失败'
  }
}

function handleLocalCacheCleared() {
  chatStore.messages.clear()
  if (chatStore.currentConversation) {
    void chatStore.fetchMessages(chatStore.currentConversation.conversationId)
  }
}

// 处理文档全局点击：关闭在线状态菜单和表情面板
function handleDocumentMouseDown(event: MouseEvent) {
  const target = event.target as Node
  if (presenceMenuOpen.value && !(target instanceof Element && target.closest('.presence-menu, .sidebar-presence-dot'))) {
    presenceMenuOpen.value = false
  }
  if (showEmojiPanel.value) {
    if (emojiPanelRef.value?.contains(target) || emojiButtonRef.value?.contains(target)) {
      return
    }
    closeEmojiPanel()
  }
}

// Scroll
// 判断消息区是否接近底部（用于自动滚动和已读标记）
function isMessageAreaNearBottom() {
  const el = messageAreaRef.value
  if (!el) return false
  return el.scrollHeight - el.scrollTop - el.clientHeight <= 24
}

// 获取当前会话最后一条有 messageId 的消息
function getLastReadableMessageId() {
  const lastMessage = [...chatStore.currentMessages].reverse().find((msg) => !!msg.messageId)
  return lastMessage?.messageId || ''
}

let readInFlight = false
let readRetryTimer: ReturnType<typeof setTimeout> | undefined

function canReadConversation(conversationId: string) {
  return isConversationBeingRead(conversationId, chatStore.currentConversation?.conversationId,
    isMessageAreaNearBottom(), isChatForeground() && !showSettingsDialog.value && !showProfileDialog.value && !previewImage.value)
}

async function markCurrentConversationReadAtBottom() {
  // 只有滚动到底部时才上报已读，避免用户查看旧消息时误清空未读状态。
  const convId = chatStore.currentConversation?.conversationId
  const lastReadMessageId = getLastReadableMessageId()
  if (!convId || !lastReadMessageId || !canReadConversation(convId) || readInFlight || lastMarkedReadMessageId === lastReadMessageId) return
  readInFlight = true
  const read = await chatStore.markAsRead(convId, lastReadMessageId)
  readInFlight = false
  if (read && chatStore.currentConversation?.conversationId === convId) lastMarkedReadMessageId = lastReadMessageId
  updateUnreadBadge()
  // Also handles messages arriving, or conversation switches, while the receipt is in flight.
  if (!chatDisposed) {
    clearTimeout(readRetryTimer)
    readRetryTimer = setTimeout(() => void markCurrentConversationReadAtBottom(), read ? 0 : 5000)
  }
}

// 滚动消息区到底部并标记已读
function scrollToBottom(markRead = false) {
  nextTick(() => {
    const el = messageAreaRef.value
    if (el) {
      el.scrollTop = el.scrollHeight
      if (markRead) {
        markCurrentConversationReadAtBottom()
      }
    }
  })
}

// 消息滚动事件：滚动到顶部加载历史消息，滚动到底部标记已读
async function onMessageScroll() {
  // 顶部触发历史分页，底部触发已读；两者都依赖当前滚动位置而不是额外按钮。
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
  if (isMessageAreaNearBottom()) {
    markCurrentConversationReadAtBottom()
  }
}

// Send message
// 通过 WebSocket 发送消息，发送失败标记 FAILED 状态
function sendOutgoingMessage(msg: Message) {
  return messageSender.send(wsManager, msg)
}

// 重试发送失败的消息
function retryMessage(msg: Message) {
  if (!msg.clientMsgId) return
  sendOutgoingMessage(msg)
}

// 获取消息的回复预览文本
function messageReplyText(msg: Message): string {
  if (msg.status === 'RECALLED') return '消息已撤回'
  if (msg.displayContent) return msg.displayContent
  if (msg.messageType === 'IMAGE') return '[图片]'
  if (msg.messageType === 'FILE') return `[文件] ${getP2pInfo(msg.content)?.name || '旧版附件已停用'}`
  if (msg.messageType === 'FOLDER') return `[文件夹] ${getP2pInfo(msg.content)?.name || '旧版附件已停用'}`
  if (msg.messageType === 'STICKER') return '[表情]'
  if (msg.messageType === 'SHAKE') return '[窗口抖动]'
  return msg.content || ''
}

// 开始回复某条消息
function startReply(msg: Message) {
  if (!msg.messageId || msg.status === 'RECALLED') return
  replyTarget.value = {
    messageId: msg.messageId,
    senderName: msg.senderName,
    text: messageReplyText(msg).slice(0, 80),
  }
  messageInputRef.value?.focus()
}

// 判断当前用户是否可以在 2 分钟内撤回该消息
function canRecallMessage(msg: Message): boolean {
  if (!msg.messageId || msg.status === 'RECALLED' || msg.status === 'FAILED') return false
  if (msg.senderId !== authStore.currentUser?.userId) return false
  const createdAt = new Date(msg.createdAt).getTime()
  return Number.isFinite(createdAt) && Date.now() - createdAt <= 2 * 60 * 1000
}

// 获取消息已读回执文本（群聊显示已读人数，单聊显示已读/未读）
function getReadReceiptText(msg: Message): string {
  const conv = chatStore.currentConversation
  if (!conv || msg.senderId !== authStore.currentUser?.userId) return ''
  if (!msg.messageId || msg.status === 'SENDING' || msg.status === 'FAILED' || msg.status === 'RECALLED') return ''

  const recipientCount = msg.recipientCount || Math.max(0, (conv.memberCount || 1) - 1)
  const readCount = Math.min(recipientCount, msg.readCount || 0)
  if (conv.type === 'GROUP') {
    return `已读 ${readCount}/${recipientCount}`
  }
  return msg.readStatus || readCount >= recipientCount ? '已读' : '未读'
}

// 撤回消息
async function recallCurrentMessage(msg: Message) {
  if (!msg.messageId) return
  try {
    const res = await recallMessage(msg.messageId)
    chatStore.addMessage(res.data)
  } catch (err: any) {
    alert(err?.response?.data?.message || '撤回失败')
  }
}

// 构建并发送文本消息（含 @ 提及和回复）
function sendTextMessage(
  conv: Conversation | null = chatStore.currentConversation,
  user: UserInfo | null = authStore.currentUser,
  draft = conversationDrafts.snapshot(conv?.conversationId || ''),
) {
  const text = draft.text.trim()
  if (!text) return false
  if (!conv || !wsManager || !user || authStore.currentUser?.userId !== user.userId) return false

  const clientMsgId = generateId()
  const mentions = pruneDraftMentions(draft)
  const content = buildTextMessageContent(text, mentions, draft.replyTo)

  const localMessage: Message = {
    messageId: '',
    conversationId: conv.conversationId,
    senderId: user.userId,
    senderName: user.nickname,
    senderAvatar: user.avatar || '',
    senderSignature: user.signature || '',
    messageType: 'TEXT',
    content,
    displayContent: text,
    mentions,
    replyTo: draft.replyTo,
    clientMsgId,
    createdAt: new Date().toISOString(),
    status: 'SENDING',
    ...getInitialReadReceipt(conv),
  }
  chatStore.addMessage(localMessage)
  sendOutgoingMessage(localMessage)

  conversationDrafts.clearIfUnchanged(conv.conversationId, draft)
  closeMentionPicker()
  closeEmojiPanel()
  scrollToBottom(true)
  return true
}

// 提交后附件独立后台准备；文字立即发送，后续输入不受影响。
async function handleSendMessage() {
  if (isSendingMessage.value) return
  const conversation = chatStore.currentConversation
  const user = authStore.currentUser
  if (!conversation || !user) return
  const textDraft = conversationDrafts.snapshot(conversation.conversationId)
  const attachments = [...currentAttachmentDrafts.value]
  if (!textDraft.text.trim() && !attachments.length) return
  isSendingMessage.value = true
  try {
    if (textDraft.text.trim()) sendTextMessage(conversation, user, textDraft)
    for (const draft of attachments) enqueueAttachmentDraft(draft)
    if (attachments.length) setAttachmentFeedback('附件正在后台准备，可在文件传输中心查看')
  } finally { isSendingMessage.value = false }
}

function enqueueAttachmentDraft(draft: AttachmentDraft) {
  const conversation = chatStore.conversations.find((item) => item.conversationId === draft.conversationId)
  const user = authStore.currentUser
  if (!conversation || !user) return
  const generation = attachmentAccountGeneration
  const accountId = String(user.userId)
  attachmentDraftStore.updateDraft(draft.conversationId, draft.id, { submitted: true, status: 'queued', error: undefined })
  const source = draft.nativeSource
  const saved = source && window.imDesktop?.saveP2pTask ? window.imDesktop.saveP2pTask({
    taskId: `draft_${draft.id}`, transferId: `draft_${draft.id}`, draftId: draft.id,
    direction: 'send', sourceId: source.sourceId, conversationId: draft.conversationId,
    messageId: '', status: 'preparing', name: source.name, kind: source.kind,
    totalBytes: source.totalSize, totalSize: source.totalSize, fileCount: source.fileCount,
    directoryCount: source.directoryCount,
  }) : Promise.resolve()
  // Observe immediately even while this job is waiting behind another preparation.
  const persisted = saved.then(() => true, (error) => {
    if (generation === attachmentAccountGeneration) attachmentDraftStore.updateDraft(draft.conversationId, draft.id, {
      status: 'failed', error: error instanceof Error ? `无法保存发送任务：${error.message}` : '无法保存发送任务，请重试',
    })
    return false
  })
  attachmentTaskPersistence.save(draft.id, persisted)
  void attachmentQueue.enqueue(draft.id, async () => {
    if (!await persisted) return false
    if (chatDisposed || generation !== attachmentAccountGeneration || String(authStore.currentUser?.userId) !== accountId) return false
    const existing = attachmentDraftStore.draftsFor(draft.conversationId).find((item) => item.id === draft.id)
    if (!existing || existing.status !== 'queued') return false
    return processAttachmentDraft(existing, { ...conversation }, { ...user })
  })
}

async function deleteNativeDraftTask(draft: AttachmentDraft) {
  if (!draft.nativeSource) return
  const accountId = String(authStore.currentUser?.userId || '')
  const generation = attachmentAccountGeneration
  await attachmentTaskPersistence.remove(draft.id, async () => {
    if (!accountId || String(authStore.currentUser?.userId || '') !== accountId) return
    try {
      await window.imDesktop?.deleteP2pTask?.(`draft_${draft.id}`)
    } catch (error) {
      if (!chatDisposed && generation === attachmentAccountGeneration) setAttachmentFeedback(error instanceof Error ? error.message : '无法更新本地发送任务', true)
    }
  })
}

function restoreAttachmentDraftTasks() {
  for (const task of p2pTransferStore.restoredDrafts) {
    if (!task.sourceId || !task.conversationId || !task.name || !task.kind) continue
    const draftId = task.taskId?.replace(/^draft_/, '')
    if (!draftId) continue
    attachmentDraftStore.restoreNativeDraft(draftId, task.conversationId, {
      sourceId: task.sourceId, kind: task.kind, name: task.name,
      totalSize: task.totalSize ?? 0,
      fileCount: task.fileCount ?? 0, directoryCount: task.directoryCount ?? 0,
    })
  }
}

// 处理单个附件草稿：图片上传媒体服务，FILE/FOLDER 仅走 P2P。
async function processAttachmentDraft(
  draft: AttachmentDraft,
  conversation: Conversation,
  user: UserInfo,
) {
  const controller = new AbortController()
  const generation = attachmentAccountGeneration
  const stillCurrentAccount = () => !chatDisposed && generation === attachmentAccountGeneration && String(authStore.currentUser?.userId) === String(user.userId)
  attachmentDraftStore.updateDraft(conversation.conversationId, draft.id, {
    controller,
    status: draft.kind === 'image' ? 'uploading' : 'hashing',
    progress: 0,
    error: undefined,
  })
  try {
    if (draft.kind === 'image') {
      const response = await uploadConversationImage(
        draft.file,
        conversation.conversationId,
        (progress) => attachmentDraftStore.updateDraft(conversation.conversationId, draft.id, {
          status: 'uploading',
          progress,
        }),
        controller.signal,
      )
      if (!stillCurrentAccount() || controller.signal.aborted) return false
      const image = response.data
      const imageContent = {
        fileId: image.id,
        url: image.url || getFileUrl(image.id),
        fileName: image.originalName || draft.name,
        fileSize: image.size || draft.size,
        contentType: image.contentType || draft.mimeType || 'image/png',
      }
      sendMediaMessage('IMAGE', JSON.stringify(imageContent), '[图片]', conversation, user)
    } else {
      const response = await p2pTransferStore.createOffer(
        draft,
        conversation.conversationId,
        (progress) => attachmentDraftStore.updateDraft(conversation.conversationId, draft.id, {
          status: 'hashing',
          progress,
        }),
        controller.signal,
      )
      if (!stillCurrentAccount() || !attachmentDraftStore.draftsFor(draft.conversationId).some((item) => item.id === draft.id)) return false
      // A pause after offer creation returns the original message and moves its paused task to the center.
      if (controller.signal.aborted && controller.signal.reason !== 'pause') return false
      const p2pMessage = normalizeMessage({
        ...response,
        messageId: String(response.messageId),
        conversationId: String(response.conversationId),
        senderId: user.userId,
        senderName: user.nickname,
        senderAvatar: user.avatar || '',
        senderSignature: user.signature || '',
        status: response.status || 'SENT',
        createdAt: response.createdAt || new Date().toISOString(),
        ...getInitialReadReceipt(conversation),
      })
      chatStore.addMessage(p2pMessage)
      if (chatStore.currentConversation?.conversationId === conversation.conversationId) scrollToBottom(true)
    }
    attachmentDraftStore.removeDraft(conversation.conversationId, draft.id)
    await deleteNativeDraftTask(draft)
    return true
  } catch (error: any) {
    if (!stillCurrentAccount()) return false
    const errorMessage = error?.response?.data?.message || error?.message || '附件发送失败'
    attachmentDraftStore.updateDraft(conversation.conversationId, draft.id, {
      controller: undefined,
      status: controller.signal.aborted ? 'paused' : 'failed',
      error: controller.signal.aborted ? undefined : errorMessage,
    })
    if (chatStore.currentConversation?.conversationId === conversation.conversationId) setAttachmentFeedback(
      controller.signal.aborted ? `${draft.name} 已暂停` : `${draft.name}：${errorMessage}`,
      !controller.signal.aborted,
    )
    return false
  }
}

function handleSendText() {
  void handleSendMessage()
}

// 窗口抖动（振屏）：发送 SHAKE 类型消息，收发双方窗口都会抖动
const SHAKE_COOLDOWN_MS = 3000 // 发送冷却，避免连续抖动刷屏
const SHAKE_ANIMATION_MS = 600 // CSS 抖动动画时长
let lastShakeSentAt = 0
const isWindowShaking = ref(false)
let windowShakeTimer: ReturnType<typeof setTimeout> | null = null

// 触发本端窗口抖动：桌面端通过主进程物理移动窗口，同时页面内容做 CSS 抖动
function triggerWindowShake() {
  if (window.imDesktop?.window?.shake) {
    void window.imDesktop.window.shake()
  }
  if (windowShakeTimer) clearTimeout(windowShakeTimer)
  isWindowShaking.value = false
  // 强制重启动画：先移除 class，下一帧再加回
  requestAnimationFrame(() => {
    isWindowShaking.value = true
    windowShakeTimer = setTimeout(() => {
      isWindowShaking.value = false
      windowShakeTimer = null
    }, SHAKE_ANIMATION_MS)
  })
}

// 发送窗口抖动消息
function sendShakeMessage() {
  const conv = chatStore.currentConversation
  const user = authStore.currentUser
  if (!conv || !user || isSendingMessage.value) return
  const now = Date.now()
  if (now - lastShakeSentAt < SHAKE_COOLDOWN_MS) return
  lastShakeSentAt = now

  const clientMsgId = generateId()
  const localMessage: Message = {
    messageId: '',
    conversationId: conv.conversationId,
    senderId: user.userId,
    senderName: user.nickname,
    senderAvatar: user.avatar || '',
    senderSignature: user.signature || '',
    messageType: 'SHAKE',
    content: '[窗口抖动]',
    displayContent: '[窗口抖动]',
    mentions: [],
    clientMsgId,
    createdAt: new Date().toISOString(),
    status: 'SENDING',
    ...getInitialReadReceipt(conv),
  }
  chatStore.addMessage(localMessage)
  sendOutgoingMessage(localMessage)
  closeEmojiPanel()
  scrollToBottom(true)
  triggerWindowShake()
}

function activateFileLabel(event: KeyboardEvent) {
  if (isSendingMessage.value) return
  ;(event.currentTarget as HTMLElement | null)?.click()
}

function guardP2pPicker(event: Event) {
  const reason = p2pAttachmentBlockReason()
  if (reason) { event.preventDefault(); setAttachmentFeedback(reason, true); return }
  if (window.imDesktop?.pickP2pSources) {
    event.preventDefault()
    const label = event.currentTarget as HTMLElement
    void pickNativeAttachments(label.querySelector('[webkitdirectory]') ? 'folder' : 'file')
  }
}

async function pickNativeAttachments(kind: 'file' | 'folder') {
  const conversationId = chatStore.currentConversation?.conversationId
  const accountId = String(authStore.currentUser?.userId || '')
  const generation = attachmentAccountGeneration
  if (!conversationId || !accountId || !window.imDesktop?.pickP2pSources) return
  setAttachmentFeedback('正在选择和扫描附件；可继续聊天')
  try {
    const result = await window.imDesktop.pickP2pSources(kind)
    if (chatDisposed || generation !== attachmentAccountGeneration || String(authStore.currentUser?.userId || '') !== accountId) return
    if (!result.canceled) attachmentDraftStore.addNativeSources(conversationId, result.sources)
    if (chatStore.currentConversation?.conversationId === conversationId) setAttachmentFeedback(result.canceled ? '' : '附件已添加；单文件上限 2GB，文件夹上限 20GB / 10,000 个文件，超过限制将整项停止')
  } catch (error) {
    if (generation === attachmentAccountGeneration) setAttachmentFeedback(error instanceof Error ? error.message : '附件读取失败，未添加任何文件', true)
  }
}

function onSendImage(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (files.length) addAttachmentFiles(files, 'image')
  input.value = ''
}

function onSendFile(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (files.length) addAttachmentFiles(files, 'file')
  input.value = ''
}

function onSendFolder(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (files.length) {
    const firstPath = files[0].webkitRelativePath || files[0].name
    const folderName = firstPath.replace(/\\/g, '/').split('/')[0] || 'folder'
    const result = addAttachmentFolder({
      name: folderName,
      directories: [],
      files: files.map((file) => ({
        path: file.webkitRelativePath || file.name,
        file,
      })),
    })
    setAttachmentFeedback(result.messages.join('；'), result.isError)
  }
  input.value = ''
}

// 构建并发送图片/文件/文件夹消息
function sendMediaMessage(
  type: 'IMAGE' | 'FILE' | 'FOLDER',
  content: string,
  displayContent = content,
  conv = chatStore.currentConversation,
  user: UserInfo | null = authStore.currentUser,
) {
  if (!conv || !user) return

  const clientMsgId = generateId()
  const localMessage: Message = {
    messageId: '',
    conversationId: conv.conversationId,
    senderId: user.userId,
    senderName: user.nickname,
    senderAvatar: user.avatar || '',
    senderSignature: user.signature || '',
    messageType: type,
    content,
    displayContent,
    mentions: [],
    clientMsgId,
    createdAt: new Date().toISOString(),
    status: 'SENDING',
    ...getInitialReadReceipt(conv),
  }
  chatStore.addMessage(localMessage)
  sendOutgoingMessage(localMessage)
  if (chatStore.currentConversation?.conversationId === conv.conversationId) scrollToBottom(true)
}

// WebSocket message handler
// WebSocket 消息分发处理：接收消息、更新消息、会话变更、ACK、已读回执、在线状态、用户更新
async function handleWsMessage(msg: WsMessage) {
  switch (msg.cmd) {
    case 'MESSAGE_RECEIVE': {
      // Incoming messages update conversation state, ACK delivery, optionally notify, then only auto-scroll if user was at bottom.
      const data = msg.data
      const receivedMessage = normalizeMessage({
        ...data,
        createdAt:
          data.createdAt ||
          data.createTime ||
          (data.timestamp ? new Date(Number(data.timestamp)).toISOString() : undefined),
      })
      const isCurrentConversation =
        chatStore.currentConversation?.conversationId === receivedMessage.conversationId
      const wasAtBottom = isCurrentConversation && isMessageAreaNearBottom()
      const wasBeingRead = canReadConversation(receivedMessage.conversationId)
      const duplicate = chatStore.messages.get(receivedMessage.conversationId)?.some((item) => item.messageId === receivedMessage.messageId)
      const receivingUserId = String(authStore.currentUser?.userId ?? '')
      const conv = await chatStore.receiveMessage(
        receivedMessage,
        receivingUserId,
        !wasBeingRead
      )
      if (chatDisposed || authStore.currentUser?.userId !== receivingUserId) return
      if (!conv) {
        alert('收到新消息，但会话信息加载失败，请刷新后重试')
      }
      if (receivedMessage.messageId) {
        try {
          await upsertLocalMessage(receivedMessage, receivingUserId, true)
          if (!chatDisposed && authStore.currentUser?.userId === receivingUserId) {
            wsManager?.send('MESSAGE_ACK', { messageId: receivedMessage.messageId })
          }
        } catch (error) {
          console.warn('消息尚未保存，将重新同步', error)
        }
      }
      if (chatDisposed || authStore.currentUser?.userId !== receivingUserId) return
      if (!duplicate && receivedMessage.senderId !== receivingUserId && conv && shouldNotifyMessage(receivedMessage, conv, wasBeingRead)) {
        const body = settingsStore.notification.showPreview
          ? receivedMessage.displayContent || receivedMessage.content
          : '收到一条新消息'
        showDesktopNotification(getConversationName(conv) || getMessageSenderName(receivedMessage), body, receivedMessage.conversationId)
      }
      if (chatStore.currentConversation?.conversationId === receivedMessage.conversationId && wasAtBottom) {
        scrollToBottom(true)
      }
      // 收到他人发来的窗口抖动消息时抖动本端窗口
      if (
        receivedMessage.messageType === 'SHAKE' &&
        receivedMessage.senderId !== String(authStore.currentUser?.userId ?? '')
      ) {
        triggerWindowShake()
      }
      updateUnreadBadge()
      break
    }
    case 'MESSAGE_UPDATED': {
      if (msg.data) {
        chatStore.upsertMessage(normalizeMessage(msg.data))
      }
      break
    }
    case 'CONVERSATION_CREATED':
    case 'CONVERSATION_UPDATED': {
      if (msg.data) {
        chatStore.upsertConversation(normalizeConversation(msg.data))
        updateUnreadBadge()
      }
      break
    }
    case 'MESSAGE_ACK': {
      const data = msg.data
      if (data?.clientMsgId && data.messageId && data.ok !== false && data.status !== 'FAILED') {
        chatStore.updateMessageStatus(data.clientMsgId, data.messageId, data.status)
      }
      break
    }
    case 'MESSAGE_READ': {
      // Read receipts may arrive as aggregated receipts or a boundary; support both backend payload shapes.
      const data = msg.data
      if (data?.conversationId && data?.readerId) {
        const convId = String(data.conversationId)
        if (Array.isArray(data.receipts)) {
          chatStore.applyReadReceipts(
            convId,
            data.receipts.map((receipt: any) => ({
              messageId: String(receipt.messageId ?? ''),
              readCount: Number(receipt.readCount || 0),
              recipientCount: Number(receipt.recipientCount || 0),
              readStatus: receipt.readStatus === true ? 1 : Number(receipt.readStatus || 0),
              readTime: receipt.readTime || undefined,
            })).filter((receipt: any) => !!receipt.messageId),
          )
        } else {
          chatStore.applyReadReceipt(
            convId,
            String(data.readerId),
            data.lastReadMessageId ? String(data.lastReadMessageId) : undefined,
            data.readTime || undefined,
            Array.isArray(data.readMessageIds) ? data.readMessageIds.map((id: unknown) => String(id)) : undefined,
          )
        }
      }
      break
    }
    case 'MESSAGE_SEND_REPLY': {
      // Server may also send reply for a send
      const data = msg.data
      if (data?.clientMsgId && data.messageId && data.ok !== false && data.status !== 'FAILED') {
        chatStore.updateMessageStatus(data.clientMsgId, data.messageId, data.status)
      }
      break
    }
    case 'ONLINE_STATUS': {
      const data = msg.data
      if (data && typeof data === 'object') {
        if (data.userId !== undefined) {
          const status = data.status !== undefined
            ? normalizePresenceStatus(data.status)
            : (data.online ? 'online' : 'offline')
          userProfileStore.setPresence(String(data.userId), status)
        } else {
          for (const [uid, payload] of Object.entries(data)) {
            if (payload && typeof payload === 'object') {
              const statusPayload = payload as { status?: unknown; online?: unknown }
              userProfileStore.setPresence(uid, statusPayload.status !== undefined
                ? statusPayload.status
                : (statusPayload.online ? 'online' : 'offline'))
            } else {
              userProfileStore.setPresence(uid, payload ? 'online' : 'offline')
            }
          }
        }
      }
      break
    }
    case 'USER_UPDATED': {
      if (msg.data) {
        const updated = userProfileStore.upsertProfile(msg.data)
        if (updated) reconcileDirectoryMembership(updated)
        if (updated && updated.userId === authStore.currentUser?.userId) {
          authStore.updateCurrentUser(updated)
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

// 初始化 WebSocket 连接：登录后建立连接、上报在线状态、拉取会话和消息
let chatDisposed = false
let syncGeneration = 0
let pendingSyncTimer: ReturnType<typeof setTimeout> | undefined

async function syncConnectedMessages(manager: WebSocketManager, epoch: number) {
  const current = () => !chatDisposed && wsManager === manager && manager.isConnected() && epoch === syncGeneration
  let retryDelay = 30000
  try {
    await chatStore.fetchPendingMessages()
    if (!current()) return
    await chatStore.fetchConversations()
    if (!current()) return
    const conversationId = chatStore.currentConversation?.conversationId
    if (conversationId) {
      const atBottom = isMessageAreaNearBottom()
      await chatStore.fetchMessages(conversationId)
      if (!current()) return
      if (chatStore.currentConversation?.conversationId === conversationId && atBottom) scrollToBottom(true)
    }
    updateUnreadBadge()
  } catch (error) {
    retryDelay = 5000
    console.warn('消息同步未完成，将自动重试', error)
  } finally {
    if (current()) pendingSyncTimer = setTimeout(() => void syncConnectedMessages(manager, epoch), retryDelay)
  }
}

function initWebSocket() {
  // Reinitialization tears down stale managers first so login changes and reconnects cannot reuse old user state.
  if (!authStore.isLoggedIn) return
  if (wsManager) {
    p2pTransferStore.attachSocket(null)
    wsManager.disconnect()
  }
  if (!authStore.token) return
  wsManager = new WebSocketManager(createWebSocketTicket, handleWsMessage, (connected) => {
    wsConnected.value = connected
    clearTimeout(pendingSyncTimer)
    const epoch = ++syncGeneration
    if (connected) {
      const currentConvId = chatStore.currentConversation?.conversationId
      applySelfPresence(manualPresence.value)
      wsManager?.send('ONLINE_STATUS', { status: manualPresence.value })
      void syncConnectedMessages(wsManager!, epoch).then(() => {
        // 批量刷新所有单聊会话的在线状态：
        // 服务端仅在状态变化时广播，登录前已在线/断连期间下线的联系人状态需主动查询，
        // 否则会话列表长期显示过期或缺失的在线状态
        for (const conv of chatStore.conversations) {
          if (conv.type === 'SINGLE') {
            requestConversationPresence(conv.conversationId)
          }
        }
      }).catch(() => {})
      updateUnreadBadge()
      if (currentConvId) {
        requestConversationPresence(currentConvId)
        void p2pTransferStore.refreshPeerStatus(currentConvId)
      }
    }
  })
  p2pTransferStore.attachSocket(wsManager)
  wsManager.connect()
}

// 判断是否应该弹出桌面通知（免打扰、静音、仅 @ 我等条件判断）
function shouldNotifyMessage(message: Message, conversation: Conversation, wasBeingRead = false) {
  const notification = settingsStore.notification
  if (conversation.muted || notification.doNotDisturb || !notification.desktop) return false
  // Rendering the new bubble can move the scroll boundary before the scheduled auto-scroll.
  if (canReadConversation(message.conversationId) || (wasBeingRead && isChatForeground()
    && chatStore.currentConversation?.conversationId === message.conversationId)) return false
  if (notification.mentionOnly && !messageMentionsCurrentUser(message)) return false
  return true
}

function messageMentionsCurrentUser(message: Message) {
  const currentUserId = String(authStore.currentUser?.userId ?? '')
  if (!currentUserId) return false
  return message.mentions.some((mention) => mention.userId === currentUserId || isAllMention(mention))
}

// 通过 Electron 主进程显示桌面通知。
async function showDesktopNotification(title: string, body: string, conversationId: string) {
  await window.imDesktop?.showMessageNotification?.({ title, body, conversationId }).catch(() => false)
}

// 创建群聊弹窗
const showCreateGroupDialog = ref(false)

async function handleGroupCreated(conversation: Conversation) {
  showCreateGroupDialog.value = false
  chatStore.upsertConversation(conversation)
  activeTab.value = 'chat'
  await chatStore.selectConversation(conversation.conversationId)
  await nextTick()
  messageInputRef.value?.focus()
  scrollToBottom(true)
}

// 通讯录双击联系人：创建（或复用）与该用户的单聊会话并跳转过去。
async function startSingleChat(user: any) {
  const targetUserId = getUserId(user)
  if (!targetUserId || targetUserId === String(authStore.currentUser?.userId ?? '')) return
  try {
    const existing = chatStore.conversations.find(
      (conv) => conv.type !== 'GROUP' && getConversationPeerId(conv) === targetUserId,
    )
    const conversation = existing || (await createConversation({ type: 'SINGLE', targetUserId })).data
    chatStore.upsertConversation(conversation)
    activeTab.value = 'chat'
    await chatStore.selectConversation(conversation.conversationId)
    await nextTick()
    messageInputRef.value?.focus()
    scrollToBottom(true)
  } catch (err: any) {
    alert(err?.response?.data?.message || '创建会话失败')
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
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)}MB`
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)}GB`
}

function updateUnreadBadge() {
  if (!window.imDesktop?.setUnreadBadge) return
  window.imDesktop.setUnreadBadge(totalUnreadCount.value).catch(() => {
    // Badge support varies by platform; unread state remains in the renderer.
  })
}

// 通过通知点击跳转到指定会话
async function openConversationFromNotification(conversationId: string) {
  if (!conversationId) return
  activeTab.value = 'chat'
  let conv: Conversation | null | undefined = chatStore.conversations.find((item) => item.conversationId === conversationId)
  if (!conv) {
    conv = await chatStore.refreshConversation(conversationId)
  }
  if (conv) {
    await handleSelectConv(conv)
  }
}

// 退出登录：断开 WebSocket、清除未读标记、清空聊天状态、跳转到登录页
async function handleLogout() {
  await conversationDrafts.flush()
  attachmentAccountGeneration++
  attachmentQueue.clear()
  attachmentDraftStore.clearAll()
  await Promise.allSettled(attachmentTaskPersistence.pending())
  messageSender.dispose()
  wsManager?.disconnect()
  await p2pTransferStore.dispose()
  if (window.imDesktop?.setUnreadBadge) {
    await window.imDesktop.setUnreadBadge(0).catch(() => false)
  }
  await authStore.logout()
  settingsStore.resetLocal()
  chatStore.reset()
  router.push('/login')
}

// 桌面常用快捷键：Ctrl+, 打开设置。
function handleGlobalShortcut(event: KeyboardEvent) {
  if (event.repeat) return
  if (event.ctrlKey && !event.altKey && !event.shiftKey && event.key === ',') {
    event.preventDefault()
    showSettingsDialog.value = true
    return
  }
}

// 组件挂载：加载贴纸、注册全局事件、初始化认证、加载设置和数据、启动 WebSocket
onMounted(async () => {
  window.addEventListener('focus', handleChatVisibility)
  document.addEventListener('visibilitychange', handleChatVisibility)
  await loadCustomStickerState()
  if (chatDisposed) return
  document.addEventListener('mousedown', handleDocumentMouseDown)
  window.addEventListener('mousemove', handleUserActivity)
  window.addEventListener('keydown', handleUserActivity)
  window.addEventListener('keydown', handleGlobalShortcut)
  window.addEventListener('dragover', preventWindowFileDrop)
  window.addEventListener('drop', preventWindowFileDrop)
  window.addEventListener('dragleave', handleWindowDragLeave)
  resetIdleTimer()
  removeNotificationOpenListener = window.imDesktop?.onNotificationOpenConversation?.((conversationId) => {
    void openConversationFromNotification(conversationId)
  }) || null
  // 路由进入前已完成统一的 Session Restore，避免再次验证导致重复初始化。
  if (authStore.isLoggedIn) {
    try {
      await settingsStore.load()
    } catch {
      // Settings can be retried from the dialog if the backend is temporarily unavailable.
    }
    if (chatDisposed) return
    if (window.imDesktop?.setCloseBehavior) {
      await window.imDesktop.setCloseBehavior(settingsStore.general.closeBehavior).catch(() => false)
    }
    if (chatDisposed) return
    await loadInitialChatData()
    if (chatDisposed) return
    applySelfPresence(manualPresence.value)
    updateUnreadBadge()
    try {
      await p2pTransferStore.restoreAccount(String(authStore.currentUser?.userId || ''))
      if (!chatDisposed) restoreAttachmentDraftTasks()
    } catch (error) {
      if (!chatDisposed) setAttachmentFeedback(error instanceof Error ? `本地传输任务恢复失败：${error.message}` : '本地传输任务恢复失败', true)
    }
    if (chatDisposed) return
    initWebSocket()
  }

})

// 组件卸载：清理事件监听、定时器、附件、图片缓存、文件下载、贴纸 URL、WebSocket
onUnmounted(() => {
  chatDisposed = true
  attachmentAccountGeneration++
  attachmentQueue.clear()
  transferNotificationStates.clear()
  syncGeneration++
  clearTimeout(pendingSyncTimer)
  clearTimeout(readRetryTimer)
  messageSender.dispose()
  chatStore.cancelPendingSync()
  window.removeEventListener('focus', handleChatVisibility)
  document.removeEventListener('visibilitychange', handleChatVisibility)
  clearMessageHighlight()
  document.removeEventListener('mousedown', handleDocumentMouseDown)
  window.removeEventListener('mousemove', handleUserActivity)
  window.removeEventListener('keydown', handleUserActivity)
  window.removeEventListener('keydown', handleGlobalShortcut)
  window.removeEventListener('dragover', preventWindowFileDrop)
  window.removeEventListener('drop', preventWindowFileDrop)
  window.removeEventListener('dragleave', handleWindowDragLeave)
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
  removeNotificationOpenListener?.()
  removeNotificationOpenListener = null
  attachmentDraftStore.clearAll()
  clearAuthenticatedImages()
  clearAuthenticatedAvatars()
  revokeCustomStickerUrls()
  clearGroupAvatarSelection()
  void p2pTransferStore.dispose(attachmentTaskPersistence.pending())
  wsManager?.disconnect()
})

// 监听会话切换：重置相关状态、清理图片缓存、关闭面板
watch(
  () => chatStore.currentConversation?.conversationId,
  (conversationId) => {
    lastMarkedReadMessageId = ''
    showMoreDrawer.value = false
    showMembersDrawer.value = false
    memberDrawerMode.value = 'list'
    memberDrawerReturnTarget.value = 'more'
    activeMemberActionsId.value = ''
    memberSearch.value = ''
    memberAddKeyword.value = ''
    memberAddResults.value = []
    showGroupAvatarPreview.value = false
    clearGroupAvatarSelection()
    attachmentDragDepth.reset()
    isAttachmentDragActive.value = false
    attachmentFeedback.value = ''
    clearAuthenticatedImages()
    closeMentionPicker()
    closeEmojiPanel()
    resetChatSearch()
    const conversation = chatStore.currentConversation
    if (conversationId && conversation?.type === 'SINGLE') {
      void p2pTransferStore.refreshPeerStatus(conversationId)
    }
  }
)

// 监听登录状态变化：登录时初始化数据，登出时清理
watch(
  () => authStore.isLoggedIn,
  (val) => {
    if (!val) {
      attachmentAccountGeneration++
      attachmentQueue.clear()
      transferNotificationStates.clear()
      messageSender.dispose()
      wsManager?.disconnect()
      chatStore.cancelPendingSync()
      attachmentDraftStore.clearAll()
      settingsStore.resetLocal()
      updateUnreadBadge()
    }
  }
)

function handleChatVisibility() {
  if (isChatForeground()) void nextTick(() => markCurrentConversationReadAtBottom())
}

watch([showSettingsDialog, showProfileDialog, previewImage], handleChatVisibility)

// 监听未读消息总数变化，更新系统托盘角标
watch(totalUnreadCount, () => {
  updateUnreadBadge()
})

// 监听关闭行为设置变化，同步到桌面 bridge
watch(
  () => settingsStore.general.closeBehavior,
  (behavior) => {
    if (window.imDesktop?.setCloseBehavior) {
      window.imDesktop.setCloseBehavior(behavior).catch(() => false)
    }
  }
)
</script>

<style scoped>
.p2p-error { color: var(--danger-strong); white-space: normal; overflow-wrap: anywhere; }

.chat-layout {
  display: flex;
  height: 100%;
  width: 100%;
  background: var(--bg-app);
  overflow: hidden;
}

.chat-layout.desktop-window {
  padding-top: 36px;
}

/* Left Sidebar */
.left-sidebar {
  width: 60px;
  min-width: 60px;
  background: var(--bg-sidebar);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 18px 0;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 9px;
}

.nav-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 9px 4px 8px;
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
  color: #9ba7bd;
  transition: background-color var(--transition-normal), color var(--transition-normal);
  gap: 5px;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.nav-item.active {
  background: rgba(112, 126, 240, 0.24);
  color: #fff;
}

.nav-icon {
  width: 21px;
  height: 21px;
  filter: invert(1);
  opacity: 0.68;
}

.nav-item:hover .nav-icon,
.nav-item.active .nav-icon {
  opacity: 1;
}

.nav-label {
  font-size: 11px;
  line-height: 1;
}

.sidebar-footer {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 0 9px;
}

.user-avatar-sidebar {
  position: relative;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: var(--accent-avatar);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: var(--font-md);
  cursor: pointer;
  margin: 0 auto 12px;
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.08);
}

.user-avatar-sidebar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.user-avatar-sidebar:hover {
  box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.34);
}

.sidebar-presence-dot {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 12px;
  height: 12px;
  border: 2px solid var(--bg-sidebar);
  border-radius: 50%;
  cursor: pointer;
  z-index: 1;
}

.sidebar-presence-dot:hover {
  transform: scale(1.2);
}

.presence-menu {
  position: absolute;
  left: 46px;
  top: 0;
  z-index: 50;
  width: 132px;
  padding: 6px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  box-shadow: var(--shadow-lg);
}

.presence-menu button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font-size: var(--font-base);
  padding: 7px 8px;
  text-align: left;
}

.presence-menu button:hover,
.presence-menu button.active {
  background: var(--accent-bg-light);
}

.presence-dot-inline {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.settings-btn {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.settings-btn img {
  width: 18px;
  height: 18px;
  filter: invert(1);
  opacity: 0.68;
}

.settings-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.settings-btn:hover img {
  opacity: 1;
}

/* Middle Panel */
.middle-panel {
  width: 250px;
  min-width: 250px;
  background: var(--bg-panel);
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-light);
  border-top: 1px solid var(--border-subtle);
  border-bottom: 1px solid var(--border-subtle);
  border-radius: 0;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 64px;
  padding: 18px 20px 12px;
  background: var(--bg-panel);
}

.panel-title {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.new-chat-btn {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--accent-bg-light);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-secondary);
}

.new-chat-btn img {
  width: 18px;
  height: 18px;
}

.new-chat-btn:hover {
  background: var(--accent-bg-active);
}

.search-bar {
  padding: 0 16px 14px;
}

.search-input {
  width: 100%;
  height: 40px;
  padding: 0 13px;
  border: 1px solid transparent;
  border-radius: 11px;
  background: var(--bg-input-rest);
  font-size: var(--font-base);
  color: var(--text-primary);
  transition: background-color var(--transition-normal), border-color var(--transition-normal), box-shadow var(--transition-normal);
}

.search-input::placeholder {
  color: var(--text-tertiary);
}

.search-input:focus {
  background: var(--bg-surface);
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent);
}

.conversation-list,
.contacts-list {
  flex: 1;
  overflow-y: auto;
}

.list-section-label {
  padding: 9px 20px 6px;
  font-weight: 600;
  letter-spacing: 0.05em;
  font-size: var(--font-sm);
  color: var(--text-tertiary);
}

.conv-item {
  display: flex;
  align-items: center;
  margin: 2px 8px;
  padding: 11px 12px;
  border-radius: 12px;
  cursor: pointer;
  transition: background var(--transition-fast);
  position: relative;
  gap: 10px;
}

.conv-item:hover {
  background: var(--bg-hover-light);
}

.conv-item.active {
  background: var(--accent-bg-active);
  box-shadow: inset 3px 0 0 var(--accent);
}

.pin-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.conv-avatar {
  width: 40px;
  height: 40px;
  min-width: 40px;
  border-radius: 50%;
  background: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: var(--font-lg);
  /* 不在容器上 overflow: hidden，否则会裁掉右下角的状态圆点；圆形裁剪由 img 自身承担 */
  position: relative;
}

.conv-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.online-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  background: var(--presence-offline);
  border: 2px solid #fff;
  border-radius: 50%;
}

.presence-online { background: var(--presence-online); }
.presence-busy { background: var(--presence-busy); }
.presence-away { background: var(--presence-away); }
.presence-offline { background: var(--presence-offline); }

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
  font-size: var(--font-md);
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

.conv-time {
  font-size: var(--font-xs);
  color: var(--text-muted);
  white-space: nowrap;
}

.conv-preview {
  font-size: var(--font-sm);
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 170px;
}

.unread-badge {
  background: var(--danger);
  color: #fff;
  font-size: var(--font-2xs);
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}

.mention-badge {
  background: var(--warning-bg);
  color: #fff;
  font-size: var(--font-2xs);
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 10px;
  white-space: nowrap;
}

.empty-hint {
  text-align: center;
  padding: 40px 0;
  color: var(--text-disabled);
  font-size: var(--font-md);
}

/* Contacts */
.dept-header {
  display: flex;
  align-items: center;
  margin: 2px 8px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  gap: 6px;
  font-size: var(--font-md);
  color: var(--text-primary);
}

.dept-header:hover {
  background: var(--bg-hover-light);
}

.dept-arrow {
  font-size: var(--font-2xs);
  color: var(--text-tertiary);
  width: 14px;
}

.dept-name {
  font-weight: 500;
}

.contact-item {
  display: flex;
  align-items: center;
  margin: 2px 8px;
  padding: 9px 12px 9px 28px;
  border-radius: 11px;
  cursor: pointer;
  gap: 10px;
  transition: background var(--transition-fast);
}

.contact-item:hover {
  background: var(--bg-hover-light);
}

.contact-avatar {
  position: relative;
  width: 34px;
  height: 34px;
  min-width: 34px;
  border-radius: 50%;
  background: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: var(--font-md);
  /* 不在容器上 overflow: hidden，否则会裁掉右下角的状态圆点；圆形裁剪由 img 自身承担 */
}

.contact-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.contact-info {
  display: flex;
  flex-direction: column;
}

.contact-name {
  font-size: var(--font-base);
  color: var(--text-primary);
}

.contact-signature {
  max-width: 210px;
  overflow: hidden;
  color: var(--text-tertiary);
  font-size: var(--font-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.contact-dept {
  font-size: var(--font-xs);
  color: var(--text-muted);
}

/* Right Panel */
.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-chat);
  min-width: 0;
  position: relative;
  border: 1px solid var(--border-subtle);
  border-left: 0;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 11px 22px;
  background: var(--bg-header);
  border-bottom: 1px solid var(--border);
  min-height: 66px;
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.02);
}

.chat-header-info {
  display: flex;
  flex-direction: column;
  margin-left: 10px;
  margin-right: auto;
  min-width: 0;
}

.chat-header-avatar {
  font-size: var(--font-lg);
}

.chat-header-name {
  font-size: 15px;
  font-weight: 650;
  color: var(--text-primary);
}

.chat-header-meta {
  font-size: var(--font-sm);
  color: var(--text-tertiary);
}

.chat-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.members-action-btn {
  background: none;
  border: none;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.members-action-btn:hover {
  background: var(--bg-hover-light);
  color: var(--text-primary);
}

.members-action-icon {
  width: 18px;
  height: 18px;
}

.search-result-row {
  width: 100%;
  display: grid;
  grid-template-columns: 80px 1fr 70px;
  gap: 8px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--font-sm);
  padding: 7px 8px;
  text-align: left;
}

.search-result-row:hover {
  background: var(--accent-bg-light);
}

.action-btn {
  background: none;
  border: none;
  cursor: pointer;
  width: 36px;
  height: 36px;
  padding: 8px;
  border-radius: 10px;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn img {
  width: 18px;
  height: 18px;
}

.action-btn:hover {
  background: var(--bg-hover-light);
  color: var(--text-primary);
}

/* Message Area */
.message-area {
  flex: 1;
  overflow-y: auto;
  padding: 26px 28px;
}

.message-list {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: min(920px, 100%);
  margin: 0 auto;
}

.message-item {
  display: flex;
  gap: 10px;
  max-width: 76%;
  border-radius: var(--radius-lg);
  transition: background-color 0.2s, box-shadow 0.2s;
}

.message-item.message-highlighted {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  box-shadow: 0 0 0 6px color-mix(in srgb, var(--accent) 14%, transparent);
}

.message-item.message-self {
  flex-direction: row-reverse;
  align-self: flex-end;
}

.message-avatar {
  position: relative;
  width: 34px;
  height: 34px;
  min-width: 34px;
  border-radius: 50%;
  background: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: var(--font-md);
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
  font-size: var(--font-sm);
  color: var(--text-tertiary);
}

.message-content {
  display: flex;
  flex-direction: column;
}

.text-bubble {
  background: var(--bg-surface);
  padding: 10px 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 4px 14px 14px;
  font-size: var(--font-md);
  color: var(--text-primary);
  line-height: 1.5;
  word-break: break-word;
  box-shadow: var(--shadow-sm);
  white-space: pre-wrap;
}

.message-self .text-bubble {
  background: var(--accent);
  color: #fff;
  border-color: transparent;
  border-radius: 14px 4px 14px 14px;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 18%, transparent);
}

.recalled-bubble {
  color: var(--text-tertiary);
  font-style: italic;
}

.reply-preview {
  border-left: 3px solid #c4c9f8;
  color: var(--text-secondary);
  font-size: var(--font-sm);
  margin-bottom: 6px;
  padding-left: 8px;
}

.mention {
  color: var(--accent);
  font-weight: 600;
}

.message-self .mention {
  color: #fff4a3;
}

.mention-self {
  background: rgba(255, 122, 69, 0.16);
  border-radius: var(--radius-sm);
  padding: 0 2px;
}

.image-bubble {
  max-width: 240px;
  max-height: 240px;
  border-radius: var(--radius-lg);
  cursor: pointer;
  object-fit: cover;
}

.file-bubble {
  align-items: center;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  color: var(--text-primary);
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(0, 1fr) auto;
  min-width: 260px;
  max-width: 340px;
  padding: 10px 12px;
  text-decoration: none;
}

.folder-bubble {
  display: flex;
  flex-direction: column;
  min-width: 260px;
  max-width: 340px;
}

.folder-bubble-card {
  min-width: 0;
  max-width: none;
}

.file-bubble:hover {
  border-color: #c8cef8;
  background: var(--accent-bg-light);
}

.legacy-attachment-disabled {
  cursor: default;
  opacity: 0.72;
}

.file-bubble-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.file-bubble-name {
  color: var(--text-primary);
  font-size: var(--font-base);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-bubble-meta,
.file-bubble-action {
  color: var(--text-tertiary);
  font-size: var(--font-sm);
}

.file-bubble-action {
  color: var(--accent);
  white-space: nowrap;
}

.p2p-file-bubble {
  cursor: default;
  grid-template-columns: minmax(0, 1fr);
}

.p2p-file-actions {
  align-items: center;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.p2p-action,
.p2p-cancel {
  background: transparent;
  border: 0;
  cursor: pointer;
  font: inherit;
  padding: 3px 0;
  white-space: nowrap;
}

.p2p-action {
  color: var(--accent);
}

.p2p-cancel {
  color: var(--text-tertiary);
}

.p2p-action:disabled,
.p2p-cancel:disabled {
  cursor: default;
  opacity: 0.6;
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
  font-size: var(--font-xs);
  color: var(--text-tertiary);
}





.message-time {
  font-size: var(--font-xs);
  color: var(--text-placeholder);
  margin-top: 2px;
}

.message-read-receipt {
  color: #9aa0b5;
}

.message-retry {
  border: none;
  background: none;
  color: var(--danger-strong);
  cursor: pointer;
  font-size: var(--font-xs);
  padding: 0 0 0 4px;
}

.message-action-link {
  border: none;
  background: none;
  color: #8c95d9;
  cursor: pointer;
  font-size: var(--font-xs);
  padding: 0 0 0 6px;
}

/* Input Area */
.input-area {
  border-top: 1px solid var(--border);
  background: var(--bg-header);
  padding: 13px 24px 18px;
  position: relative;
  transition: border-color var(--transition-fast), background-color var(--transition-fast);
}

.input-area.is-file-drag-active {
  border-color: #4053bf;
}

.attachment-drop-overlay {
  align-items: center;
  background: rgba(241, 244, 255, 0.96);
  border: 2px dashed #4053bf;
  border-radius: 10px;
  color: #263ca8;
  display: flex;
  flex-direction: column;
  inset: 6px;
  justify-content: center;
  pointer-events: none;
  position: absolute;
  text-align: center;
  z-index: 30;
}

.attachment-drop-overlay img {
  height: 28px;
  margin-bottom: 6px;
  width: 28px;
}

.attachment-drop-overlay strong {
  font-size: 14px;
}

.attachment-drop-overlay span {
  color: #475166;
  font-size: 12px;
  margin-top: 3px;
}

.attachment-feedback {
  color: #4053bf;
  font-size: 12px;
  line-height: 1.4;
  margin: 0 12px 4px;
}

.attachment-feedback.error {
  color: #a52f2a;
}

.reply-target {
  align-items: center;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: #666;
  display: flex;
  font-size: 12px;
  justify-content: space-between;
  margin-bottom: 8px;
  padding: 7px 10px;
}

.reply-target button {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
}

.input-toolbar {
  display: flex;
  gap: 8px;
  left: 8px;
  padding: 0;
  position: absolute;
  bottom: 8px;
  z-index: 3;
}








.tool-btn {
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background 0.15s;
  border: none;
  background: none;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tool-btn img {
  width: 18px;
  height: 18px;
}

.tool-folder-icon {
  color: var(--text-secondary);
  height: 18px;
  width: 18px;
}

.tool-btn:hover {
  background: var(--bg-hover-light);
}

.tool-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.tool-btn.disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.tool-btn:focus-visible {
  outline: 2px solid #4053bf;
  outline-offset: 2px;
}

/* 窗口抖动（振屏）：页面内容 CSS 抖动动画，桌面端同时配合主进程物理移动窗口 */
@keyframes windowShake {
  0%, 100% { transform: translate(0, 0); }
  10% { transform: translate(-8px, 4px); }
  20% { transform: translate(8px, -4px); }
  30% { transform: translate(-7px, -5px); }
  40% { transform: translate(7px, 5px); }
  50% { transform: translate(-5px, 3px); }
  60% { transform: translate(5px, -3px); }
  70% { transform: translate(-3px, -2px); }
  80% { transform: translate(3px, 2px); }
  90% { transform: translate(-1px, 1px); }
}

.chat-layout.window-shaking {
  animation: windowShake 0.6s ease-in-out;
}

.shake-bubble {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary, #888);
}

.shake-bubble-icon {
  width: 16px;
  height: 16px;
}

.input-box {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  position: relative;
  width: min(960px, 100%);
  margin: 0 auto;
}

.message-field {
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: 14px;
  flex: 1;
  height: 112px;
  overflow: hidden;
  position: relative;
}

.message-field:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent);
}

.message-field::after {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1;
  height: 40px;
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  background: var(--bg-surface);
  content: '';
  pointer-events: none;
}

.message-content-scroll {
  align-items: stretch;
  display: flex;
  width: 100%;
  height: calc(100% - 40px);
  overflow: auto;
  overscroll-behavior: contain;
}

.message-content-scroll > .attachment-feedback {
  align-self: center;
  flex: none;
  margin: 0 8px;
  max-width: 240px;
}

.message-input {
  display: block;
  flex: 1 0 180px;
  width: auto;
  height: 100%;
  box-sizing: border-box;
  resize: none;
  border: none;
  border-radius: 8px;
  padding: 10px 88px 10px 12px;
  font-size: 14px;
  background: transparent;
  line-height: 1.5;
  min-height: 100%;
  max-height: 100%;
  overflow-y: auto;
}

.message-input:focus-visible {
  outline: none;
}

.message-input:disabled {
  cursor: not-allowed;
  opacity: 0.72;
}

.send-btn {
  position: absolute;
  right: 8px;
  bottom: 8px;
  padding: 6px 18px;
  background: var(--accent);
  color: #fff;
  border-radius: var(--radius-lg);
  font-size: var(--font-sm);
  border: none;
  cursor: pointer;
  transition: background var(--transition-normal);
  white-space: nowrap;
  z-index: 3;
}

.send-btn:hover {
  background: var(--accent-hover);
}

.send-btn:disabled {
  background: #a9b2ee;
  cursor: not-allowed;
}

.mention-picker {
  position: absolute;
  left: 0;
  bottom: calc(100% + 6px);
  width: 240px;
  max-height: 260px;
  overflow-y: auto;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 6px;
  z-index: 30;
}

.emoji-panel {
  position: absolute;
  left: 0;
  bottom: calc(100% + 6px);
  width: 320px;
  max-height: 360px;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
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
  border-radius: var(--radius-md);
  background: var(--bg-header);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--font-sm);
  padding: 5px 10px;
}

.emoji-tabs button.active,
.emoji-group-tabs button.active {
  background: var(--accent);
  color: #fff;
}

.emoji-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.emoji-section-title {
  font-size: var(--font-sm);
  color: var(--text-tertiary);
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
  background: var(--bg-chat);
  cursor: pointer;
  font-size: 20px;
}

.emoji-item:hover {
  background: var(--accent-bg-light);
}

.sticker-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.sticker-option {
  border: none;
  border-radius: 8px;
  background: var(--bg-chat);
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.sticker-option:hover {
  background: var(--accent-bg-light);
}

.sticker-option img {
  width: 48px;
  height: 48px;
  object-fit: contain;
}

.sticker-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sticker-manage-btn {
  border: none;
  border-radius: 5px;
  background: #eef3ff;
  color: #4f63d8;
  cursor: pointer;
  font-size: 12px;
  padding: 4px 8px;
}

.custom-sticker-option {
  min-width: 0;
}

.custom-sticker-actions {
  display: flex;
  justify-content: center;
  gap: 4px;
  margin-top: 4px;
}

.custom-sticker-actions button {
  border: none;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  font-size: 11px;
  padding: 2px 3px;
}

.custom-sticker-actions button:hover {
  color: #4f63d8;
}

.sticker-empty,
.sticker-error-text {
  color: #8a8f99;
  font-size: 12px;
  padding: 8px 0;
}

.sticker-error-text {
  color: #d93026;
}

.mention-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: var(--font-base);
  color: var(--text-primary);
}

.mention-option:hover,
.mention-option.active {
  background: var(--accent-bg-light);
}

.mention-avatar,
.member-avatar {
  position: relative;
  width: 28px;
  height: 28px;
  min-width: 28px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 不在容器上 overflow: hidden，否则会裁掉右下角的状态圆点；圆形裁剪由 img 自身承担 */
  font-size: var(--font-sm);
}

.mention-avatar img,
.member-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.contact-avatar.offline,
.conv-avatar.offline,
.member-avatar.offline {
  filter: grayscale(100%);
}

/* No conversation */
.no-conversation {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  background:
    radial-gradient(circle at center, color-mix(in srgb, var(--accent) 7%, transparent), transparent 34%),
    var(--bg-chat);
}

.no-conv-icon {
  width: 44px;
  height: 44px;
  margin-bottom: 18px;
  padding: 11px;
  border-radius: 15px;
  background: var(--accent-bg-active);
  opacity: 0.78;
}

.no-conversation p {
  font-size: 14px;
}

.member-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 320px;
  max-width: 100%;
  background: var(--bg-header);
  border-left: 1px solid var(--border-light);
  box-shadow: -10px 0 28px rgba(0, 0, 0, 0.08);
  z-index: 20;
  display: flex;
  flex-direction: column;
  animation: slideInFromRight 0.2s ease-out;
}

.member-drawer-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  padding: 0 14px;
  color: var(--text-primary);
}

.member-drawer-back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 32px;
  margin-left: -5px;
  border-radius: 7px;
  background: transparent;
  color: var(--text-primary);
  transition: background-color var(--transition-fast);
}

.member-drawer-back:hover {
  background: var(--bg-hover-light);
}

.member-drawer-back svg {
  width: 19px;
  height: 19px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.member-drawer-title {
  flex: 1;
  font-size: 15px;
  font-weight: 500;
}

.member-drawer-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.member-drawer-actions button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  transition: background-color var(--transition-fast), color var(--transition-fast);
}

.member-drawer-actions button:hover {
  background: var(--bg-hover-light);
  color: var(--text-primary);
}

.member-drawer-actions svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.6;
}

/* 搜索抽屉 */
.search-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 320px;
  background: var(--bg-surface);
  border-left: 1px solid var(--border-light);
  box-shadow: -10px 0 28px rgba(0, 0, 0, 0.08);
  z-index: 21;
  display: flex;
  flex-direction: column;
}

.search-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.search-drawer-title {
  font-size: var(--font-base);
  font-weight: 600;
  color: var(--text-primary);
}

.search-drawer-input-row {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.search-drawer-input {
  flex: 1;
  height: 32px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: var(--font-sm);
  padding: 0 10px;
  outline: none;
}

.search-drawer-input:focus {
  border-color: var(--accent);
}

.search-drawer-btn {
  height: 32px;
  padding: 0 14px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--accent);
  color: #fff;
  font-size: var(--font-sm);
  cursor: pointer;
}

.search-drawer-btn:hover {
  filter: brightness(1.05);
}

.search-drawer-results {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
}

.empty-hint {
  text-align: center;
  padding: 30px 12px;
  color: var(--text-tertiary);
  font-size: var(--font-sm);
}

/* ============ 更多抽屉 ============ */
.more-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 320px;
  max-width: 100%;
  background: var(--bg-header);
  border-left: 1px solid var(--border-subtle);
  box-shadow: -10px 0 28px rgba(0, 0, 0, 0.08);
  z-index: 30;
  display: flex;
  flex-direction: column;
  animation: slideInFromRight 0.2s ease-out;
}

.more-drawer-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.more-drawer-back {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px 4px 4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--font-sm, 13px);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.more-drawer-back:hover {
  color: var(--text-primary);
  background: var(--bg-hover-light);
}

.more-drawer-back svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

/* 共享返回按钮样式（搜索/群成员抽屉） */
.drawer-back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px 4px 4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--font-sm, 13px);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.drawer-back-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover-light);
}

.drawer-back-btn svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.more-drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 18px 28px;
  color: var(--text-primary);
}

.more-profile-card {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 64px;
  padding: 10px 14px;
  border-radius: 9px;
  background: var(--bg-surface);
}

.more-profile-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.more-profile-copy strong {
  overflow: hidden;
  font-size: 14px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.more-members-card {
  margin-top: 22px;
  border-radius: 9px;
  background: var(--bg-surface);
  overflow: hidden;
}

.more-section-heading {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 44px;
  padding: 0 14px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  transition: background-color var(--transition-fast);
}

.more-section-heading:hover {
  background: var(--bg-hover-light);
}

.more-section-heading strong {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
}

.more-section-heading span {
  color: var(--text-tertiary);
  font-size: 12px;
}

.more-section-heading svg,
.more-field-row svg,
.more-action-card svg {
  width: 15px;
  height: 15px;
  margin-left: 2px;
  fill: none;
  stroke: var(--text-tertiary);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.more-member-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  column-gap: 7px;
  row-gap: 16px;
  padding: 12px 12px 18px;
}

.more-member-cell {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-tertiary);
}

.more-member-cell:hover .more-member-avatar {
  box-shadow: 0 0 0 2px var(--accent-bg-active);
}

.more-member-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--accent-avatar);
  color: #fff;
  font-size: 12px;
  transition: box-shadow var(--transition-fast);
}

.more-member-avatar.offline {
  filter: grayscale(100%);
}

.more-member-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.more-member-add {
  background: var(--bg-header);
  color: var(--text-secondary);
}

.more-member-add svg {
  width: 19px;
  height: 19px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 1.7;
}

.more-member-name {
  width: 100%;
  overflow: hidden;
  font-size: 11px;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.more-field-group {
  display: block;
  margin-top: 20px;
}

.more-field-label {
  display: block;
  margin: 0 14px 7px;
  color: var(--text-tertiary);
  font-size: 13px;
}

.more-field-row {
  width: 100%;
  min-height: 36px;
  border: 0;
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 14px;
}

.more-field-row {
  display: flex;
  align-items: center;
  padding: 0 14px;
  text-align: left;
  transition: background-color var(--transition-fast);
}

button.more-field-row:hover {
  background: var(--bg-hover-light);
}

.more-field-row > span {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.more-field-row > span.muted {
  color: var(--text-tertiary);
}

.more-settings-card,
.more-action-card {
  margin-top: 20px;
  border-radius: 9px;
  background: var(--bg-surface);
  overflow: hidden;
}

.more-setting-row,
.more-action-card button {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 36px;
  padding: 0 14px;
  background: transparent;
  color: var(--text-primary);
  font-size: 14px;
  text-align: left;
  transition: background-color var(--transition-fast);
}

.more-setting-row + .more-setting-row,
.more-action-card button + button {
  border-top: 1px solid var(--border-subtle);
}

.more-setting-row:hover,
.more-action-card button:hover {
  background: var(--bg-hover-light);
}

.more-setting-row > span:first-child,
.more-action-card button > span:first-child {
  flex: 1;
}

.more-switch {
  position: relative;
  width: 28px;
  height: 16px;
  flex-shrink: 0;
  border-radius: 999px;
  background: var(--text-disabled);
  transition: background-color var(--transition-normal);
}

.more-switch > span {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
  transition: transform var(--transition-normal);
}

.more-switch.active {
  background: #1296db;
}

.more-switch.active > span {
  transform: translateX(12px);
}

.more-action-card .more-delete-row {
  color: var(--text-primary);
}

.more-leave-btn {
  width: 100%;
  min-height: 38px;
  margin-top: 40px;
  border-radius: 9px;
  background: var(--bg-surface);
  color: var(--danger-strong);
  font-size: 14px;
  transition: background-color var(--transition-fast);
}

.more-leave-btn:hover {
  background: var(--danger-bg);
}

@keyframes slideInFromRight {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}

@media (prefers-reduced-motion: reduce) {
  .more-drawer {
    animation: none;
  }

  .more-switch,
  .more-switch > span {
    transition: none;
  }
}

.member-search-box {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  margin: 0 16px 8px;
  padding: 0 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-surface) 58%, var(--bg-input-rest));
  color: var(--text-tertiary);
}

.member-search-box svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.member-search-box input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
}

.member-search-box input::placeholder {
  color: var(--text-tertiary);
}

.group-settings-box {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 16px 20px;
  overflow-y: auto;
}

.group-announcement-editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 8px 16px 20px;
  overflow-y: auto;
}

.group-announcement-editor textarea {
  min-height: 160px;
}

.group-avatar-setting {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 4px;
}

.group-avatar-details {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.group-avatar-label {
  color: var(--text-primary);
  font-size: var(--font-base);
  font-weight: 600;
}

.group-avatar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.group-avatar-action {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  color: var(--accent);
  cursor: pointer;
  font-size: var(--font-sm);
  padding: 5px 9px;
  transition: background 0.2s, border-color 0.2s;
}

.group-avatar-action:hover:not(:disabled),
.group-avatar-action:focus-visible {
  background: var(--accent-bg-light);
  border-color: var(--accent);
}

.group-avatar-action.danger {
  color: var(--danger-strong);
}

.group-avatar-action:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.group-avatar-readonly,
.group-avatar-status {
  color: var(--text-tertiary);
  font-size: var(--font-xs);
  line-height: 1.4;
  margin: 0;
}

.group-avatar-status.error {
  color: var(--danger-strong);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.group-setting-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: var(--text-secondary);
  font-size: var(--font-sm);
}

.group-setting-field input,
.group-setting-field textarea {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  color: var(--text-primary);
  font-size: var(--font-base);
  padding: 8px 10px;
  resize: none;
}

.group-setting-field input:disabled,
.group-setting-field textarea:disabled {
  background: #f6f7f9;
  color: #777;
}

.compact-submit {
  margin-top: 0;
  padding: 8px;
}

.compact-submit:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.group-settings-status {
  color: #64748b;
  font-size: 12px;
  line-height: 1.4;
  margin: -2px 0 0;
}

.member-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 10px 16px;
}

.member-row {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 52px;
  padding: 5px 7px;
  border-radius: 8px;
  transition: background-color var(--transition-fast);
}

.member-row:hover {
  background: var(--bg-hover-light);
}

.member-profile-button {
  display: flex;
  align-items: center;
  gap: 9px;
  flex: 1;
  min-width: 0;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
}

.member-drawer .member-avatar {
  width: 40px;
  height: 40px;
  min-width: 40px;
  background: var(--accent-avatar);
  font-size: 14px;
}

.member-name {
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-role-badge {
  flex-shrink: 0;
  padding: 2px 4px;
  border-radius: 4px;
  font-size: 10px;
  line-height: 1.2;
}

.member-role-owner {
  background: rgba(255, 122, 61, 0.12);
  color: #ff7a3d;
}

.member-role-admin {
  background: var(--accent-bg-light);
  color: var(--accent);
}

.member-menu-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-left: 3px;
  border-radius: 7px;
  background: transparent;
  color: var(--text-tertiary);
  opacity: 0.45;
  transition: background-color var(--transition-fast), opacity var(--transition-fast);
}

.member-menu-trigger:hover,
.member-menu-trigger[aria-expanded='true'] {
  background: var(--bg-surface);
  opacity: 1;
}

.member-menu-trigger svg {
  width: 17px;
  height: 17px;
  fill: currentColor;
}

.member-action-menu {
  position: absolute;
  top: 40px;
  right: 6px;
  z-index: 4;
  display: flex;
  flex-direction: column;
  min-width: 116px;
  padding: 4px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
}

.member-action-menu button {
  min-height: 30px;
  padding: 0 9px;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  font-size: 12px;
  text-align: left;
}

.member-action-menu button:hover {
  background: var(--bg-hover-light);
}

.member-action-menu button.danger {
  color: var(--danger-strong);
}

.member-empty {
  padding: 28px 12px;
  color: var(--text-tertiary);
  font-size: 13px;
  text-align: center;
}

.member-invite-panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.member-invite-results {
  flex: 1;
  overflow-y: auto;
  padding: 4px 10px 16px;
}

.member-invite-results > button {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 52px;
  padding: 5px 7px;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  text-align: left;
  transition: background-color var(--transition-fast);
}

.member-invite-results > button:hover {
  background: var(--bg-hover-light);
}

.member-invite-results > button > span:nth-child(2) {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-invite-results small {
  color: var(--accent);
  font-size: 12px;
}












/* Dialog */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: var(--bg-overlay);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-box {
  width: 420px;
  max-height: 80vh;
  background: var(--bg-surface);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-dialog);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-subtle);
  font-size: var(--font-lg);
  font-weight: 600;
}

.dialog-close {
  background: none;
  border: none;
  font-size: var(--font-xl);
  cursor: pointer;
  color: var(--text-tertiary);
}

.dialog-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
}

.dialog-submit {
  width: 100%;
  padding: 10px;
  margin-top: 12px;
  background: var(--accent);
  color: #fff;
  border-radius: var(--radius-lg);
  font-size: var(--font-md);
  border: none;
  cursor: pointer;
}

.dialog-submit:hover {
  background: var(--accent-hover);
}

.dialog-submit:disabled {
  background: var(--text-disabled);
  cursor: not-allowed;
}

.group-avatar-preview-dialog {
  width: 360px;
}

.group-avatar-preview-body {
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: 12px;
  text-align: center;
}

.group-avatar-preview-body > p {
  color: var(--text-secondary);
  margin: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-avatar-preview-actions {
  display: grid;
  gap: 10px;
  grid-template-columns: 1fr 1fr;
  width: 100%;
}

.group-avatar-preview-actions .dialog-submit {
  margin-top: 0;
}

.dialog-cancel {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--font-md);
  padding: 10px;
}

.dialog-cancel:hover:not(:disabled),
.dialog-cancel:focus-visible {
  background: var(--bg-hover-light);
  border-color: var(--text-tertiary);
}

.dialog-cancel:disabled {
  cursor: not-allowed;
  opacity: 0.65;
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

.compact-mode .conv-item {
  padding: 8px 14px;
}

.compact-mode .message-list {
  gap: 10px;
}

.compact-mode .message-area {
  padding: 12px 16px;
}

.compact-mode .input-area {
  padding: 6px 14px 10px;
}

@media (max-width: 1180px) {
  .middle-panel {
    width: 230px;
    min-width: 230px;
  }

  .conv-name {
    max-width: 140px;
  }

  .conv-preview {
    max-width: 150px;
  }
}

/* 适配 Electron 主窗口的最小宽度，仍保持桌面三栏结构。 */
@media (max-width: 720px) {
  .left-sidebar {
    width: 58px;
    min-width: 58px;
    padding: 12px 0;
  }

  .sidebar-nav,
  .sidebar-footer {
    padding-right: 5px;
    padding-left: 5px;
  }

  .user-avatar-sidebar {
    width: 36px;
    height: 36px;
    margin-bottom: 8px;
  }

  .nav-item {
    padding: 8px 2px;
  }

  .nav-icon {
    width: 19px;
    height: 19px;
  }

  .nav-label {
    font-size: 10px;
  }

  .settings-btn {
    width: 38px;
    height: 38px;
  }

  .middle-panel {
    width: 214px;
    min-width: 214px;
  }

  .panel-header {
    min-height: 58px;
    padding: 14px 14px 10px;
  }

  .panel-title {
    font-size: 18px;
  }

  .search-bar {
    padding: 0 10px 10px;
  }

  .conv-item {
    margin-right: 5px;
    margin-left: 5px;
    padding: 9px 8px;
  }

  .conv-avatar {
    width: 36px;
    height: 36px;
    min-width: 36px;
  }

  .conv-name,
  .conv-preview {
    max-width: 105px;
  }

  .message-area {
    padding: 16px 12px;
  }

  .message-list {
    gap: 12px;
  }

  .message-item {
    max-width: 88%;
  }

  .input-area,
  .compact-mode .input-area {
    padding: 8px 10px 10px;
  }

  .message-field {
    height: 104px;
  }

  .input-toolbar {
    gap: 4px;
  }

  .tool-btn {
    padding: 4px;
  }

  .send-btn {
    padding: 7px 14px;
  }
}

</style>

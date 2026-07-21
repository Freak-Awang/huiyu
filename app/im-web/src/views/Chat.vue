<template>
  <div
    class="chat-layout"
    :class="{
      'compact-mode': settingsStore.general.compactMode,
      'dark-theme': settingsStore.general.theme === 'dark',
    }"
  >
    <!-- Left Sidebar -->
    <div class="left-sidebar">
      <div class="sidebar-nav">
        <div
          class="nav-item"
          :class="{ active: activeTab === 'chat' }"
          @click="activeTab = 'chat'"
          title="消息"
        >
          <img :src="messageIcon" class="nav-icon" alt="消息" />
          <span class="nav-label">消息</span>
        </div>
        <div
          class="nav-item"
          :class="{ active: activeTab === 'contacts' }"
          @click="activeTab = 'contacts'"
          title="通讯录"
        >
          <img :src="contactsIcon" class="nav-icon" alt="通讯录" />
          <span class="nav-label">通讯录</span>
        </div>
      </div>
      <div class="sidebar-footer">
        <div
          class="user-avatar-small"
          :title="authStore.currentUser?.nickname"
          @click="openOwnProfile"
        >
          <img
            v-if="authStore.currentUser?.avatar"
            :src="authStore.currentUser.avatar"
            class="avatar-img"
            alt=""
          />
          <span v-else class="avatar-placeholder">
            {{ (authStore.currentUser?.nickname || 'U')[0] }}
          </span>
          <span class="sidebar-presence-dot" :class="`presence-${selfPresence}`"></span>
        </div>
        <button
          class="presence-switch"
          type="button"
          :title="selfPresenceLabel"
          @click="presenceMenuOpen = !presenceMenuOpen"
        >
          {{ selfPresenceLabel.slice(0, 2) }}
        </button>
        <div v-if="presenceMenuOpen" class="presence-menu">
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
        <button class="settings-btn" type="button" @click="showSettingsDialog = true" title="设置">
          <img :src="settingsIcon" alt="设置" />
        </button>
        <button class="logout-btn" @click="handleLogout" title="退出登录">
          <img :src="powerIcon" alt="退出登录" />
        </button>
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
                <img v-if="getConversationAvatar(conv)" :src="getConversationAvatar(conv)" alt="" />
                <span v-else>{{ (getConversationName(conv) || '群')[0] }}</span>
                <span
                  v-if="showConversationPresence(conv)"
                  class="online-dot"
                  :class="`presence-${getConversationPresence(conv)}`"
                ></span>
              </div>
              <div class="conv-info">
                <div class="conv-top">
                  <span class="conv-name">{{ getConversationName(conv) }}</span>
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
              <img v-if="getConversationAvatar(conv)" :src="getConversationAvatar(conv)" alt="" />
              <span v-else>{{ (getConversationName(conv) || '群')[0] }}</span>
              <span
                v-if="showConversationPresence(conv)"
                class="online-dot"
                :class="`presence-${getConversationPresence(conv)}`"
              ></span>
            </div>
            <div class="conv-info">
              <div class="conv-top">
                <span class="conv-name">{{ getConversationName(conv) }}</span>
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
              <div class="contact-avatar" @click.stop="openUserProfile(user)">
                <img v-if="getResolvedUser(user).avatar" :src="getResolvedUser(user).avatar" alt="" />
                <span v-else>{{ (getResolvedUser(user).nickname || getResolvedUser(user).username || '?')[0] }}</span>
                <span class="online-dot" :class="`presence-${getUserPresence(user)}`"></span>
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
                  @dblclick="createSingleChat(user)"
                >
                  <div class="contact-avatar" @click.stop="openUserProfile(user)">
                    <img v-if="getResolvedUser(user).avatar" :src="getResolvedUser(user).avatar" alt="" />
                    <span v-else>{{ (getResolvedUser(user).nickname || getResolvedUser(user).username || '?')[0] }}</span>
                    <span class="online-dot" :class="`presence-${getUserPresence(user)}`"></span>
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
                      @dblclick="createSingleChat(user)"
                    >
                      <div class="contact-avatar" @click.stop="openUserProfile(user)">
                        <img v-if="getResolvedUser(user).avatar" :src="getResolvedUser(user).avatar" alt="" />
                        <span v-else>{{ (getResolvedUser(user).nickname || getResolvedUser(user).username || '?')[0] }}</span>
                        <span class="online-dot" :class="`presence-${getUserPresence(user)}`"></span>
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
    </div>

    <!-- Right Panel -->
    <div class="right-panel">
      <template v-if="chatStore.currentConversation">
        <div class="chat-header">
          <div class="chat-header-info">
            <span class="chat-header-name">{{ getConversationName(chatStore.currentConversation) }}</span>
            <span
              v-if="chatStore.currentConversation.type === 'GROUP'"
              class="chat-header-meta"
            >
              {{ chatStore.currentConversation.memberCount ?? 0 }}人
            </span>
            <span v-else class="chat-header-meta">私聊</span>
          </div>
          <div class="chat-header-actions">
            <input
              v-model="chatSearchKeyword"
              class="chat-search-input"
              placeholder="搜索聊天记录"
              @keyup.enter="runChatSearch"
            />
            <button class="action-btn" title="搜索" @click="runChatSearch">🔎</button>
            <button
              v-if="chatStore.currentConversation.type === 'GROUP'"
              class="members-action-btn"
              title="群成员"
              type="button"
              @click="openMembersDrawer"
            >
              <img :src="contactsIcon" class="members-action-icon" alt="群成员" />
              <span>群成员</span>
            </button>
            <button
              class="action-btn"
              :title="chatStore.currentConversation.pinned ? '取消置顶' : '置顶'"
              @click="togglePin"
            >📌</button>
            <button
              class="action-btn"
              :title="chatStore.currentConversation.muted ? '取消免打扰' : '免打扰'"
              @click="toggleMute"
            >{{ chatStore.currentConversation.muted ? '🔕' : '🔔' }}</button>
          </div>
        </div>

        <div v-if="showSearchResults" class="chat-search-results">
          <div class="search-results-header">
            <span>搜索结果</span>
            <button class="dialog-close" @click="showSearchResults = false">✕</button>
          </div>
          <button
            v-for="result in chatSearchResults"
            :key="result.messageId"
            type="button"
            class="search-result-row"
            @click="showSearchResults = false"
          >
            <span>{{ getMessageSenderName(result) }}</span>
            <span>{{ result.displayContent || result.content }}</span>
            <span>{{ formatTime(result.createdAt) }}</span>
          </button>
          <div v-if="chatSearchResults.length === 0" class="empty-hint">无搜索结果</div>
        </div>

        <div class="message-area" ref="messageAreaRef" @scroll="onMessageScroll">
          <div class="message-list">
            <div
              v-for="msg in chatStore.currentMessages"
              :key="msg.messageId || msg.clientMsgId"
              class="message-item"
              :class="{ 'message-self': msg.senderId === authStore.currentUser?.userId }"
            >
              <div
                class="message-avatar"
                :title="getUserSignatureTitle(getMessageSenderName(msg), getMessageSenderSignature(msg))"
                @click="openMessageProfile(msg)"
              >
                <img v-if="getMessageSenderAvatar(msg)" :src="getMessageSenderAvatar(msg)" alt="" />
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
                    <a
                      class="file-bubble"
                      href="#"
                      @click.prevent="downloadMessageFile(msg.content)"
                    >
                      <span class="file-bubble-icon">📎</span>
                      <span class="file-bubble-main">
                        <span class="file-bubble-name">{{ getFileInfo(msg.content).fileName }}</span>
                        <span class="file-bubble-meta">{{ formatFileSize(getFileInfo(msg.content).fileSize) }}</span>
                      </span>
                      <span class="file-bubble-action">{{ getFileDownloadLabel(msg.content) }}</span>
                    </a>
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
              <input type="file" accept="image/*" multiple hidden :disabled="isSendingMessage" @change="onSendImage" />
            </label>
            <label
              class="tool-btn"
              :class="{ disabled: isSendingMessage }"
              title="发送文件"
              :aria-disabled="isSendingMessage"
              role="button"
              :tabindex="isSendingMessage ? -1 : 0"
              @keydown.enter.prevent="activateFileLabel"
              @keydown.space.prevent="activateFileLabel"
            >
              <img :src="fileIcon" alt="" />
              <input type="file" multiple hidden :disabled="isSendingMessage" @change="onSendFile" />
            </label>
            <button
              v-if="canUseDesktopScreenshot"
              class="tool-btn"
              title="屏幕截图"
              type="button"
              :disabled="isTakingScreenshot"
              @click="takeScreenshot"
            >
              <img :src="screenshotIcon" alt="屏幕截图" />
            </button>
          </div>
          <AttachmentDraftTray
            :drafts="currentAttachmentDrafts"
            :disabled="isSendingMessage"
            :file-icon="fileIcon"
            @remove="removeAttachmentDraft"
            @pause="pauseAttachmentDraft"
            @retry="retryAttachmentDraft"
          />
          <p
            v-if="attachmentFeedback"
            class="attachment-feedback"
            :class="{ error: attachmentFeedbackIsError }"
            :role="attachmentFeedbackIsError ? 'alert' : 'status'"
            aria-live="polite"
          >{{ attachmentFeedback }}</p>
          <div class="input-box">
            <textarea
              ref="messageInputRef"
              v-model="messageText"
              class="message-input"
              placeholder="输入消息..."
              rows="3"
              :disabled="isSendingMessage"
              @input="onMessageInput"
              @keydown="handleMessageKeydown"
              @paste="handleMessagePaste"
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
                  <img v-if="getResolvedUser(member).avatar" :src="getResolvedUser(member).avatar" alt="" />
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
            <button
              class="send-btn"
              :disabled="isSendingMessage"
              @click="handleSendText"
            >{{ isSendingMessage ? '发送中...' : '发送' }}</button>
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
          <div class="member-drawer-title">
            <span>群成员</span>
            <span>{{ chatStore.currentConversation?.memberCount ?? sortedGroupMembers.length }}人</span>
          </div>
          <button class="dialog-close" @click="showMembersDrawer = false">✕</button>
        </div>
        <input
          v-model="memberSearch"
          class="member-search"
          placeholder="搜索成员..."
        />
        <div v-if="chatStore.currentConversation?.type === 'GROUP'" class="group-settings-box">
          <label class="group-setting-field">
            <span>群名称</span>
            <input
              type="text"
              :value="groupSettingsName"
              :disabled="!canManageCurrentGroup"
              @input="onGroupNameInput"
              @keydown.stop
              @mousedown.stop
            />
          </label>
          <label class="group-setting-field">
            <span>群公告</span>
            <textarea
              :value="groupSettingsAnnouncement"
              :disabled="!canManageCurrentGroup"
              rows="3"
              @input="onGroupAnnouncementInput"
              @keydown.stop
              @mousedown.stop
            ></textarea>
          </label>
          <button
            v-if="canManageCurrentGroup"
            type="button"
            class="dialog-submit compact-submit"
            :disabled="groupSettingsSaving"
            @click="saveGroupSettings"
          >
            {{ groupSettingsSaving ? '保存中...' : '保存群设置' }}
          </button>
          <p v-if="groupSettingsStatus" class="group-settings-status">{{ groupSettingsStatus }}</p>
        </div>
        <div v-if="canManageCurrentGroup" class="member-add-box">
          <input
            v-model="memberAddKeyword"
            class="member-search member-add-input"
            placeholder="搜索并添加成员..."
            @input="onSearchAddMember"
          />
          <div v-if="memberAddResults.length" class="member-add-results">
            <button
              v-for="user in memberAddResults"
              :key="user.userId || user.id"
              type="button"
              class="member-add-result"
              @click="addGroupMember(user)"
            >
              {{ getResolvedUser(user).nickname || getResolvedUser(user).username }}
            </button>
          </div>
        </div>
        <div class="member-list">
          <div
            v-for="member in filteredGroupMembers"
            :key="member.userId"
            class="member-row"
          >
            <div class="member-avatar" @click="openUserProfile(member)">
              <img v-if="getResolvedUser(member).avatar" :src="getResolvedUser(member).avatar" alt="" />
              <span v-else>{{ getMemberName(member)[0] }}</span>
              <span class="online-dot" :class="`presence-${getUserPresence(member)}`"></span>
            </div>
            <div class="member-info">
              <span class="member-name">{{ getMemberName(member) }}</span>
              <span v-if="getResolvedUser(member).signature" class="member-signature">{{ getResolvedUser(member).signature }}</span>
              <span class="member-role" :class="`member-role-${member.role || 'member'}`">
                {{ formatMemberRole(member.role) }}
              </span>
            </div>
            <button
              v-if="canUpdateMemberRole(member)"
              type="button"
              class="member-role-btn"
              @click="toggleMemberRole(member)"
            >
              {{ member.role === 'admin' ? '取消管理员' : '设为管理员' }}
            </button>
            <button
              v-if="canRemoveGroupMember(member)"
              type="button"
              class="member-remove-btn"
              @click="removeGroupMember(member)"
            >
              {{ member.userId === authStore.currentUser?.userId ? '退出' : '移除' }}
            </button>
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
                  <img v-if="getResolvedUser(user).avatar" :src="getResolvedUser(user).avatar" alt="" />
                  <span v-else>{{ (getResolvedUser(user).nickname || getResolvedUser(user).username || '?')[0] }}</span>
                </div>
                <span class="contact-name">{{ getResolvedUser(user).nickname || getResolvedUser(user).username }}</span>
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
                {{ getResolvedUser(member).nickname || getResolvedUser(member).username }}
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
                  <img v-if="getResolvedUser(user).avatar" :src="getResolvedUser(user).avatar" alt="" />
                  <span v-else>{{ (getResolvedUser(user).nickname || getResolvedUser(user).username || '?')[0] }}</span>
                </div>
                <span class="contact-name">{{ getResolvedUser(user).nickname || getResolvedUser(user).username }}</span>
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

    <SettingsDialog
      v-if="showSettingsDialog"
      @close="showSettingsDialog = false"
      @recent-cache-cleared="clearRecentEmojiState"
      @local-cache-cleared="handleLocalCacheCleared"
    />
    <ProfileDialog
      v-if="showProfileDialog"
      :user="selectedProfileUser"
      :presence="getProfilePresence(selectedProfileUser)"
      @close="showProfileDialog = false"
      @saved="handleProfileSaved"
      @start-chat="startProfileChat"
    />
  </div>
</template>

<script setup lang="ts">
// Intent: Chat composes route-level UI behavior and data loading for this screen.

import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore, type UserInfo } from '../stores/auth'
import { useChatStore } from '../stores/chat'
import { useSettingsStore } from '../stores/settings'
import { useUpdateStore } from '../stores/update'
import { useUserProfileStore, type UserProfileSnapshot } from '../stores/userProfiles'
import { useAttachmentDraftStore, type AttachmentDraft } from '../stores/attachmentDrafts'
import SettingsDialog from '../components/SettingsDialog.vue'
import ProfileDialog from '../components/ProfileDialog.vue'
import AttachmentDraftTray from '../components/AttachmentDraftTray.vue'
import { WebSocketManager, type WsMessage } from '../utils/websocket'
import { getDeptTree, type DeptNode } from '../api/dept'
import { getUserProfile, getUsersByDept, searchUsers } from '../api/user'
import {
  addMembers,
  createConversation,
  muteConversation,
  normalizeConversation,
  pinConversation,
  removeMember,
  updateConversationSettings,
  updateMemberRole,
  type Conversation,
  type ConversationMember,
} from '../api/conversation'
import {
  buildTextMessageContent,
  isAllMention,
  MESSAGE_MENTION_ALL_ID,
  normalizeMessage,
  recallMessage,
  searchMessages as searchServerMessages,
  type Message,
  type MessageMention,
  type MessageReply,
} from '../api/message'
import {
  canUseLocalMessageStore,
  searchLocalMessages,
} from '../utils/localMessageStore'
import {
  downloadFileBlob,
  getFileUrl,
  uploadFile,
} from '../api/file'
import { cancelConversationFileUpload, uploadConversationFile } from '../utils/fileTransfer'
import { downloadAuthenticatedFile } from '../utils/fileDownload'
import { runAttachmentQueue } from '../utils/attachmentQueue'
import { DragDepthTracker, hasDirectoryDragItem, hasFileDragPayload } from '../utils/fileDrop'
import { EMOJI_GROUPS } from '../constants/emoji'
import {
  STICKERS,
  buildStickerContent,
  parseStickerContent,
  type Sticker,
} from '../constants/stickers'
import { RECENT_EMOJIS_KEY, RECENT_STICKERS_KEY } from '../utils/recentUsage'
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
import messageIcon from '../assets/icons/message.svg'
import contactsIcon from '../assets/icons/contacts.svg'
import settingsIcon from '../assets/icons/settings.svg'
import powerIcon from '../assets/icons/power.svg'
import emojiIcon from '../assets/icons/emoji.svg'
import screenshotIcon from '../assets/icons/screenshot.svg'
import fileIcon from '../assets/icons/file.svg'
import imageIcon from '../assets/icons/image.svg'

const router = useRouter()
const authStore = useAuthStore()
const chatStore = useChatStore()
const settingsStore = useSettingsStore()
const updateStore = useUpdateStore()
const userProfileStore = useUserProfileStore()
const attachmentDraftStore = useAttachmentDraftStore()

const activeTab = ref<'chat' | 'contacts'>('chat')
const showSettingsDialog = ref(false)
const showProfileDialog = ref(false)
const selectedProfileUserId = ref('')
const selectedProfileFallback = ref<UserProfileSnapshot | null>(null)
const selectedProfileUser = computed<any | null>(() => {
  if (!selectedProfileUserId.value) return null
  return userProfileStore.resolveProfile(selectedProfileFallback.value || selectedProfileUserId.value)
})
const searchKeyword = ref('')
const contactSearchKeyword = ref('')
const manualPresence = ref<PresenceStatus>('online')
const presenceMenuOpen = ref(false)
const wsConnected = ref(false)

let wsManager: WebSocketManager | null = null
let removeNotificationOpenListener: (() => void) | null = null
let idleTimer: ReturnType<typeof setTimeout> | null = null
let autoAway = false

// Filtered conversations
const filteredConversations = computed(() => {
  if (!searchKeyword.value) return chatStore.unpinnedConversations
  const kw = searchKeyword.value.toLowerCase()
  return chatStore.unpinnedConversations.filter(
    (c) => getConversationName(c).toLowerCase().includes(kw)
  )
})

// Dept tree
const deptTree = ref<DeptNode[]>([])
const expandedDepts = ref(new Set<string>())
const deptUsersMap = ref<Record<string, any[]>>({})
const UNASSIGNED_DEPT_ID = '__unassigned__'

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

async function loadInitialChatData() {
  const conversationTask = chatStore.fetchConversations().catch((err) => {
    console.warn('会话列表加载失败', err)
  })
  const contactsTask = loadDeptTree().catch((err) => {
    console.warn('通讯录加载失败', err)
  })

  await Promise.all([conversationTask, contactsTask])
  if (authStore.isLoggedIn) {
    await chatStore.fetchPendingMessages().catch((err) => {
      console.warn('Pending messages sync failed', err)
    })
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
        userProfileStore.upsertProfiles(res.data || [])
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
      userProfileStore.upsertProfiles(res.data || [])
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
      scrollToBottom(true)
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
const customStickerInputRef = ref<HTMLInputElement | null>(null)
const messageText = ref('')
const previewImage = ref('')
const authenticatedImageUrls = ref<Record<string, string>>({})
const imageLoadsInProgress = new Set<string>()
let imageLoadGeneration = 0
const fileDownloadProgress = ref<Record<string, number>>({})
const fileDownloadControllers = new Map<string, AbortController>()
const isSendingMessage = ref(false)
watch(isSendingMessage, (sending) => void updateStore.setTransferCount(sending ? 1 : 0), { immediate: true })
const isAttachmentDragActive = ref(false)
const attachmentFeedback = ref('')
const attachmentFeedbackIsError = ref(false)
const attachmentDragDepth = new DragDepthTracker()
const isTakingScreenshot = ref(false)
const draftMentions = ref<MessageMention[]>([])
const replyTarget = ref<MessageReply | null>(null)
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
const showMembersDrawer = ref(false)
const memberSearch = ref('')
const memberAddKeyword = ref('')
const memberAddResults = ref<any[]>([])
const groupSettingsName = ref('')
const groupSettingsAnnouncement = ref('')
const groupSettingsSaving = ref(false)
const groupSettingsStatus = ref('')
const chatSearchKeyword = ref('')
const chatSearchResults = ref<Message[]>([])
const showSearchResults = ref(false)
let loadingOlderMessages = false
let lastMarkedReadMessageId = ''
const canUseDesktopScreenshot = computed(() => !!window.imDesktop?.startScreenshot)
const currentAttachmentDrafts = computed(() =>
  attachmentDraftStore.draftsFor(chatStore.currentConversation?.conversationId)
)
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
  if (conv.type === 'GROUP') return conv.avatar
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

function getProfilePresence(user: any): PresenceStatus {
  if (!user) return selfPresence.value
  return getUserPresence(user)
}

function getConversationPresence(conv: Conversation): PresenceStatus {
  if (conv.type === 'GROUP') return 'offline'
  return userProfileStore.getPresence(getConversationPeerId(conv))
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

async function startProfileChat(user: any) {
  showProfileDialog.value = false
  await createSingleChat(user)
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

async function handleSelectConv(conv: any) {
  if (isSendingMessage.value) {
    setAttachmentFeedback('附件发送完成后才能切换会话', true)
    return
  }
  try {
    await chatStore.selectConversation(conv.conversationId)
    requestConversationPresence(conv.conversationId)
    closeMentionPicker()
    closeEmojiPanel()
    showMembersDrawer.value = false
    lastMarkedReadMessageId = ''
    scrollToBottom(true)
    updateUnreadBadge()
  } catch (err: any) {
    alert(err?.response?.data?.message || '加载消息失败')
  }
}

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

function setAttachmentFeedback(message: string, isError = false) {
  attachmentFeedback.value = message
  attachmentFeedbackIsError.value = isError
}

function addAttachmentFiles(files: File[]) {
  const conversationId = chatStore.currentConversation?.conversationId
  if (!conversationId || !authStore.currentUser) {
    setAttachmentFeedback('请先选择会话，再添加附件', true)
    return false
  }
  if (isSendingMessage.value) {
    setAttachmentFeedback('附件正在发送，请稍后再添加', true)
    return false
  }
  if (!files.length) {
    setAttachmentFeedback('没有检测到可添加的文件', true)
    return false
  }

  const result = attachmentDraftStore.addFiles(conversationId, files)
  const messages: string[] = []
  if (result.added.length) messages.push(`已添加 ${result.added.length} 个附件`)
  if (result.duplicateCount) messages.push(`已忽略 ${result.duplicateCount} 个重复附件`)
  if (result.errors.length) messages.push(...result.errors)
  setAttachmentFeedback(messages.join('；'), result.errors.length > 0 || !result.added.length)
  return result.added.length > 0
}

function removeAttachmentDraft(draft: AttachmentDraft) {
  if (isSendingMessage.value) return
  if (draft.kind === 'file' && authStore.currentUser) {
    void cancelConversationFileUpload(
      draft.file,
      draft.conversationId,
      authStore.currentUser.userId,
    ).catch(() => undefined)
  }
  attachmentDraftStore.removeDraft(draft.conversationId, draft.id)
  setAttachmentFeedback(`已移除 ${draft.name}`)
}

function pauseAttachmentDraft(draft: AttachmentDraft) {
  if (draft.kind !== 'file') return
  attachmentDraftStore.updateDraft(draft.conversationId, draft.id, {
    status: 'paused',
    error: undefined,
  })
  draft.controller?.abort()
}

function retryAttachmentDraft() {
  void handleSendMessage()
}

function handleAttachmentDragEnter(event: DragEvent) {
  if (!hasFileDragPayload(event.dataTransfer)) return
  event.preventDefault()
  const depth = attachmentDragDepth.enter()
  isAttachmentDragActive.value = true
  if (depth === 1) setAttachmentFeedback('松开以添加到当前会话')
}

function handleAttachmentDragOver(event: DragEvent) {
  if (!hasFileDragPayload(event.dataTransfer)) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

function handleAttachmentDragLeave(event: DragEvent) {
  if (!isAttachmentDragActive.value) return
  event.preventDefault()
  if (attachmentDragDepth.leave() === 0) {
    isAttachmentDragActive.value = false
    if (attachmentFeedback.value === '松开以添加到当前会话') attachmentFeedback.value = ''
  }
}

function handleAttachmentDrop(event: DragEvent) {
  if (!hasFileDragPayload(event.dataTransfer)) return
  event.preventDefault()
  event.stopPropagation()
  attachmentDragDepth.reset()
  isAttachmentDragActive.value = false
  if (hasDirectoryDragItem(event.dataTransfer?.items)) {
    setAttachmentFeedback('暂不支持拖入文件夹，请选择文件后重试', true)
    return
  }
  addAttachmentFiles(Array.from(event.dataTransfer?.files || []))
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

function dataUrlToFile(dataUrl: string, fileName: string): File {
  const [header, base64Data] = dataUrl.split(',')
  const mime = header.match(/^data:(.*?);base64$/)?.[1] || 'image/png'
  const binary = atob(base64Data || '')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new File([bytes], fileName, { type: mime })
}

async function takeScreenshot() {
  // 截图只在桌面 bridge 可用时进入 native flow，结果按图片草稿处理，沿用现有发送流程。
  if (!window.imDesktop?.startScreenshot || isTakingScreenshot.value) return
  if (!chatStore.currentConversation || !authStore.currentUser) {
    alert('请先选择会话')
    return
  }

  closeMentionPicker()
  closeEmojiPanel()
  isTakingScreenshot.value = true
  try {
    const result = await window.imDesktop.startScreenshot()
    if (!result.canceled && result.dataUrl) {
      const file = dataUrlToFile(result.dataUrl, `screenshot-${Date.now()}.png`)
      addAttachmentFiles([file])
      await nextTick()
      messageInputRef.value?.focus()
    }
  } catch {
    alert('截图失败')
  } finally {
    isTakingScreenshot.value = false
  }
}

function handleMessagePaste(event: ClipboardEvent) {
  const files = getImageFilesFromClipboard(event)
  if (!files.length) return

  event.preventDefault()
  addAttachmentFiles(files)
  closeMentionPicker()
  closeEmojiPanel()
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
    showSearchResults.value = true
  } catch (err: any) {
    alert(err?.response?.data?.message || '搜索聊天记录失败')
  }
}

async function openMembersDrawer() {
  const conv = chatStore.currentConversation
  if (!conv || conv.type !== 'GROUP') return
  showMembersDrawer.value = true
  memberSearch.value = ''
  memberAddKeyword.value = ''
  memberAddResults.value = []
  groupSettingsStatus.value = ''
  const refreshed = await chatStore.refreshConversation(conv.conversationId)
  groupSettingsName.value = refreshed?.name || conv.name || ''
  groupSettingsAnnouncement.value = refreshed?.announcement || conv.announcement || ''
}

function onGroupNameInput(event: Event) {
  groupSettingsName.value = (event.target as HTMLInputElement).value
  groupSettingsStatus.value = ''
}

function onGroupAnnouncementInput(event: Event) {
  groupSettingsAnnouncement.value = (event.target as HTMLTextAreaElement).value
  groupSettingsStatus.value = ''
}

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
      announcement: groupSettingsAnnouncement.value,
    })
    chatStore.upsertConversation(res.data)
    groupSettingsName.value = res.data.name
    groupSettingsAnnouncement.value = res.data.announcement || ''
    groupSettingsStatus.value = '群设置已保存'
  } catch (err: any) {
    const message = err?.response?.data?.message || err?.message || ''
    groupSettingsStatus.value = message.includes('No static resource') || err?.response?.status === 404
      ? '保存失败：后端服务未更新或未重启，请重启后端后再试'
      : message || '保存群设置失败'
  } finally {
    groupSettingsSaving.value = false
  }
}

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

async function toggleMemberRole(member: ConversationMember) {
  const conv = chatStore.currentConversation
  if (!conv) return
  const nextRole = member.role === 'admin' ? 'member' : 'admin'
  try {
    const res = await updateMemberRole(conv.conversationId, member.userId, nextRole)
    chatStore.upsertConversation(res.data)
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

async function removeGroupMember(member: ConversationMember) {
  const conv = chatStore.currentConversation
  if (!conv) return
  const isSelf = member.userId === String(authStore.currentUser?.userId ?? '')
  const confirmed = window.confirm(isSelf ? '确定退出该群聊吗？' : `确定移除“${getMemberName(member)}”吗？`)
  if (!confirmed) return
  try {
    await removeMember(conv.conversationId, member.userId)
    if (isSelf) {
      showMembersDrawer.value = false
      chatStore.currentConversation = null
      await chatStore.fetchConversations()
      return
    }
    await chatStore.refreshConversation(conv.conversationId)
  } catch (err: any) {
    alert(err?.response?.data?.message || '移除成员失败')
  }
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
    draftMentions.value.push({
      type: member.userId === MESSAGE_MENTION_ALL_ID ? 'all' : 'user',
      userId: member.userId,
      nickname: name,
    })
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

function getStickerInfo(content: string): Sticker | null {
  const parsed = parseStickerContent(content)
  if (!parsed) return null
  if (parsed.source === 'custom' || parsed.localOnly) {
    return customStickers.value.find((sticker) => sticker.id === parsed.id) || null
  }
  return parsed
}

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
    fileId = fallback.match(/\/api\/files\/download\/(\d+)/)?.[1] || ''
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

function getFileInfo(content: string): { fileId: string; fileName: string; fileSize: number; url: string } {
  try {
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === 'object') {
      const fileId = String(parsed.fileId || '')
      return {
        fileId,
        fileName: String(parsed.fileName || '文件'),
        fileSize: Number(parsed.fileSize || 0),
        url: String(parsed.downloadUrl || parsed.url || (fileId ? getFileUrl(fileId) : '#')),
      }
    }
  } catch {
    // Fall through to a disabled fallback card.
  }
  return { fileId: '', fileName: '文件', fileSize: 0, url: '#' }
}

async function downloadMessageFile(content: string) {
  const file = getFileInfo(content)
  if (!file.fileId) return
  const active = fileDownloadControllers.get(file.fileId)
  if (active) {
    active.abort()
    return
  }
  const controller = new AbortController()
  fileDownloadControllers.set(file.fileId, controller)
  fileDownloadProgress.value[file.fileId] = 0
  try {
    await downloadAuthenticatedFile({
      fileId: file.fileId,
      fileName: file.fileName,
      fileSize: file.fileSize,
      signal: controller.signal,
      onProgress: (progress) => { fileDownloadProgress.value[file.fileId] = progress },
    })
  } catch (error) {
    if (!controller.signal.aborted) alert(error instanceof Error ? error.message : '下载失败')
  } finally {
    fileDownloadControllers.delete(file.fileId)
    delete fileDownloadProgress.value[file.fileId]
  }
}

function getFileDownloadLabel(content: string) {
  const fileId = getFileInfo(content).fileId
  if (!fileId || !(fileId in fileDownloadProgress.value)) return '下载'
  const progress = fileDownloadProgress.value[fileId]
  return progress > 0 ? `${Math.round(progress * 100)}%` : '取消'
}

function clearAuthenticatedImages() {
  imageLoadGeneration += 1
  Object.values(authenticatedImageUrls.value).forEach((url) => URL.revokeObjectURL(url))
  authenticatedImageUrls.value = {}
  imageLoadsInProgress.clear()
}

function rememberEmoji(emoji: string) {
  recentEmojis.value = [emoji, ...recentEmojis.value.filter((item) => item !== emoji)].slice(0, 24)
  localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(recentEmojis.value))
}

function rememberSticker(sticker: Sticker) {
  recentStickers.value = [sticker, ...recentStickers.value.filter((item) => item.id !== sticker.id)].slice(0, 12)
  localStorage.setItem(RECENT_STICKERS_KEY, JSON.stringify(recentStickers.value.map((item) => stickerStorageKey(item))))
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

function revokeCustomStickerUrls() {
  for (const sticker of customStickers.value) {
    if (sticker.url?.startsWith('blob:')) {
      URL.revokeObjectURL(sticker.url)
    }
  }
}

async function loadCustomStickerState() {
  customStickerError.value = ''
  try {
    const records = await listCustomStickerRecords()
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
  if (!window.confirm(`删除表情“${sticker.name}”？`)) return
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

function handleDocumentMouseDown(event: MouseEvent) {
  const target = event.target as Node
  if (presenceMenuOpen.value && !(target instanceof Element && target.closest('.presence-menu, .presence-switch'))) {
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
function isMessageAreaNearBottom() {
  const el = messageAreaRef.value
  if (!el) return false
  return el.scrollHeight - el.scrollTop - el.clientHeight <= 24
}

function getLastReadableMessageId() {
  const lastMessage = [...chatStore.currentMessages].reverse().find((msg) => !!msg.messageId)
  return lastMessage?.messageId || ''
}

function markCurrentConversationReadAtBottom() {
  // 只有滚动到底部时才上报已读，避免用户查看旧消息时误清空未读状态。
  const convId = chatStore.currentConversation?.conversationId
  const lastReadMessageId = getLastReadableMessageId()
  if (!convId || !lastReadMessageId || lastMarkedReadMessageId === lastReadMessageId) return
  lastMarkedReadMessageId = lastReadMessageId
  chatStore.clearUnread(convId)
  updateUnreadBadge()
  const sentByWs = wsManager?.isConnected()
    ? wsManager.send('MESSAGE_READ', { conversationId: convId, lastReadMessageId })
    : false
  if (!sentByWs) {
    void chatStore.markAsRead(convId, lastReadMessageId)
  }
}

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
function sendOutgoingMessage(msg: Message) {
  // Local optimistic messages enter the store first; this method only owns WebSocket delivery and failure marking.
  if (!wsManager || !wsConnected.value || !wsManager.isConnected()) {
    if (msg.clientMsgId) {
      chatStore.setMessageStatus(msg.clientMsgId, 'FAILED')
    }
    return false
  }
  if (msg.clientMsgId) {
    chatStore.setMessageStatus(msg.clientMsgId, 'SENDING')
  }
  const sent = wsManager.send('MESSAGE_SEND', {
    conversationId: msg.conversationId,
    messageType: msg.messageType,
    content: msg.content,
    clientMsgId: msg.clientMsgId,
  })
  if (!sent && msg.clientMsgId) {
    chatStore.setMessageStatus(msg.clientMsgId, 'FAILED')
  }
  return sent
}

function retryMessage(msg: Message) {
  if (!msg.clientMsgId) return
  sendOutgoingMessage(msg)
}

function messageReplyText(msg: Message): string {
  if (msg.status === 'RECALLED') return '消息已撤回'
  if (msg.displayContent) return msg.displayContent
  if (msg.messageType === 'IMAGE') return '[图片]'
  if (msg.messageType === 'FILE') return `[文件] ${getFileInfo(msg.content).fileName}`
  if (msg.messageType === 'STICKER') return '[表情]'
  return msg.content || ''
}

function startReply(msg: Message) {
  if (!msg.messageId || msg.status === 'RECALLED') return
  replyTarget.value = {
    messageId: msg.messageId,
    senderName: msg.senderName,
    text: messageReplyText(msg).slice(0, 80),
  }
  messageInputRef.value?.focus()
}

function canRecallMessage(msg: Message): boolean {
  if (!msg.messageId || msg.status === 'RECALLED' || msg.status === 'FAILED') return false
  if (msg.senderId !== authStore.currentUser?.userId) return false
  const createdAt = new Date(msg.createdAt).getTime()
  return Number.isFinite(createdAt) && Date.now() - createdAt <= 2 * 60 * 1000
}

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

async function recallCurrentMessage(msg: Message) {
  if (!msg.messageId) return
  try {
    const res = await recallMessage(msg.messageId)
    chatStore.addMessage(res.data)
  } catch (err: any) {
    alert(err?.response?.data?.message || '撤回失败')
  }
}

function sendTextMessage(
  conv: Conversation | null = chatStore.currentConversation,
  user: UserInfo | null = authStore.currentUser,
) {
  const text = messageText.value.trim()
  if (!text) return false
  if (!conv || !wsManager || !user) return false

  const clientMsgId = generateId()
  const mentions = pruneDraftMentions()
  const content = buildTextMessageContent(text, mentions, replyTarget.value)

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
    replyTo: replyTarget.value,
    clientMsgId,
    createdAt: new Date().toISOString(),
    status: 'SENDING',
    ...getInitialReadReceipt(conv),
  }
  chatStore.addMessage(localMessage)
  sendOutgoingMessage(localMessage)

  messageText.value = ''
  draftMentions.value = []
  replyTarget.value = null
  closeMentionPicker()
  closeEmojiPanel()
  scrollToBottom(true)
  return true
}

async function handleSendMessage() {
  if (isSendingMessage.value) return
  const hasText = !!messageText.value.trim()
  const conversation = chatStore.currentConversation
  const user = authStore.currentUser
  const attachments = [...currentAttachmentDrafts.value]
  if (!hasText && !attachments.length) return
  if (!conversation || !user) {
    setAttachmentFeedback('请先选择会话', true)
    return
  }

  isSendingMessage.value = true
  try {
    const completed = await runAttachmentQueue(
      attachments,
      (draft) => processAttachmentDraft(draft, conversation, user),
    )
    if (!completed) return
    if (hasText) sendTextMessage(conversation, user)
    if (attachments.length) setAttachmentFeedback('附件已加入发送队列')
  } finally {
    isSendingMessage.value = false
  }
}

async function processAttachmentDraft(
  draft: AttachmentDraft,
  conversation: Conversation,
  user: UserInfo,
) {
  const controller = new AbortController()
  attachmentDraftStore.updateDraft(conversation.conversationId, draft.id, {
    controller,
    status: draft.kind === 'image' ? 'uploading' : 'hashing',
    progress: 0,
    error: undefined,
  })
  try {
    if (draft.kind === 'image') {
      const response = await uploadFile(
        draft.file,
        conversation.conversationId,
        'image',
        (progress) => attachmentDraftStore.updateDraft(conversation.conversationId, draft.id, {
          status: 'uploading',
          progress,
        }),
        controller.signal,
      )
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
      const file = await uploadConversationFile(draft.file, conversation.conversationId, user.userId, {
        signal: controller.signal,
        onProgress: (progress) => attachmentDraftStore.updateDraft(conversation.conversationId, draft.id, {
          status: progress.stage === 'completed' ? 'uploading' : progress.stage,
          progress: progress.progress,
        }),
      })
      const fileContent = {
        fileId: file.id,
        fileName: file.originalName || draft.name,
        fileSize: file.size || draft.size,
        contentType: file.contentType || draft.mimeType || 'application/octet-stream',
        sha256: file.sha256,
        transferMode: file.transferMode || 'object_storage',
        downloadUrl: file.downloadUrl || file.url || getFileUrl(file.id),
      }
      sendMediaMessage('FILE', JSON.stringify(fileContent), `[文件] ${fileContent.fileName}`, conversation, user)
    }
    attachmentDraftStore.removeDraft(conversation.conversationId, draft.id)
    return true
  } catch (error: any) {
    const errorMessage = error?.response?.data?.message || error?.message || '上传失败'
    attachmentDraftStore.updateDraft(conversation.conversationId, draft.id, {
      controller: undefined,
      status: controller.signal.aborted ? 'paused' : 'failed',
      error: controller.signal.aborted ? undefined : errorMessage,
    })
    setAttachmentFeedback(
      controller.signal.aborted ? `${draft.name} 已暂停` : `${draft.name}：${errorMessage}`,
      !controller.signal.aborted,
    )
    return false
  }
}

function handleSendText() {
  void handleSendMessage()
}

function activateFileLabel(event: KeyboardEvent) {
  if (isSendingMessage.value) return
  ;(event.currentTarget as HTMLElement | null)?.click()
}

function onSendImage(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || []).filter((file) => file.type.startsWith('image/'))
  if (files.length) addAttachmentFiles(files)
  input.value = ''
}

function onSendFile(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (files.length) addAttachmentFiles(files)
  input.value = ''
}

function sendMediaMessage(
  type: string,
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
    messageType: type as any,
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
  scrollToBottom(true)
}

// WebSocket message handler
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
      const conv = await chatStore.receiveMessage(
        receivedMessage,
        String(authStore.currentUser?.userId ?? ''),
        !isCurrentConversation || !wasAtBottom
      )
      if (!conv) {
        alert('收到新消息，但会话信息加载失败，请刷新后重试')
      }
      if (receivedMessage.messageId) {
        wsManager?.send('MESSAGE_ACK', { messageId: receivedMessage.messageId })
      }
      if (conv && shouldNotifyMessage(receivedMessage, conv)) {
        const body = settingsStore.notification.showPreview
          ? receivedMessage.displayContent || receivedMessage.content
          : '收到一条新消息'
        showDesktopNotification(getConversationName(conv) || getMessageSenderName(receivedMessage), body, receivedMessage.conversationId)
      }
      if (isCurrentConversation && wasAtBottom) {
        scrollToBottom(true)
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
      chatStore.updateMessageStatus(data.clientMsgId, data.messageId, data.status)
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
      if (data.clientMsgId) {
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

function initWebSocket() {
  // Reinitialization tears down stale managers first so login changes and reconnects cannot reuse old user state.
  if (!authStore.isLoggedIn) return
  if (wsManager) {
    wsManager.disconnect()
  }
  const token = authStore.token
  if (!token) return
  wsManager = new WebSocketManager(token, handleWsMessage, (connected) => {
    wsConnected.value = connected
    if (connected) {
      const currentConvId = chatStore.currentConversation?.conversationId
      applySelfPresence(manualPresence.value)
      wsManager?.send('ONLINE_STATUS', { status: manualPresence.value })
      chatStore.fetchConversations()
      updateUnreadBadge()
      if (currentConvId) {
        requestConversationPresence(currentConvId)
        chatStore.fetchMessages(currentConvId).then(() => {
          if (isMessageAreaNearBottom()) {
            markCurrentConversationReadAtBottom()
          }
        })
      }
    }
  })
  wsManager.connect()
}

function shouldNotifyMessage(message: Message, conversation: Conversation) {
  const notification = settingsStore.notification
  if (selfPresence.value === 'dnd') return false
  if (conversation.muted || notification.doNotDisturb || !notification.desktop) return false
  if (chatStore.currentConversation?.conversationId === message.conversationId) return false
  if (notification.mentionOnly && !messageMentionsCurrentUser(message)) return false
  return true
}

function messageMentionsCurrentUser(message: Message) {
  const currentUserId = String(authStore.currentUser?.userId ?? '')
  if (!currentUserId) return false
  return message.mentions.some((mention) => mention.userId === currentUserId || isAllMention(mention))
}

async function showDesktopNotification(title: string, body: string, conversationId: string) {
  if (window.imDesktop?.showMessageNotification) {
    await window.imDesktop.showMessageNotification({ title, body, conversationId }).catch(() => false)
    return
  }
  showBrowserNotification(title, body)
}

function showBrowserNotification(title: string, body: string) {
  if (!('Notification' in window)) return
  if (Notification.permission === 'granted') {
    new Notification(title, { body })
    return
  }
  if (Notification.permission === 'default') {
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        new Notification(title, { body })
      }
    })
  }
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
      userProfileStore.upsertProfiles(res.data || [])
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
      userProfileStore.upsertProfiles(res.data || [])
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
    scrollToBottom(true)
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
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)}MB`
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)}GB`
}

function updateUnreadBadge() {
  if (!window.imDesktop?.setUnreadBadge) return
  window.imDesktop.setUnreadBadge(totalUnreadCount.value).catch(() => {
    // Badge support varies by platform; unread state remains in the renderer.
  })
}

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

async function handleLogout() {
  wsManager?.disconnect()
  if (window.imDesktop?.setUnreadBadge) {
    await window.imDesktop.setUnreadBadge(0).catch(() => false)
  }
  await authStore.logout()
  settingsStore.resetLocal()
  router.push('/login')
}

onMounted(async () => {
  await loadCustomStickerState()
  document.addEventListener('mousedown', handleDocumentMouseDown)
  window.addEventListener('mousemove', handleUserActivity)
  window.addEventListener('keydown', handleUserActivity)
  window.addEventListener('dragover', preventWindowFileDrop)
  window.addEventListener('drop', preventWindowFileDrop)
  window.addEventListener('dragleave', handleWindowDragLeave)
  resetIdleTimer()
  removeNotificationOpenListener = window.imDesktop?.onNotificationOpenConversation?.((conversationId) => {
    void openConversationFromNotification(conversationId)
  }) || null
  await authStore.init()
  if (authStore.isLoggedIn) {
    try {
      await settingsStore.load()
    } catch {
      // Settings can be retried from the dialog if the backend is temporarily unavailable.
    }
    if (window.imDesktop?.setCloseBehavior) {
      await window.imDesktop.setCloseBehavior(settingsStore.general.closeBehavior).catch(() => false)
    }
    await loadInitialChatData()
    applySelfPresence(manualPresence.value)
    updateUnreadBadge()
    initWebSocket()
  }
})

onUnmounted(() => {
  void updateStore.setTransferCount(0)
  document.removeEventListener('mousedown', handleDocumentMouseDown)
  window.removeEventListener('mousemove', handleUserActivity)
  window.removeEventListener('keydown', handleUserActivity)
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
  fileDownloadControllers.forEach((controller) => controller.abort())
  fileDownloadControllers.clear()
  revokeCustomStickerUrls()
  wsManager?.disconnect()
})

watch(
  () => chatStore.currentConversation?.conversationId,
  () => {
    lastMarkedReadMessageId = ''
    showMembersDrawer.value = false
    memberSearch.value = ''
    memberAddKeyword.value = ''
    memberAddResults.value = []
    attachmentDragDepth.reset()
    isAttachmentDragActive.value = false
    attachmentFeedback.value = ''
    clearAuthenticatedImages()
    closeMentionPicker()
    closeEmojiPanel()
  }
)

watch(
  () => authStore.isLoggedIn,
  (val) => {
    if (val) {
      applySelfPresence(manualPresence.value)
      settingsStore.load().catch(() => {
        // Keep defaults if settings cannot be loaded.
      })
      loadInitialChatData()
      initWebSocket()
    } else {
      attachmentDraftStore.clearAll()
      settingsStore.resetLocal()
      updateUnreadBadge()
    }
  }
)

watch(totalUnreadCount, () => {
  updateUnreadBadge()
})

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
  width: 22px;
  height: 22px;
}

.nav-label {
  font-size: 11px;
}

.sidebar-footer {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 0 6px;
}

.user-avatar-small {
  position: relative;
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

.user-avatar-small:hover {
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.28);
}

.sidebar-presence-dot {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 10px;
  height: 10px;
  border: 2px solid #2e2e2e;
  border-radius: 50%;
}

.presence-switch {
  width: 34px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: #f5f5f5;
  cursor: pointer;
  font-size: 11px;
}

.presence-switch:hover {
  background: rgba(255, 255, 255, 0.18);
}

.presence-menu {
  position: absolute;
  left: 54px;
  bottom: 74px;
  z-index: 50;
  width: 132px;
  padding: 6px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.18);
}

.presence-menu button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #273142;
  cursor: pointer;
  font-size: 13px;
  padding: 7px 8px;
  text-align: left;
}

.presence-menu button:hover,
.presence-menu button.active {
  background: #eef3ff;
}

.presence-dot-inline {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.logout-btn {
  background: none;
  border: none;
  color: #aaa;
  cursor: pointer;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
}

.logout-btn img {
  width: 18px;
  height: 18px;
}

.settings-btn {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: transparent;
  color: #aaa;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.settings-btn img {
  width: 18px;
  height: 18px;
}

.logout-btn:hover,
.settings-btn:hover {
  background: rgba(255, 255, 255, 0.08);
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
  background: #9ca3af;
  border: 2px solid #fff;
  border-radius: 50%;
}

.presence-online { background: #22c55e; }
.presence-busy { background: #ef4444; }
.presence-away { background: #f59e0b; }
.presence-dnd { background: #8b5cf6; }
.presence-invisible,
.presence-offline { background: #9ca3af; }

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
  position: relative;
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

.contact-signature {
  max-width: 150px;
  overflow: hidden;
  color: #8a8f99;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.chat-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.members-action-btn {
  align-items: center;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 6px;
  color: #555;
  cursor: pointer;
  display: flex;
  font-size: 12px;
  gap: 5px;
  height: 30px;
  padding: 0 10px;
  white-space: nowrap;
}

.members-action-btn:hover {
  background: #eef0ff;
  border-color: #c8cef8;
  color: #4f63d8;
}

.members-action-icon {
  width: 15px;
  height: 15px;
}

.chat-search-input {
  width: 150px;
  height: 30px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #fff;
  color: #333;
  font-size: 12px;
  padding: 0 8px;
}

.chat-search-results {
  max-height: 220px;
  overflow-y: auto;
  border-bottom: 1px solid #e0e0e0;
  background: #fff;
  padding: 8px 12px;
}

.search-results-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #333;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}

.search-result-row {
  width: 100%;
  display: grid;
  grid-template-columns: 80px 1fr 70px;
  gap: 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #666;
  cursor: pointer;
  font-size: 12px;
  padding: 7px 8px;
  text-align: left;
}

.search-result-row:hover {
  background: #f5f6fb;
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
  position: relative;
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

.recalled-bubble {
  color: #999;
  font-style: italic;
}

.reply-preview {
  border-left: 3px solid #c4c9f8;
  color: #777;
  font-size: 12px;
  margin-bottom: 6px;
  padding-left: 8px;
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

.file-bubble {
  align-items: center;
  background: #fff;
  border: 1px solid #e4e7f0;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  color: #333;
  display: grid;
  gap: 10px;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  min-width: 260px;
  max-width: 340px;
  padding: 10px 12px;
  text-decoration: none;
}

.file-bubble:hover {
  border-color: #c8cef8;
  background: #fbfcff;
}

.file-bubble-icon {
  align-items: center;
  background: #eef0ff;
  border-radius: 7px;
  color: #4f63d8;
  display: flex;
  height: 32px;
  justify-content: center;
  width: 32px;
}

.file-bubble-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.file-bubble-name {
  color: #333;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-bubble-meta,
.file-bubble-action {
  color: #8a8f99;
  font-size: 12px;
}

.file-bubble-action {
  color: #4f63d8;
  white-space: nowrap;
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





.message-time {
  font-size: 11px;
  color: #ccc;
  margin-top: 2px;
}

.message-read-receipt {
  color: #9aa0b5;
}

.message-retry {
  border: none;
  background: none;
  color: #d93026;
  cursor: pointer;
  font-size: 11px;
  padding: 0 0 0 4px;
}

.message-action-link {
  border: none;
  background: none;
  color: #8c95d9;
  cursor: pointer;
  font-size: 11px;
  padding: 0 0 0 6px;
}

/* Input Area */
.input-area {
  border-top: 1px solid #e0e0e0;
  background: #f0f0f0;
  padding: 8px 16px 12px;
  position: relative;
  transition: border-color 0.15s, background-color 0.15s;
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
  margin: 0 0 6px;
}

.attachment-feedback.error {
  color: #a52f2a;
}

.reply-target {
  align-items: center;
  background: #fff;
  border: 1px solid #e0e0e0;
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
  padding-bottom: 6px;
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

.tool-btn:hover {
  background: #e0e0e0;
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

.message-input:disabled {
  cursor: not-allowed;
  opacity: 0.72;
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
  position: relative;
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
  width: 64px;
  height: 64px;
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
  width: 320px;
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
  padding: 15px 16px;
  border-bottom: 1px solid #eee;
  color: #333;
}

.member-drawer-title {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.member-drawer-title span:first-child {
  font-size: 15px;
  font-weight: 600;
}

.member-drawer-title span:last-child {
  color: #999;
  font-size: 12px;
  font-weight: 400;
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

.member-add-box {
  padding: 0 12px 10px;
}

.group-settings-box {
  border-bottom: 1px solid #eee;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 12px 12px;
}

.group-setting-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: #666;
  font-size: 12px;
}

.group-setting-field input,
.group-setting-field textarea {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  color: #333;
  font-size: 13px;
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

.member-add-input {
  margin: 0;
  width: 100%;
}

.member-add-results {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.member-add-result {
  border: none;
  border-radius: 6px;
  background: #eef0ff;
  color: #4f63d8;
  cursor: pointer;
  font-size: 12px;
  padding: 5px 8px;
}

.member-list {
  flex: 1;
  overflow-y: auto;
  padding: 2px 10px 12px;
}

.member-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 8px 8px;
  border-radius: 8px;
}

.member-row:hover {
  background: #f5f6fb;
}

.member-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.member-name {
  font-size: 13px;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.member-signature {
  max-width: 170px;
  overflow: hidden;
  color: #8a8f99;
  font-size: 11px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-role {
  border-radius: 4px;
  color: #8a8f99;
  font-size: 11px;
  line-height: 1;
  width: fit-content;
}

.member-role-owner {
  color: #d46b08;
}

.member-role-admin {
  color: #4f63d8;
}

.member-remove-btn {
  border: none;
  border-radius: 6px;
  background: #fff1f0;
  color: #d93026;
  cursor: pointer;
  font-size: 12px;
  padding: 5px 8px;
}

.member-role-btn {
  border: none;
  border-radius: 6px;
  background: #eef0ff;
  color: #4f63d8;
  cursor: pointer;
  font-size: 12px;
  padding: 5px 8px;
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

.dark-theme .middle-panel {
  background: #252932;
  border-right-color: #363b48;
}

.dark-theme .panel-header,
.dark-theme .chat-header,
.dark-theme .input-area {
  background: #2d323c;
  border-color: #3b414f;
}

.dark-theme .right-panel,
.dark-theme .message-area {
  background: #1f232b;
}

.dark-theme .panel-title,
.dark-theme .conv-name,
.dark-theme .contact-name,
.dark-theme .contact-signature,
.dark-theme .dept-name,
.dark-theme .chat-header-name,
.dark-theme .member-signature,
.dark-theme .message-sender {
  color: #edf0f5;
}

.dark-theme .search-input,
.dark-theme .chat-search-input,
.dark-theme .message-input {
  background: #20242c;
  color: #edf0f5;
}

.dark-theme .attachment-drop-overlay {
  background: rgba(37, 42, 54, 0.97);
  border-color: #aeb8ff;
  color: #d8ddff;
}

.dark-theme .attachment-drop-overlay span {
  color: #c4cad6;
}

.dark-theme .attachment-feedback {
  color: #aeb8ff;
}

.dark-theme .attachment-feedback.error {
  color: #ffaaa4;
}

.dark-theme .conv-item:hover,
.dark-theme .contact-item:hover,
.dark-theme .dept-header:hover,
.dark-theme .action-btn:hover {
  background: #343a46;
}

.dark-theme .conv-item.active {
  background: #3b4260;
}

.dark-theme .text-bubble,
.dark-theme .reply-target {
  background: #303642;
  color: #edf0f5;
}

.dark-theme .message-self .text-bubble {
  background: #5868d8;
}
</style>

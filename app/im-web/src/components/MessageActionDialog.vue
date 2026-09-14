<template>
  <div class="message-action-overlay" @click.self="close">
    <section ref="dialog" class="message-action-dialog" role="dialog" aria-modal="true" :aria-labelledby="titleId" tabindex="-1" @keydown="keydown">
      <header><h2 :id="titleId">{{ mode === 'forward' ? `转发 ${messages.length} 条消息` : '本机收藏' }}</h2>
        <button type="button" aria-label="关闭" :disabled="busy" @click="close">关闭</button></header>
      <p v-if="mode === 'forward'">选择目标会话；文件和文件夹通过现有 P2P 流程转发至单聊。</p>
      <p v-else>收藏保存在当前账号的本机加密存储中。</p>
      <input v-model="keyword" type="search" :placeholder="mode === 'forward' ? '搜索会话' : '搜索收藏'" :aria-label="mode === 'forward' ? '搜索转发会话' : '搜索收藏'" :disabled="busy" />
      <div class="message-action-results">
        <template v-if="mode === 'forward'">
          <button v-for="conversation in filteredConversations" :key="conversation.conversationId" type="button" class="forward-target"
            :class="{ chosen: targetId === conversation.conversationId }" :aria-pressed="targetId === conversation.conversationId" :disabled="busy"
            @click="targetId = conversation.conversationId">
            <ConversationAvatar :type="conversation.type" :src="conversation.avatar" :name="conversation.name" />
            <span>{{ conversation.name }}<small>{{ conversation.type === 'GROUP' ? '群聊' : '单聊' }}</small></span>
          </button>
          <p v-if="!filteredConversations.length">没有可转发的会话</p>
        </template>
        <template v-else>
          <article v-for="message in filteredMessages" :key="messageIdentity(message)" class="favorite-message">
            <strong>{{ message.senderName }}</strong><p>{{ getMessagePreviewContent(message) }}</p>
            <div><button v-if="message.messageType === 'TEXT'" type="button" @click="$emit('copy', message)">复制</button>
              <button v-if="message.messageType === 'IMAGE'" type="button" @click="$emit('view', message)">查看图片</button>
              <button type="button" @click="$emit('unfavorite', message)">取消收藏</button></div>
          </article>
          <p v-if="!filteredMessages.length">暂无收藏</p>
        </template>
      </div>
      <footer v-if="mode === 'forward'"><span>{{ busy ? '正在提交转发…' : '转发后可在目标会话查看发送状态' }}</span>
        <button type="button" class="confirm" :disabled="busy || !target" @click="target && $emit('forward', target)">转发</button></footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useId } from 'vue'
import type { Conversation } from '../api/conversation'
import { getMessagePreviewContent, type Message } from '../api/message'
import { messageIdentity } from '../stores/messageLibrary'
import ConversationAvatar from './ConversationAvatar.vue'
const props = defineProps<{ mode: 'forward' | 'favorites'; messages: Message[]; conversations: Conversation[]; busy?: boolean }>()
const emit = defineEmits<{ close: []; forward: [conversation: Conversation]; copy: [message: Message]; view: [message: Message]; unfavorite: [message: Message] }>()
const titleId = useId()
const dialog = ref<HTMLElement>()
const keyword = ref('')
const targetId = ref('')
const target = computed(() => props.conversations.find(conversation => conversation.conversationId === targetId.value))
const filteredConversations = computed(() => props.conversations.filter(conversation => conversation.name.toLowerCase().includes(keyword.value.toLowerCase())))
const filteredMessages = computed(() => props.messages.filter(message => `${message.senderName} ${getMessagePreviewContent(message)}`.toLowerCase().includes(keyword.value.toLowerCase())).slice().reverse())
const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
function close() { if (!props.busy) emit('close') }
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
  if (event.key !== 'Tab') return
  const focusable = Array.from(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') || [])
  const index = focusable.indexOf(document.activeElement as HTMLElement)
  const next = (index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length
  event.preventDefault()
  focusable[next]?.focus()
}
onMounted(() => dialog.value?.querySelector('input')?.focus())
onUnmounted(() => { if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }) })
</script>

<style scoped>
.message-action-overlay { position: fixed; inset: 0; z-index: 950; background: var(--bg-overlay); display: grid; place-items: center; }
.message-action-dialog { width: min(460px, calc(100vw - 32px)); max-height: calc(100vh - 48px); display: flex; flex-direction: column; gap: 14px; padding: 22px; border: 1px solid var(--border-subtle); border-radius: var(--radius-xl); background: var(--bg-surface); color: var(--text-primary); box-shadow: var(--shadow-dialog); }
header, footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
h2 { font-size: 17px; font-weight: 600; }
p, footer span { font-size: 12px; color: var(--text-secondary); line-height: 1.6; }
button { border: 0; background: var(--bg-hover-light); color: var(--text-primary); border-radius: var(--radius-sm); padding: 7px 10px; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
input { padding: 10px; color: var(--text-primary); background: var(--bg-input-rest); border: 1px solid var(--border-input); border-radius: var(--radius-sm); }
.message-action-results { overflow-y: auto; min-height: 80px; max-height: 48vh; }
.forward-target { display: flex; width: 100%; align-items: center; text-align: left; gap: 12px; margin-bottom: 6px; background: transparent; }
.forward-target:hover { background: var(--bg-hover-light); }
.forward-target.chosen { background: var(--accent-bg-active); }
.forward-target :deep(.conversation-avatar) { width: 36px; height: 36px; }
small { display: block; color: var(--text-tertiary); margin-top: 4px; }
.favorite-message { padding: 12px 0; border-bottom: 1px solid var(--border-subtle); overflow-wrap: anywhere; }
.favorite-message strong { font-size: 13px; }
.favorite-message p { white-space: pre-wrap; margin: 6px 0; }
.favorite-message button { margin-right: 6px; }
button.confirm { background: var(--accent); color: var(--accent-text-on); }
</style>

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getMessagePolicy, type Message } from '../api/message'

// Compatibility with MessageServiceImpl.RECALL_LIMIT_MINUTES in servers predating /policy.
// The existing recall endpoint still validates ownership and the deadline on every operation.
const LEGACY_RECALL_WINDOW_MS = 2 * 60 * 1000

export const useMessagePolicyStore = defineStore('messagePolicy', () => {
  const windowMs = ref(LEGACY_RECALL_WINDOW_MS)
  let serverTime = Date.now()
  let receivedAt = performance.now()
  let generation = 0
  async function refresh() {
    const epoch = ++generation
    const startedAt = performance.now()
    try {
      const { data } = await getMessagePolicy()
      if (epoch !== generation || !data || !Number.isFinite(data.serverTime) || !Number.isFinite(data.recallWindowMs) || data.recallWindowMs < 0) return
      windowMs.value = data.recallWindowMs
      receivedAt = performance.now()
      // Conservatively include the request latency so a slow response never extends the recall window.
      serverTime = data.serverTime + Math.max(0, receivedAt - startedAt)
    } catch {
      // Keep the last server policy (including an explicit zero), or the legacy two-minute rule.
      // A missing optional endpoint or transient refresh failure must not disable existing recall.
    }
  }
  function canRecall(message: Message, userId: string) {
    if (!windowMs.value || !message.messageId || message.senderId !== userId || ['RECALLED', 'FAILED', 'SENDING'].includes(message.status || '')) return false
    const age = serverTime + performance.now() - receivedAt - Date.parse(message.createdAt)
    return Number.isFinite(age) && age >= 0 && age < windowMs.value
  }
  function reset() {
    generation++
    windowMs.value = LEGACY_RECALL_WINDOW_MS
    serverTime = Date.now()
    receivedAt = performance.now()
  }
  return { refresh, canRecall, reset }
})

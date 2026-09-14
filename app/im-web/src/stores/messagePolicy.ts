import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getMessagePolicy, type Message } from '../api/message'

export const useMessagePolicyStore = defineStore('messagePolicy', () => {
  const windowMs = ref(0)
  let serverTime = 0
  let receivedAt = 0
  let generation = 0
  async function refresh() {
    const epoch = ++generation
    const startedAt = performance.now()
    windowMs.value = 0
    try {
      const { data } = await getMessagePolicy()
      if (epoch !== generation || !Number.isFinite(data.serverTime) || !Number.isFinite(data.recallWindowMs) || data.recallWindowMs < 0) return
      windowMs.value = data.recallWindowMs
      receivedAt = performance.now()
      // Conservatively include the request latency so a slow response never extends the recall window.
      serverTime = data.serverTime + Math.max(0, receivedAt - startedAt)
    } catch { /* Older servers: hide recall until an authoritative policy is available. */ }
  }
  function canRecall(message: Message, userId: string) {
    if (!windowMs.value || !message.messageId || message.senderId !== userId || ['RECALLED', 'FAILED', 'SENDING'].includes(message.status || '')) return false
    const age = serverTime + performance.now() - receivedAt - Date.parse(message.createdAt)
    return Number.isFinite(age) && age >= 0 && age < windowMs.value
  }
  function reset() { generation++; windowMs.value = 0 }
  return { refresh, canRecall, reset }
})

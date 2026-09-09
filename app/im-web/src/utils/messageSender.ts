import type { Message } from '../api/message'
import type { WebSocketManager } from './websocket'

/** Each retry keeps clientMsgId, so a lost ACK cannot create a second server message. */
export function createMessageSender(
  update: (clientMsgId: string, messageId: string, status?: string) => void,
  setStatus: (clientMsgId: string, status: string) => void,
) {
  const attempts = new Map<string, symbol>()
  return {
    send(socket: WebSocketManager | null, message: Message) {
      const id = message.clientMsgId
      if (!id) return false
      const attempt = Symbol(id)
      attempts.set(id, attempt)
      setStatus(id, 'SENDING')
      if (!socket?.isConnected()) {
        setStatus(id, 'FAILED')
        attempts.delete(id)
        return false
      }
      void socket.request<{ messageId: string; status?: string }>('MESSAGE_SEND', {
        conversationId: message.conversationId,
        messageType: message.messageType,
        content: message.content,
        clientMsgId: id,
      }, 15000).then((ack) => {
        if (attempts.get(id) !== attempt) return
        if (!ack.messageId || ack.status === 'FAILED') throw new Error('未收到有效的发送确认')
        update(id, String(ack.messageId), ack.status || 'SENT')
      }).catch(() => {
        if (attempts.get(id) === attempt) setStatus(id, 'FAILED')
      }).finally(() => {
        if (attempts.get(id) === attempt) attempts.delete(id)
      })
      return true
    },
    dispose() {
      for (const id of attempts.keys()) setStatus(id, 'FAILED')
      attempts.clear()
    },
  }
}

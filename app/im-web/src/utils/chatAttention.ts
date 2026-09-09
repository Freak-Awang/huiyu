/** Read receipts and notification suppression must use the same foreground definition. */
export function isChatForeground() {
  return document.visibilityState === 'visible' && document.hasFocus()
}

export function isConversationBeingRead(
  conversationId: string,
  currentConversationId: string | undefined,
  atBottom: boolean,
  foreground = isChatForeground(),
) {
  return foreground && atBottom && conversationId === currentConversationId
}

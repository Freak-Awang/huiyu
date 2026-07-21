// Intent: attachmentQueue preserves draft order and stops at the first recoverable failure.
export async function runAttachmentQueue<T>(
  items: T[],
  process: (item: T) => Promise<boolean>,
) {
  for (const item of items) {
    if (!await process(item)) return false
  }
  return true
}

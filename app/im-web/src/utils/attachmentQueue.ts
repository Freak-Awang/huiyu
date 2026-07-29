/**
 * 附件发送队列工具
 *
 * 按顺序逐个处理附件，遇到第一个失败即停止后续处理。
 * 用于消息发送时附件上传的串行化控制，保证附件按用户选择的顺序发送。
 */

/**
 * 串行执行附件队列
 * @param items - 待处理的附件列表
 * @param process - 单个附件处理函数，返回 true 继续下一个，false 停止
 * @returns 是否全部处理成功
 */
export async function runAttachmentQueue<T>(
  items: T[],
  process: (item: T) => Promise<boolean>,
) {
  for (const item of items) {
    if (!await process(item)) return false
  }
  return true
}

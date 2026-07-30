/**
 * 从后端文件下载地址中提取文件 ID。
 *
 * 同时支持相对地址、完整服务器地址以及带查询参数或锚点的地址。
 * 非本系统文件下载地址返回空字符串。
 */
export function extractFileDownloadId(source = ''): string {
  return source.match(/\/api\/files\/download\/(\d+)(?:[?#]|$)/)?.[1] || ''
}

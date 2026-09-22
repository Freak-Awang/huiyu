/** All resource URLs stay relative to Vite's base, including packaged file:// pages. */
export function getBuiltinEmojiUrl(file: string, base = import.meta.env.BASE_URL || './'): string {
  if (file !== 'manifest.v1.json' && !/^images\/smile\/[^/\\.]+\.png$/.test(file)) {
    throw new Error('Invalid builtin emoji resource path')
  }
  return `${base.endsWith('/') ? base : `${base}/`}emoji/builtin/${file}`
}

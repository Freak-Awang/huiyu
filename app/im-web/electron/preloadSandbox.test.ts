import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Electron preload sandbox compatibility', () => {
  it('does not import unrestricted Node built-in modules', () => {
    const preloadSource = readFileSync(new URL('./preload.cts', import.meta.url), 'utf8')

    expect(preloadSource).not.toMatch(/(?:from\s+|require\()['"]node:/)
  })
})

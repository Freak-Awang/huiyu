/**
 * 全局滚动条自动隐藏：
 * 元素发生滚动（滚轮、键盘、拖动等）时为其添加 `sb-visible` 类名使滚动条显现，
 * 停止滚动 2 秒后移除类名，滚动条自动隐藏。
 */
const HIDE_DELAY = 2000

const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>()

function resolveElement(target: EventTarget | null): Element | null {
  if (target === document || target === window || target === document.body) {
    return document.documentElement
  }
  return target instanceof Element ? target : null
}

function showScrollbar(el: Element) {
  el.classList.add('sb-visible')
  const prev = timers.get(el)
  if (prev) clearTimeout(prev)
  timers.set(
    el,
    setTimeout(() => {
      el.classList.remove('sb-visible')
      timers.delete(el)
    }, HIDE_DELAY)
  )
}

function handleScroll(event: Event) {
  const el = resolveElement(event.target)
  if (el) showScrollbar(el)
}

function handleWheel(event: Event) {
  // 滚轮在不可滚动的元素上移动时无需处理；
  // 找到事件路径中最近的可滚动祖先并显示其滚动条。
  const path = event.composedPath()
  for (const node of path) {
    if (!(node instanceof Element)) continue
    const style = getComputedStyle(node)
    if (
      node.scrollHeight > node.clientHeight &&
      /(auto|scroll)/.test(style.overflowY)
    ) {
      showScrollbar(node)
      return
    }
  }
}

export function setupAutoHideScrollbar() {
  document.addEventListener('scroll', handleScroll, { capture: true, passive: true })
  document.addEventListener('wheel', handleWheel, { capture: true, passive: true })
}

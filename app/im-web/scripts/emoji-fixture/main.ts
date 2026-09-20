import { createApp } from 'vue'
import Fixture from './Fixture.vue'
import '../../src/style.css'

// Count active global listeners/observers across repeated picker/editor mounts.
const selectionListeners = new Set<EventListenerOrEventListenerObject>()
const addListener = document.addEventListener.bind(document)
const removeListener = document.removeEventListener.bind(document)
document.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
  if (type === 'selectionchange') selectionListeners.add(listener)
  addListener(type, listener, options)
}) as typeof document.addEventListener
document.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
  if (type === 'selectionchange') selectionListeners.delete(listener)
  removeListener(type, listener, options)
}) as typeof document.removeEventListener
const observers = new Set<ResizeObserver>()
const NativeObserver = ResizeObserver
window.ResizeObserver = class extends NativeObserver {
  override observe(target: Element, options?: ResizeObserverOptions): void { observers.add(this); super.observe(target, options) }
  override disconnect(): void { observers.delete(this); super.disconnect() }
}
declare global { interface Window { emojiLifetimes: () => { selection: number; resize: number } } }
window.emojiLifetimes = () => ({ selection: selectionListeners.size, resize: observers.size })
createApp(Fixture).mount('#app')

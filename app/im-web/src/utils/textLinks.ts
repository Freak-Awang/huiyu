/** Keep whitespace and mention boundaries intact; URL validation remains at rendering and command execution. */
export function splitTextLinks(text: string): string[] {
  return text.split(/(https?:\/\/[^\s<>"'，。！？；、（）【】]+)/gi).filter(Boolean)
}

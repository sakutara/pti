import { vi } from './vi'

export type MessageKey = keyof typeof vi

// Prefix of the marker returned for keys that have no translation.
export const MISSING = '⟦'

const messages: Record<string, string> = vi

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

// Looks up a Vietnamese message and fills `{name}` placeholders from params.
// Unknown placeholders are left as-is; unknown keys return `⟦key⟧`.
export function t(key: MessageKey | string, params?: Record<string, string | number>): string {
  if (!hasOwn(messages, key)) return `${MISSING}${key}⟧`
  const template = messages[key] as string
  return template.replace(/\{(\w+)\}/g, (match: string, name: string) =>
    params && hasOwn(params, name) ? String(params[name]) : match,
  )
}

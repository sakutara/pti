import { signal } from '@preact/signals'
import { registerSW } from 'virtual:pwa-register'

export const updateAvailable = signal(false)
let update: ((reload?: boolean) => Promise<void>) | undefined

export function initPWA() {
  update = registerSW({
    onNeedRefresh() { updateAvailable.value = true },
  })
}

export const applyUpdate = () => update?.(true)

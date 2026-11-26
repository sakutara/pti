import type { ComponentProps } from 'preact'
import { Icon } from './Icon'

type Props = Omit<ComponentProps<'button'>, 'icon' | 'label'> & {
  /** File name in src/icons/ without .svg */
  icon: string
  /** Accessible name in the UI language. Always required, even when not shown. */
  label: string
  /** Show the label next to the icon (first-use primary CTAs, destructive actions). */
  showLabel?: boolean
  /** Toggle buttons: sets aria-pressed and switches to `<icon>-filled` when it exists. */
  pressed?: boolean
  variant?: 'ghost' | 'primary' | 'danger'
}

const VARIANT = {
  ghost: 'text-ink hover:bg-surface-2',
  primary: 'bg-accent text-surface hover:brightness-110',
  danger: 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950',
}

export function IconButton({ icon, label, showLabel = false, pressed, variant = 'ghost', class: cls = '', ...rest }: Props) {
  const name = pressed ? `${icon}-filled` : icon
  return (
    <button
      type="button"
      aria-label={showLabel ? undefined : label}
      aria-pressed={pressed}
      class={`group relative inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-2.5 transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${VARIANT[variant]} ${cls}`}
      {...rest}
    >
      <Icon name={name} />
      {showLabel ? (
        <span class="text-fluid-sm font-medium">{label}</span>
      ) : (
        // Tooltip for pointer hover and keyboard focus; long-press shows it on touch via :active.
        <span role="tooltip" class="pointer-events-none absolute top-full z-30 mt-1 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-surface opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100">
          {label}
        </span>
      )}
    </button>
  )
}

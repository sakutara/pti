// Icons are hand-drawn SVGs in src/icons/ (see references/iconography.md), bundled at build
// time so they work offline. tests/unit/icons.test.ts enforces the house rules, which is what
// makes inlining them safe.
const files = import.meta.glob('../icons/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export const icons: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, svg]) => [path.split('/').pop()!.replace(/\.svg$/, ''), svg]),
)

export type IconProps = { name: string; class?: string }

/** Decorative icon: the accessible name comes from the surrounding control. */
export function Icon({ name, class: cls = 'size-6' }: IconProps) {
  const svg = icons[name]
  if (!svg && import.meta.env.DEV) console.warn(`Icon "${name}" is missing from src/icons/`)
  return <span aria-hidden="true" class={`inline-flex shrink-0 [&>svg]:size-full ${cls}`} dangerouslySetInnerHTML={{ __html: svg ?? '' }} />
}

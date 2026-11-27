import { useState } from 'preact/hooks'
import { formatBenefit } from '../domain/benefits'
import type { BenefitsDataset, MemberType, Tier } from '../domain/benefits-schema'
import { t } from '../i18n'
import { IconButton } from './IconButton'

const TIERS: Tier[] = [1, 2, 3, 4]

const TAB =
  'min-h-11 flex-1 rounded-xl px-2 text-fluid-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent bg-surface-2 text-ink aria-selected:bg-accent aria-selected:text-surface'

/**
 * Compares the four tiers of one member type. Opens from a button: a table on wide screens,
 * and below lg a full-screen sheet with one tier tab at a time (starting on the person's tier).
 */
export function TierCompare({ dataset, memberType, tier }: { dataset: BenefitsDataset; memberType: MemberType; tier: Tier }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<Tier>(tier)

  // Benefits this member type can claim, in dataset order.
  const rows = dataset.benefits.filter((b) => b.values[memberType] !== null)
  const valueOf = (benefit: (typeof rows)[number], at: Tier): string => formatBenefit(benefit, at, memberType) ?? ''

  return (
    <>
      <IconButton
        icon="compare"
        label={t('benefits.compare')}
        showLabel
        class="justify-self-start"
        onClick={() => {
          setActive(tier)
          setOpen(true)
        }}
      />

      {open && (
        <section
          role="dialog"
          aria-modal="true"
          aria-label={t('benefits.compare')}
          class="fixed inset-0 z-30 grid auto-rows-max content-start gap-4 overflow-y-auto overflow-x-hidden bg-surface p-gutter lg:static lg:z-auto lg:p-0"
        >
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-fluid-lg font-semibold text-ink">{t('benefits.compare')}</h3>
            <IconButton icon="close" label={t('common.close')} onClick={() => setOpen(false)} />
          </div>

          <table aria-label={t('benefits.compare')} class="hidden w-full text-left text-fluid-sm lg:table">
            <thead>
              <tr>
                <th scope="col" class="py-2 pr-2 font-semibold text-ink">
                  {t('benefits.compareColumn')}
                </th>
                {TIERS.map((at) => (
                  <th
                    key={at}
                    scope="col"
                    aria-current={at === tier ? 'true' : undefined}
                    class="px-2 py-2 font-semibold text-ink aria-[current=true]:text-accent"
                  >
                    {t('home.tier', { tier: at })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((benefit) => (
                <tr key={benefit.id} class="border-t border-surface-2">
                  <th scope="row" class="py-2 pr-2 font-normal text-ink">
                    {benefit.title}
                  </th>
                  {TIERS.map((at) => (
                    <td key={at} class="px-2 py-2 text-ink">
                      {valueOf(benefit, at)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <div class="grid gap-4">
            <div role="tablist" aria-label={t('benefits.compare')} class="flex gap-2 lg:hidden">
              {TIERS.map((at) => (
                <button
                  key={at}
                  type="button"
                  role="tab"
                  id={`tier-tab-${at}`}
                  aria-selected={at === active}
                  aria-controls="tier-panel"
                  tabIndex={at === active ? 0 : -1}
                  class={TAB}
                  onClick={() => setActive(at)}
                >
                  {t('home.tier', { tier: at })}
                </button>
              ))}
            </div>
            <div role="tabpanel" id="tier-panel" aria-labelledby={`tier-tab-${active}`} class="grid gap-3 lg:hidden">
              {rows.map((benefit) => (
                <div key={benefit.id} class="grid gap-0.5 border-t border-surface-2 pt-3">
                  <p class="text-fluid-base text-ink">{benefit.title}</p>
                  <p class="text-fluid-base font-semibold text-ink">{valueOf(benefit, active)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  )
}

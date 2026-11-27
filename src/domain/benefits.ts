import { t } from '../i18n'
import { formatVnd } from '../lib/money'
import {
  CATEGORIES,
  type Benefit,
  type BenefitsDataset,
  type Category,
  type MemberType,
  type Tier,
  type Unit,
} from './benefits-schema'

export interface BenefitLine {
  benefit: Benefit
  text: string
}

export interface CategoryGroup {
  category: Category
  covered: boolean
  copayPercent: number | null
  benefits: BenefitLine[]
}

/**
 * Picks the policy year whose [effectiveFrom, effectiveTo] range contains `date`
 * (YYYY-MM-DD, both ends inclusive). Returns null when none does. If ranges overlap
 * (bad data), the one that started latest wins.
 */
export function pickPolicyYear(
  datasets: readonly BenefitsDataset[],
  date: string,
): BenefitsDataset | null {
  let best: BenefitsDataset | null = null
  for (const d of datasets) {
    if (d.effectiveFrom <= date && date <= d.effectiveTo) {
      if (best === null || d.effectiveFrom > best.effectiveFrom) best = d
    }
  }
  return best
}

function unitSuffix(unit: Unit): string {
  switch (unit) {
    case 'year':
      return t('benefits.unit.year')
    case 'visit':
      return t('benefits.unit.visit')
    case 'day':
      return t('benefits.unit.day')
    case 'case':
      return t('benefits.unit.case')
    case 'actual':
    case 'sumInsured':
      return ''
  }
}

// Text for a benefit that has values for this member type (caller checks that).
function textFor(benefit: Benefit, tier: Tier, memberType: MemberType): string {
  const values = benefit.values[memberType] ?? []
  const value = values[tier - 1] ?? null
  if (value === null) return t('benefits.noOwnLimit')
  if (typeof value === 'number') return `${formatVnd(value)}${unitSuffix(benefit.unit)}`
  if (value === 'actual') return t('benefits.actual')
  return value
}

/** Display text for one benefit at (tier, memberType); null when the member type has no such benefit. */
export function formatBenefit(benefit: Benefit, tier: Tier, memberType: MemberType): string | null {
  if (benefit.values[memberType] === null) return null
  return textFor(benefit, tier, memberType)
}

/** One group per category in fixed order; `covered` is false when no benefit applies to the member type. */
export function benefitsFor(
  dataset: BenefitsDataset,
  tier: Tier,
  memberType: MemberType,
): CategoryGroup[] {
  return CATEGORIES.map((category) => {
    const benefits: BenefitLine[] = dataset.benefits
      .filter((b) => b.category === category && b.values[memberType] !== null)
      .map((benefit) => ({ benefit, text: textFor(benefit, tier, memberType) }))
    return {
      category,
      covered: benefits.length > 0,
      copayPercent: dataset.copayPercent[category]?.[memberType] ?? null,
      benefits,
    }
  })
}

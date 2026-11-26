import { useEffect, useRef, useState } from 'preact/hooks'
import { db, now } from '../db/db'
import { createAccount } from '../data/account-repo'
import { loadAccount } from '../data/account-state'
import { requestPersistence } from '../data/backup'
import { todayIso } from '../lib/dates'
import { navigate } from '../router'
import { t } from '../i18n'
import type { PersonInput } from '../domain/types'
import { IconButton } from '../ui/IconButton'
import { LegalLinks } from '../ui/LegalLinks'
import { PersonForm } from '../ui/PersonForm'

const STANDALONE_QUERY = '(display-mode: standalone)'

/** True when running as an installed app. Without matchMedia we cannot tell, so the hint may show. */
function isStandalone(): boolean {
  if (typeof window.matchMedia !== 'function') return false
  return window.matchMedia(STANDALONE_QUERY).matches
}

const EMPTY_HOLDER: PersonInput = {
  role: 'holder',
  relation: 'self',
  memberType: 'employee',
  fullName: '',
  dateOfBirth: '',
  idNumber: null,
  phone: null,
  email: null,
  address: null,
  employeeCode: null,
  jobTitle: null,
  tier: 1,
  policyholderName: null,
  contractCode: null,
  cardNumber: null,
  cardValidFrom: null,
  cardValidTo: null,
  bank: null,
}

const trimOrNull = (value: string | null): string | null => {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

/** Trims text before storage; empty optional fields become null. */
function normalise(input: PersonInput): PersonInput {
  return {
    ...input,
    fullName: input.fullName.trim(),
    idNumber: trimOrNull(input.idNumber),
    phone: trimOrNull(input.phone),
    email: trimOrNull(input.email),
    address: trimOrNull(input.address),
    employeeCode: trimOrNull(input.employeeCode),
    jobTitle: trimOrNull(input.jobTitle),
    policyholderName: trimOrNull(input.policyholderName),
    contractCode: trimOrNull(input.contractCode),
    cardNumber: trimOrNull(input.cardNumber),
    cardValidFrom: trimOrNull(input.cardValidFrom),
    cardValidTo: trimOrNull(input.cardValidTo),
  }
}

export function Onboarding({ today = todayIso() }: { today?: string }) {
  const [holder, setHolder] = useState<PersonInput>(EMPTY_HOLDER)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showHint, setShowHint] = useState(false)
  const busy = useRef(false)
  const [pending, setPending] = useState(false)
  const hintRef = useRef<HTMLDivElement>(null)

  // IconButton does not forward refs, so focus the first button (the close control) inside the card.
  useEffect(() => {
    if (showHint) hintRef.current?.querySelector('button')?.focus()
  }, [showHint])

  async function finish() {
    navigate('/')
    await loadAccount(db)
  }

  async function onSubmit(event: Event) {
    event.preventDefault()
    if (busy.current) return
    busy.current = true
    setPending(true)

    const result = await createAccount(db, normalise(holder), today)
    if (!result.ok) {
      setErrors(result.errors)
      busy.current = false
      setPending(false)
      return
    }
    setErrors({})

    const persisted = await requestPersistence()
    await db.settings.put({ key: 'persisted', value: persisted, updatedAt: now() })

    const hintShown = (await db.settings.get('installHintShown'))?.value === true
    if (!isStandalone() && !hintShown) {
      await db.settings.put({ key: 'installHintShown', value: true, updatedAt: now() })
      setShowHint(true)
      return
    }
    await finish()
  }

  function closeHint() {
    setShowHint(false)
    void finish()
  }

  return (
    <section class="mx-auto grid max-w-xl gap-6 p-4">
      <h2 class="text-fluid-xl font-semibold text-ink">{t('onboarding.title')}</h2>
      <p class="text-fluid-base text-ink-muted">{t('onboarding.intro')}</p>

      <form noValidate class="grid gap-6" onSubmit={onSubmit}>
        <PersonForm value={holder} errors={errors} onChange={setHolder} mode="holder" />
        <IconButton
          type="submit"
          icon="chevron-right"
          label={t('onboarding.submit')}
          showLabel
          variant="primary"
          disabled={pending}
          class="w-full justify-center"
        />
      </form>

      <LegalLinks class="justify-center" />

      {showHint && (
        <div class="fixed inset-0 z-40 flex items-end justify-center bg-ink/50 p-4 sm:items-center">
          <div
            ref={hintRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-hint-title"
            class="w-full max-w-xl rounded-2xl bg-surface p-4 shadow-lg grid gap-3"
          >
            <h3 id="install-hint-title" class="text-fluid-lg font-semibold text-ink">
              {t('onboarding.installHintTitle')}
            </h3>
            <p class="text-fluid-base text-ink">
              {t('onboarding.installHint')}
            </p>
            <div class="flex justify-end">
              <IconButton icon="close" label={t('common.close')} showLabel variant="primary" onClick={closeHint} />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

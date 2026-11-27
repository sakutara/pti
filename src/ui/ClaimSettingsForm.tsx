import { useEffect, useState } from 'preact/hooks'
import { refreshAccount } from '../data/account-state'
import { updateAccount } from '../data/account-repo'
import { db } from '../db/db'
import { loadAdministrator } from '../data/administrators'
import { claimRouting, routingToStore } from '../domain/email'
import type { AdministratorConfig } from '../domain/requirements-schema'
import type { Account, BankAccount } from '../domain/types'
import { t } from '../i18n'
import { BankSelect } from './BankSelect'
import { GmailConnect } from './GmailConnect'

const INPUT_CLASS =
  'mt-1 block w-full min-h-11 rounded-xl border border-surface-2 bg-surface px-3 text-fluid-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-[invalid=true]:border-red-600'
const LABEL_CLASS = 'block text-fluid-sm font-medium text-ink'
const ERROR_CLASS = 'mt-1 text-fluid-sm text-red-600 dark:text-red-400'
const SUBMIT_CLASS =
  'min-h-11 justify-self-start rounded-xl bg-accent px-6 text-fluid-base font-medium text-surface hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60'

/** Text form of a bank account. Every field is a string so inputs stay controlled. */
export type BankDraft = { bankName: string; accountName: string; accountNumber: string; bankAddress: string }

export const EMPTY_BANK_DRAFT: BankDraft = { bankName: '', accountName: '', accountNumber: '', bankAddress: '' }

export function bankToDraft(bank: BankAccount | null): BankDraft {
  if (!bank) return EMPTY_BANK_DRAFT
  return {
    bankName: bank.bankName,
    accountName: bank.accountName,
    accountNumber: bank.accountNumber,
    bankAddress: bank.bankAddress ?? '',
  }
}

/**
 * All-empty draft means "no bank" (null). Any filled field makes the other three required.
 * The optional address is only stored when present.
 */
export function draftToBank(
  draft: BankDraft,
): { ok: true; bank: BankAccount | null } | { ok: false; errors: Record<string, string> } {
  const bankName = draft.bankName.trim()
  const accountName = draft.accountName.trim()
  const accountNumber = draft.accountNumber.trim()
  const bankAddress = draft.bankAddress.trim()
  if (bankName === '' && accountName === '' && accountNumber === '' && bankAddress === '') {
    return { ok: true, bank: null }
  }

  const errors: Record<string, string> = {}
  if (bankName === '') errors.bankName = 'error.required'
  if (accountName === '') errors.accountName = 'error.required'
  if (accountNumber === '') errors.accountNumber = 'error.required'
  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    bank: {
      bankName,
      accountName,
      accountNumber,
      ...(bankAddress === '' ? {} : { bankAddress }),
    },
  }
}

const BANK_ROWS: { field: keyof BankDraft; label: string }[] = [
  { field: 'bankName', label: 'account.bank.bankName' },
  { field: 'accountName', label: 'account.bank.accountName' },
  { field: 'accountNumber', label: 'account.bank.accountNumber' },
  { field: 'bankAddress', label: 'account.bank.bankAddress' },
]

export interface BankFieldsProps {
  /** Prefix for element ids so several bank blocks can share a page. */
  idPrefix: string
  value: BankDraft
  errors: Record<string, string>
  onChange(value: BankDraft): void
}

/** Bank (picked from the NAPAS list), account holder, account number and optional branch address. */
export function BankFields({ idPrefix, value, errors, onChange }: BankFieldsProps) {
  return (
    <div class="grid gap-4">
      {BANK_ROWS.map(({ field, label }) => {
        const id = `${idPrefix}-${field}`
        const error = errors[field]
        const describedBy = error === undefined ? undefined : `${id}-error`
        return (
          <div key={field}>
            <label class={LABEL_CLASS} for={id}>
              {t(label)}
            </label>
            {field === 'bankName' ? (
              <BankSelect
                id={id}
                value={value.bankName}
                invalid={error !== undefined}
                describedBy={describedBy}
                onChange={(bankName) => onChange({ ...value, bankName })}
              />
            ) : (
              <input
                id={id}
                name={field}
                type="text"
                inputMode={field === 'accountNumber' ? 'numeric' : undefined}
                autoComplete="off"
                class={INPUT_CLASS}
                value={value[field]}
                aria-invalid={error === undefined ? undefined : 'true'}
                aria-describedby={describedBy}
                onInput={(e) => onChange({ ...value, [field]: e.currentTarget.value })}
              />
            )}
            {error === undefined ? null : (
              <p id={`${id}-error`} class={ERROR_CLASS}>
                {t(error)}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Settings shared by every insured person of the account. */
export function ClaimSettingsForm({ account }: { account: Account }) {
  const [administrator, setAdministrator] = useState<AdministratorConfig | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [claimEmail, setClaimEmail] = useState('')
  const [claimCc, setClaimCc] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState(false)

  // The fields start from what will be used: the account's own values, else the administrator defaults.
  useEffect(() => {
    let alive = true
    void loadAdministrator(account.administrator).then((loaded) => {
      if (!alive) return
      if (!loaded) {
        setLoadFailed(true)
        setClaimEmail(account.claimEmail ?? '')
        setClaimCc(account.claimCc.join(', '))
        return
      }
      const routing = claimRouting(account, loaded)
      setAdministrator(loaded)
      setClaimEmail(routing.to)
      setClaimCc(routing.cc.join(', '))
    })
    return () => {
      alive = false
    }
  }, [account.id, account.administrator])

  async function onSubmit(event: Event) {
    event.preventDefault()
    setSaved(false)
    const typed = { to: claimEmail, cc: claimCc.split(',') }
    const required: Record<string, string> = {}
    if (typed.to.trim() === '') required.claimEmail = 'error.required'
    if (typed.cc.every((e) => e.trim() === '')) required.claimCc = 'error.required'
    if (Object.keys(required).length > 0) {
      setErrors(required)
      return
    }

    const stored = administrator
      ? routingToStore(typed, administrator)
      : { claimEmail: typed.to, claimCc: typed.cc }
    setPending(true)
    const result = await updateAccount(db, { administrator: 'marsh', ...stored })
    setPending(false)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    await refreshAccount()
    setSaved(true)
  }

  const emailError = errors.claimEmail
  const ccError = errors.claimCc

  return (
    <section aria-labelledby="claim-settings-heading" class="grid gap-4 rounded-xl border border-surface-2 p-4">
      <div class="grid gap-1">
        <h2 id="claim-settings-heading" class="text-fluid-lg font-semibold text-ink">
          {t('account.claimSettings')}
        </h2>
        <p class="text-fluid-sm text-ink-muted">{t('account.claimSettingsShared')}</p>
      </div>

      <form noValidate class="grid gap-4" onSubmit={onSubmit}>
        <div>
          <label class={LABEL_CLASS} for="claim-administrator">
            {t('account.administrator')}
          </label>
          <input
            id="claim-administrator"
            name="administrator"
            type="text"
            readOnly
            aria-readonly="true"
            class={`${INPUT_CLASS} bg-surface-2 text-ink-muted`}
            value={administrator?.name ?? t('account.administrator.marsh')}
          />
          <p class="mt-1 text-fluid-sm text-ink-muted">{t('account.administratorFixed')}</p>
        </div>

        <div>
          <label class={LABEL_CLASS} for="claim-email">
            {t('account.claimEmail')}
          </label>
          <input
            id="claim-email"
            name="claimEmail"
            type="email"
            inputMode="email"
            autoComplete="off"
            required
            class={INPUT_CLASS}
            value={claimEmail}
            aria-invalid={emailError === undefined ? undefined : 'true'}
            aria-describedby={emailError === undefined ? undefined : 'claim-email-error'}
            onInput={(e) => setClaimEmail(e.currentTarget.value)}
          />
          {emailError === undefined ? null : (
            <p id="claim-email-error" class={ERROR_CLASS}>
              {t(emailError)}
            </p>
          )}
        </div>

        <div>
          <label class={LABEL_CLASS} for="claim-cc">
            {t('account.claimCc')}
          </label>
          <input
            id="claim-cc"
            name="claimCc"
            type="text"
            inputMode="email"
            autoComplete="off"
            required
            class={INPUT_CLASS}
            value={claimCc}
            aria-invalid={ccError === undefined ? undefined : 'true'}
            aria-describedby={ccError === undefined ? undefined : 'claim-cc-error'}
            onInput={(e) => setClaimCc(e.currentTarget.value)}
          />
          {ccError === undefined ? null : (
            <p id="claim-cc-error" class={ERROR_CLASS}>
              {t(ccError)}
            </p>
          )}
        </div>

        {loadFailed ? (
          <p role="alert" class="text-fluid-sm text-red-600 dark:text-red-400">
            {t('account.administratorLoadFailed')}
          </p>
        ) : null}

        <button type="submit" disabled={pending} class={SUBMIT_CLASS}>
          {t('common.save')}
        </button>
        {saved ? (
          <p role="status" class="text-fluid-sm text-ink">
            {t('common.saved')}
          </p>
        ) : null}
      </form>

      <GmailConnect />
    </section>
  )
}

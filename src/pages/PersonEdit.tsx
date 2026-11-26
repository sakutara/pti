import { useEffect, useState } from 'preact/hooks'
import { accountState } from '../data/account-state'
import { canDelete, deletePerson, getPerson, listPersons, savePerson } from '../data/persons-repo'
import { db } from '../db/db'
import type { Person, PersonInput, Tier } from '../domain/types'
import { t } from '../i18n'
import { todayIso } from '../lib/dates'
import { navigate, route } from '../router'
import { BankFields, bankToDraft, draftToBank, EMPTY_BANK_DRAFT, type BankDraft } from '../ui/ClaimSettingsForm'
import { CardImagePicker } from '../ui/CardImagePicker'
import { IconButton } from '../ui/IconButton'
import { PersonForm } from '../ui/PersonForm'

/** Route segment that means "add a new dependent". */
const NEW_ID = 'new'

const SAVE_CLASS =
  'min-h-11 justify-self-start rounded-xl bg-accent px-6 text-fluid-base font-medium text-surface hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60'

/** Defaults for a new dependent: spouse, sponsored, same tier as the holder. */
function emptyDependent(tier: Tier): PersonInput {
  return {
    role: 'dependent',
    relation: 'spouse',
    memberType: 'sponsored',
    fullName: '',
    dateOfBirth: '',
    idNumber: null,
    phone: null,
    email: null,
    address: null,
    employeeCode: null,
    jobTitle: null,
    tier,
    policyholderName: null,
    contractCode: null,
    cardNumber: null,
    cardValidFrom: null,
    cardValidTo: null,
    bank: null,
  }
}

/** Add or edit one person. The holder can be edited but never deleted. */
export function PersonEdit() {
  const state = accountState.value
  const accountId = state.status === 'ready' ? state.account.id : undefined
  const id = route.value.params.id ?? NEW_ID
  const isNew = id === NEW_ID

  const [person, setPerson] = useState<Person | undefined>(undefined)
  const [form, setForm] = useState<PersonInput | undefined>(undefined)
  const [bank, setBank] = useState<BankDraft>(EMPTY_BANK_DRAFT)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notFound, setNotFound] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!accountId) return
    let alive = true
    setPerson(undefined)
    setForm(undefined)
    setNotFound(false)
    setErrors({})
    void (async () => {
      if (isNew) {
        const holder = (await listPersons(db, accountId)).find((p) => p.role === 'holder')
        if (!alive) return
        setForm(emptyDependent(holder?.tier ?? 1))
        setBank(EMPTY_BANK_DRAFT)
        return
      }
      const found = await getPerson(db, id)
      if (!alive) return
      if (!found || found.accountId !== accountId) {
        setNotFound(true)
        return
      }
      setPerson(found)
      setForm(found)
      setBank(bankToDraft(found.bank))
    })()
    return () => {
      alive = false
    }
  }, [accountId, id, isNew])

  async function refreshPerson() {
    if (!person) return
    const fresh = await getPerson(db, person.id)
    if (fresh) setPerson(fresh)
  }

  async function onSubmit(event: Event) {
    event.preventDefault()
    if (!form || !accountId || pending) return
    const bankResult = draftToBank(bank)
    if (!bankResult.ok) {
      setErrors(bankResult.errors)
      return
    }

    setPending(true)
    const result = await savePerson(db, accountId, { ...form, bank: bankResult.bank }, todayIso())
    setPending(false)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    navigate('/account')
  }

  async function onDelete() {
    if (!person || !canDelete(person)) return
    if (!window.confirm(t('common.confirmDelete', { name: person.fullName }))) return
    await deletePerson(db, person.id)
    navigate('/account')
  }

  const back = <IconButton icon="chevron-left" label={t('common.back')} onClick={() => navigate('/account')} />

  if (notFound) {
    return (
      <section class="mx-auto grid max-w-xl gap-4 py-4">
        {back}
        <p class="text-fluid-base text-ink-muted">{t('person.notFound')}</p>
      </section>
    )
  }

  if (!accountId || !form) {
    return <p class="py-4 text-fluid-base text-ink-muted">{t('common.loading')}</p>
  }

  return (
    <section class="mx-auto grid max-w-xl gap-6 py-4">
      <div class="flex items-center gap-2">
        {back}
        <h2 class="text-fluid-xl font-semibold text-ink">{person?.fullName ?? t('account.addDependent')}</h2>
      </div>

      <form noValidate class="grid gap-6" onSubmit={onSubmit}>
        <PersonForm
          value={form}
          errors={errors}
          onChange={setForm}
          mode={form.role === 'holder' ? 'holder' : 'dependent'}
        />

        <fieldset class="grid gap-3 rounded-xl border border-surface-2 p-3">
          <legend class="px-1 text-fluid-base font-medium text-ink">{t('person.bank')}</legend>
          <p class="text-fluid-sm text-ink-muted">{t('person.bankFallback')}</p>
          <BankFields idPrefix="bank" value={bank} errors={errors} onChange={setBank} />
        </fieldset>

        {errors.role === undefined ? null : (
          <p role="alert" class="text-fluid-sm text-red-600 dark:text-red-400">
            {t(errors.role)}
          </p>
        )}

        <button type="submit" disabled={pending} class={SAVE_CLASS}>
          {t('common.save')}
        </button>
      </form>

      {person !== undefined && (
        <section aria-labelledby="person-cards-heading" class="grid gap-3">
          <h3 id="person-cards-heading" class="text-fluid-lg font-semibold text-ink">
            {t('person.cards')}
          </h3>
          <CardImagePicker
            personId={person.id}
            kind="card-front"
            fileId={person.cardFrontFileId}
            onSaved={() => void refreshPerson()}
          />
          <CardImagePicker
            personId={person.id}
            kind="card-back"
            fileId={person.cardBackFileId}
            onSaved={() => void refreshPerson()}
          />
        </section>
      )}

      {person !== undefined && canDelete(person) && (
        <IconButton
          icon="trash"
          variant="danger"
          showLabel
          label={t('common.delete')}
          class="justify-self-start"
          onClick={() => void onDelete()}
        />
      )}
    </section>
  )
}

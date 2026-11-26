import { useEffect, useRef, useState } from 'preact/hooks'
import { accountState } from '../data/account-state'
import { getBlob } from '../data/files-repo'
import { listPersons } from '../data/persons-repo'
import { db } from '../db/db'
import type { Person } from '../domain/types'
import { t } from '../i18n'
import { formatDateVi } from '../lib/format-date'
import { navigate, route } from '../router'
import { IconButton } from '../ui/IconButton'

interface WalletCard {
  person: Person
  front?: string
  back?: string
}

const SWIPE_PX = 50

/** Local calendar date as YYYY-MM-DD. */
function todayLocal(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

async function objectUrlFor(fileId: string | null, created: string[]): Promise<string | undefined> {
  if (!fileId) return undefined
  const blob = await getBlob(db, fileId)
  if (!blob) return undefined
  const url = URL.createObjectURL(blob)
  created.push(url)
  return url
}

/** Persons of the account that have at least one card image, holder first. Local data only. */
async function loadCards(accountId: string): Promise<{ cards: WalletCard[]; urls: string[] }> {
  const urls: string[] = []
  const cards: WalletCard[] = []
  for (const person of await listPersons(db, accountId)) {
    const front = await objectUrlFor(person.cardFrontFileId, urls)
    const back = await objectUrlFor(person.cardBackFileId, urls)
    if (front || back) cards.push({ person, front, back })
  }
  return { cards, urls }
}

/** Full-screen card viewer that moves between persons with card images. */
export function CardWallet({ today = todayLocal() }: { today?: string }) {
  const state = accountState.value
  const accountId = state.status === 'ready' ? state.account.id : null
  const startId = route.value.params.personId
  const [cards, setCards] = useState<WalletCard[] | null>(null)
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const swipeStart = useRef<number | null>(null)

  useEffect(() => {
    if (accountId === null) return
    let alive = true
    let urls: string[] = []
    loadCards(accountId)
      .then((result) => {
        if (!alive) {
          result.urls.forEach((u) => URL.revokeObjectURL(u))
          return
        }
        urls = result.urls
        const start = Math.max(0, result.cards.findIndex((c) => c.person.id === startId))
        setCards(result.cards)
        setIndex(start)
        setFlipped(false)
      })
      .catch(() => {
        if (alive) setCards([])
      })
    return () => {
      alive = false
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [accountId, startId])

  const list = cards ?? []
  const current = list.length > 0 ? list[Math.min(index, list.length - 1)] : undefined

  function go(delta: number) {
    const next = index + delta
    if (next < 0 || next >= list.length) return
    setIndex(next)
    setFlipped(false)
  }

  function onPointerUp(e: PointerEvent) {
    const start = swipeStart.current
    swipeStart.current = null
    if (start === null) return
    const dx = e.clientX - start
    if (dx <= -SWIPE_PX) go(1)
    else if (dx >= SWIPE_PX) go(-1)
  }

  const loading = cards === null && accountId !== null

  // The back is shown when flipped, or when there is no front image.
  const showBack = current !== undefined && (current.front === undefined || (flipped && current.back !== undefined))
  const shownUrl = current ? (showBack ? current.back : current.front) : undefined

  const person = current?.person
  const validFrom = person?.cardValidFrom ?? null
  const validTo = person?.cardValidTo ?? null
  const validity =
    validFrom !== null || validTo !== null
      ? `${validFrom !== null ? formatDateVi(validFrom) : '—'} – ${validTo !== null ? formatDateVi(validTo) : '—'}`
      : null
  const expired = validTo !== null && validTo < today

  return (
    <section
      class="fixed inset-0 z-40 flex flex-col overflow-hidden bg-black text-white"
      onPointerDown={(e) => {
        swipeStart.current = e.clientX
      }}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        swipeStart.current = null
      }}
    >
      <header class="absolute inset-x-0 top-0 z-20 flex justify-end p-2">
        <IconButton icon="close" label={t('common.close')} class="!text-white" onClick={() => navigate('/')} />
      </header>

      {loading ? (
        <p class="m-auto text-fluid-base">{t('common.loading')}</p>
      ) : current === undefined || shownUrl === undefined || person === undefined ? (
        <p class="m-auto px-6 text-center text-fluid-lg">{t('card.none')}</p>
      ) : (
        <>
          <img
            src={shownUrl}
            alt={t('card.alt', { name: person.fullName })}
            class="absolute inset-0 size-full object-contain"
          />

          <IconButton
            icon="chevron-left"
            label={t('common.previous')}
            class="absolute top-1/2 left-1 z-20 -translate-y-1/2 !text-white"
            disabled={index === 0}
            onClick={() => go(-1)}
          />
          <IconButton
            icon="chevron-right"
            label={t('common.next')}
            class="absolute top-1/2 right-1 z-20 -translate-y-1/2 !text-white"
            disabled={index >= list.length - 1}
            onClick={() => go(1)}
          />

          <div class="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1 bg-black/70 p-4 pb-6">
            {expired ? (
              <p role="alert" class="self-start rounded-md bg-red-600 px-2 py-1 text-fluid-sm font-semibold text-white">
                {t('card.expired')}
              </p>
            ) : null}
            <h2 class="text-fluid-lg font-semibold">{person.fullName}</h2>
            {person.cardNumber ? <p class="text-fluid-base">{person.cardNumber}</p> : null}
            {validity ? <p class="text-fluid-sm">{validity}</p> : null}
            {current.front && current.back ? (
              <button
                type="button"
                class="mt-2 min-h-11 self-start rounded-xl border border-white px-4 text-fluid-sm font-medium"
                onClick={() => setFlipped((f) => !f)}
              >
                {showBack ? t('card.showFront') : t('card.showBack')}
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  )
}

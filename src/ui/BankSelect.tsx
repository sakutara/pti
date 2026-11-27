import { useEffect, useMemo, useState } from 'preact/hooks'
import { bankLabel, findBankByLabel, searchBanks, type BankInfo } from '../domain/banks'
import { t } from '../i18n'

const INPUT_CLASS =
  'mt-1 block w-full min-h-11 rounded-xl border border-surface-2 bg-surface px-3 text-fluid-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-[invalid=true]:border-red-600'

export interface BankSelectProps {
  id: string
  /** Tên ngân hàng đang lưu (bankLabel của ngân hàng đã chọn, hoặc chữ cũ nhập tay). */
  value: string
  onChange(bankName: string): void
  invalid?: boolean
  describedBy?: string
}

const shortLabel = (b: BankInfo) => `${b.name} (${b.code})`

/**
 * Ô chọn ngân hàng có tìm nhanh (chép từ chia-tien, BankSelect): gõ tên/mã không cần dấu để lọc, bấm một dòng để chọn.
 * Chỉ chọn được ngân hàng trong danh sách; tên cũ nhập tay vẫn hiện cho đến khi chọn lại.
 */
export function BankSelect({ id, value, onChange, invalid, describedBy }: BankSelectProps) {
  const selected = findBankByLabel(value)
  const shown = selected ? shortLabel(selected) : value
  const [query, setQuery] = useState(shown)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = `${id}-list`
  useEffect(() => setQuery(shown), [shown])
  const results = useMemo(() => (query === shown ? searchBanks('') : searchBanks(query)), [query, shown])

  function pick(b: BankInfo) {
    onChange(bankLabel(b))
    setQuery(shortLabel(b))
    setOpen(false)
  }

  return (
    <div class="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid ? 'true' : undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        placeholder={t('bank.searchPlaceholder')}
        class={INPUT_CLASS}
        value={query}
        onFocus={(e) => {
          setOpen(true)
          e.currentTarget.select()
        }}
        onInput={(e) => {
          setQuery(e.currentTarget.value)
          setActive(0)
          setOpen(true)
        }}
        onBlur={() =>
          window.setTimeout(() => {
            setOpen(false)
            // Gõ dở rồi rời ô thì trả chữ về ngân hàng đang chọn.
            setQuery(shown)
          }, 120)
        }
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setActive((i) => Math.min(i + 1, results.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter' && open && results[active]) {
            e.preventDefault()
            pick(results[active])
          } else if (e.key === 'Escape' && open) {
            e.stopPropagation()
            setOpen(false)
          }
        }}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t('bank.list')}
          class="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-surface-2 bg-surface p-1 shadow-lg"
        >
          {results.length === 0 && <li class="px-3 py-2 text-fluid-sm text-ink-muted">{t('bank.notFound')}</li>}
          {results.map((b, i) => (
            <li
              key={b.bin}
              role="option"
              aria-selected={selected?.bin === b.bin}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(b)
              }}
              class={`grid min-h-11 cursor-pointer content-center rounded-lg px-3 py-1.5 text-fluid-sm text-ink ${i === active ? 'bg-surface-2' : ''} ${selected?.bin === b.bin ? 'font-semibold' : ''}`}
            >
              <span>{shortLabel(b)}</span>
              <span class="text-ink-muted">{b.fullName}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

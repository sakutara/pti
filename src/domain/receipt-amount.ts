import { foldVi } from '../lib/text'
import type { OcrCandidate } from './document-types'

/** Rule 3: labels by priority. (a) 4, (b) 3, (c) 2 are high confidence; (d) 1 is low. Folded text. */
const LABELS: ReadonlyArray<{ phrase: string; priority: number }> = [
  { phrase: 'nguoi benh phai tra', priority: 4 },
  { phrase: 'benh nhan phai tra', priority: 4 },
  { phrase: 'nguoi benh tra', priority: 4 },
  { phrase: 'tong tien thanh toan', priority: 3 },
  { phrase: 'tong cong tien thanh toan', priority: 3 },
  { phrase: 'tong thanh toan', priority: 3 },
  { phrase: 'khach phai tra', priority: 3 },
  { phrase: 'tong cong', priority: 2 },
  { phrase: 'tong tien', priority: 2 },
  { phrase: 'thanh tien', priority: 1 },
]

/** Rule 4: lines containing these phrases are never used as label or amount source. Folded text. */
const IGNORED_PHRASES = [
  'khach dua',
  'tien thua',
  'tra lai',
  'thue suat',
  'ma so thue',
  'dien thoai',
  'so tai khoan',
]

/**
 * Rule 2: a grouped amount, thousands separated by one consistent character (. , or space),
 * optionally followed by a ,00 or .00 decimal part. Ungrouped numbers and other decimals never match.
 */
const AMOUNT_PATTERN =
  /(?<![\d.,])(\d{1,3}(?:\.\d{3})+|\d{1,3}(?:,\d{3})+|\d{1,3}(?:[  ]\d{3})+)(?:[.,]00)?(?![\d]|[.,]\d)/g

const MIN_AMOUNT = 1000
const MAX_AMOUNT = 1_000_000_000

interface Amount { amount: number; at: number }

/** Valid amounts in a line, in reading order. */
function amountsIn(line: string): Amount[] {
  const found: Amount[] = []
  for (const match of line.matchAll(AMOUNT_PATTERN)) {
    const value = Number(match[1].replace(/\D/g, ''))
    if (value >= MIN_AMOUNT && value <= MAX_AMOUNT) found.push({ amount: value, at: match.index })
  }
  return found
}

/** The highest-priority label present in a folded line, or null. Ties keep list order. */
function labelOf(folded: string): { phrase: string; priority: number } | null {
  let best: { phrase: string; priority: number } | null = null
  for (const label of LABELS) {
    if (folded.includes(label.phrase) && (best === null || label.priority > best.priority)) best = label
  }
  return best
}

/**
 * Proposes the amount the patient has to pay from recognised lines.
 * `candidates` are de-duplicated and best first; `best` is candidates[0] or null.
 * With no label anywhere, every grouped amount is a low-confidence candidate, largest first.
 */
export function extractTotal(lines: string[]): { candidates: OcrCandidate[]; best: OcrCandidate | null } {
  const folded = lines.map(foldVi)
  const ignored = folded.map((text) => IGNORED_PHRASES.some((phrase) => text.includes(phrase)))

  interface Labelled extends Amount { label: string; priority: number; line: number }
  const labelled: Labelled[] = []

  for (const [index, raw] of lines.entries()) {
    if (ignored[index]) continue
    const label = labelOf(folded[index])
    if (!label) continue

    // Rule 3: the number is on the label's line, or else on the line right after it.
    let source = index
    if (amountsIn(raw).length === 0) {
      if (index + 1 >= lines.length || ignored[index + 1]) continue
      source = index + 1
    }
    for (const found of amountsIn(lines[source])) {
      labelled.push({ ...found, label: label.phrase, priority: label.priority, line: source })
    }
  }

  if (labelled.length > 0) {
    // Rule 5: higher priority first; within a priority, the amount that appears last first.
    labelled.sort((a, b) => b.priority - a.priority || b.line - a.line || b.at - a.at)
    const seen = new Set<number>()
    const candidates: OcrCandidate[] = []
    for (const entry of labelled) {
      if (seen.has(entry.amount)) continue
      seen.add(entry.amount)
      candidates.push({
        amount: entry.amount,
        label: entry.label,
        confidence: entry.priority >= 2 ? 'high' : 'low',
      })
    }
    return { candidates, best: candidates[0] }
  }

  const values = new Set<number>()
  for (const [index, raw] of lines.entries()) {
    if (ignored[index]) continue
    for (const found of amountsIn(raw)) values.add(found.amount)
  }
  const candidates: OcrCandidate[] = [...values]
    .sort((a, b) => b - a)
    .map((amount) => ({ amount, label: '', confidence: 'low' }))
  return { candidates, best: candidates.length > 0 ? candidates[0] : null }
}

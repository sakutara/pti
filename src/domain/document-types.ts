/** Document categories, in the order the UI lists them. */
export const DOC_CATEGORIES = [
  'invoice',
  'invoice-breakdown',
  'prescription',
  'medical-record',
  'lab-order',
  'lab-result',
  'treatment-plan',
  'dental-record',
  'xray',
  'discharge',
  'surgery-cert',
  'transfer',
  'pre-admission',
  'post-discharge',
  'other',
] as const

export type DocCategory = (typeof DOC_CATEGORIES)[number]
export type AmountSource = 'ocr' | 'manual'
export type OcrStatus = 'none' | 'pending' | 'done' | 'failed'

/** One amount proposed from the recognised text. Lists are ordered best first. */
export interface OcrCandidate {
  amount: number
  /** Folded label phrase that matched (e.g. "tong thanh toan"), or '' when none matched. */
  label: string
  confidence: 'high' | 'low'
}

export interface DocumentRecord {
  id: string
  personId: string | null
  /** null until the claim change attaches the document to a claim. */
  claimId: string | null
  category: DocCategory
  /** Files in page order: JPEG pages or one PDF e-invoice. */
  fileIds: string[]
  /** YYYY-MM-DD */
  docDate: string | null
  /** Whole VND, invoices only. */
  amount: number | null
  amountSource: AmountSource | null
  amountConfirmed: boolean
  ocrStatus: OcrStatus
  ocrText: string | null
  ocrCandidates: OcrCandidate[]
  /** True when an image of the document is under 1200 px on its longest edge: shown as a warning, still stored. */
  lowResolution: boolean
  createdAt: number
  updatedAt: number
  deleted: 0 | 1
}

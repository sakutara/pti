/*
 * Reads a card photo on the device: prepare (grey, contrast, scale) → VietOCR → parseCardText. A fresh worker is made
 * per card and stopped afterwards, so the ~100 MB model is not kept in memory on the person page.
 */
import { parseCardText, type CardFields } from '../domain/card-ocr'
import { createOcrEngine, type OcrEngine } from '../lib/ocr-engine'
import { prepareForOcr } from '../lib/imagePreprocess'
import { todayIso } from '../lib/dates'

export interface CardScanDeps {
  createEngine?: () => OcrEngine
  prepare?: (image: Blob) => Promise<Blob>
  today?: () => string
}

export async function readCardFields(image: Blob, deps: CardScanDeps = {}): Promise<CardFields> {
  const engine = (deps.createEngine ?? createOcrEngine)()
  try {
    const prepared = await (deps.prepare ?? prepareForOcr)(image)
    const lines = await engine.recognize(prepared)
    return parseCardText(lines, (deps.today ?? todayIso)())
  } finally {
    engine.terminate()
  }
}

/*
 * Reads a card photo on the device twice (prepared: grey, contrast, scale; and as taken) → VietOCR → parseCardText,
 * then merges both readings. A fresh worker is made
 * per card and stopped afterwards, so the ~100 MB model is not kept in memory on the person page.
 */
import { mergeCardFields, parseCardText, type CardFields } from '../domain/card-ocr'
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
    const today = (deps.today ?? todayIso)()
    const prepared = await (deps.prepare ?? prepareForOcr)(image)
    const first = parseCardText(await engine.recognize(prepared), today)
    // Second reading of the untouched photo: it keeps word spacing the high-contrast copy can lose.
    const second = parseCardText(await engine.recognize(image), today)
    return mergeCardFields(first, second)
  } finally {
    engine.terminate()
  }
}

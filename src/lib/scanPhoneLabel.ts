import { createWorker, PSM } from 'tesseract.js'
import { buildSourceCanvas, createProcessedCanvas } from './imageTools'
import { parsePhoneMetadata } from './parsePhoneMetadata'
import type { BarcodeMatch, PhoneLabelScanResult, ScanProgress } from '../types'

type NativeBarcodeResult = {
  barcodes: BarcodeMatch[]
  supported: boolean
}

type NativeBarcodeDetector = {
  detect(image: HTMLCanvasElement): Promise<Array<{ format: string; rawValue: string }>>
}

type NativeBarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): NativeBarcodeDetector
  getSupportedFormats(): Promise<string[]>
}

let workerPromise: Promise<Tesseract.Worker> | null = null
let activeProgressListener: ((progress: ScanProgress) => void) | null = null

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function formatStatus(status: string) {
  return status
    .split(/[_\s]+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

async function getWorker(progressListener?: (progress: ScanProgress) => void) {
  activeProgressListener = progressListener ?? null

  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      logger: (message) => {
        if (!activeProgressListener) {
          return
        }

        activeProgressListener({
          label: `OCR: ${formatStatus(message.status)}`,
          value: clamp(0.24 + message.progress * 0.58, 0.24, 0.86),
        })
      },
    })
  }

  return workerPromise
}

async function detectBarcodes(canvas: HTMLCanvasElement): Promise<NativeBarcodeResult> {
  const detectorApi = (
    globalThis as typeof globalThis & {
      BarcodeDetector?: NativeBarcodeDetectorConstructor
    }
  ).BarcodeDetector

  if (!detectorApi) {
    return {
      barcodes: [],
      supported: false,
    }
  }

  try {
    const supportedFormats = await detectorApi.getSupportedFormats()
    const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'].filter(
      (format) => supportedFormats.includes(format),
    )

    const detector = new detectorApi(formats.length ? { formats } : undefined)
    const barcodes = await detector.detect(canvas)

    return {
      supported: true,
      barcodes: [...new Map(
        barcodes
          .filter((barcode) => barcode.rawValue?.trim())
          .map((barcode) => [
            `${barcode.format}:${barcode.rawValue}`,
            {
              format: barcode.format,
              rawValue: barcode.rawValue.trim(),
            },
          ]),
      ).values()],
    }
  } catch {
    return {
      barcodes: [],
      supported: true,
    }
  }
}

function mergeWholeImageText(primaryText: string, secondaryText: string) {
  const primaryLines = primaryText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const secondaryLines = secondaryText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const merged = [...primaryLines]

  for (const line of secondaryLines) {
    if (
      /\b(?:IMEI|MEID|EID|Serial|Model|UPC|EAN|GTIN|iPhone|Galaxy|Pixel|Xiaomi|OnePlus|OPPO|vivo|realme|Motorola|Nothing|Huawei|Honor|Xperia|Nokia)\b/i.test(
        line,
      ) &&
      !merged.includes(line)
    ) {
      merged.push(line)
    }
  }

  return merged.join('\n')
}

function needsFallbackPass(parsed: PhoneLabelScanResult['parsed']) {
  return !(
    parsed.deviceName &&
    parsed.skuCode &&
    parsed.modelNumber &&
    (parsed.serialNumber || parsed.imeis.length || parsed.eids.length)
  )
}

export async function scanPhoneLabel(
  file: File,
  onProgress?: (progress: ScanProgress) => void,
): Promise<PhoneLabelScanResult> {
  let maxProgress = 0
  const emitProgress = (progress: ScanProgress) => {
    maxProgress = Math.max(maxProgress, progress.value)
    onProgress?.({
      label: progress.label,
      value: maxProgress,
    })
  }

  emitProgress({
    label: 'Preparing image',
    value: 0.08,
  })

  const sourceCanvas = await buildSourceCanvas(file)
  const generalCanvas = createProcessedCanvas(sourceCanvas, 'general')

  emitProgress({
    label: 'Checking barcode area',
    value: 0.16,
  })

  const barcodePromise = detectBarcodes(sourceCanvas)
  const worker = await getWorker(emitProgress)

  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
    tessedit_char_whitelist:
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /:-(),.+',
  })

  emitProgress({
    label: 'Running OCR',
    value: 0.22,
  })

  const [generalResult, barcodeResult] = await Promise.all([
    worker.recognize(generalCanvas),
    barcodePromise,
  ])

  emitProgress({
    label: 'Extracting fields from OCR text',
    value: 0.92,
  })

  let mergedText = generalResult.data.text
  let parsed = parsePhoneMetadata(mergedText, barcodeResult.barcodes)
  let finalConfidence = generalResult.data.confidence

  if (needsFallbackPass(parsed.metadata)) {
    emitProgress({
      label: 'Retrying numeric text',
      value: 0.94,
    })

    const digitsCanvas = createProcessedCanvas(sourceCanvas, 'digits')
    const digitsResult = await worker.recognize(digitsCanvas)
    mergedText = mergeWholeImageText(generalResult.data.text, digitsResult.data.text)
    parsed = parsePhoneMetadata(mergedText, barcodeResult.barcodes)
    finalConfidence =
      (generalResult.data.confidence + digitsResult.data.confidence) / 2
  }

  emitProgress({
    label: 'Scan finished',
    value: 1,
  })

  return {
    rawText: mergedText,
    normalizedText: parsed.normalizedText,
    ocrConfidence: finalConfidence,
    barcodes: barcodeResult.barcodes,
    barcodeDetectorSupported: barcodeResult.supported,
    parsed: parsed.metadata,
  }
}

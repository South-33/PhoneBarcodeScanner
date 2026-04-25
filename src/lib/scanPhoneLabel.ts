import { createWorker, PSM } from 'tesseract.js'
import { buildOcrCanvas } from './imageTools'
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
          value: clamp(0.25 + message.progress * 0.65, 0.25, 0.9),
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

    const detector = new detectorApi(
      formats.length
        ? {
            formats,
          }
        : undefined,
    )

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

export async function scanPhoneLabel(
  file: File,
  onProgress?: (progress: ScanProgress) => void,
): Promise<PhoneLabelScanResult> {
  onProgress?.({
    label: 'Preparing image',
    value: 0.08,
  })

  const canvas = await buildOcrCanvas(file)

  onProgress?.({
    label: 'Checking barcode area',
    value: 0.18,
  })

  const barcodePromise = detectBarcodes(canvas)
  const worker = await getWorker(onProgress)

  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
  })

  const [{ data }, barcodeResult] = await Promise.all([
    worker.recognize(canvas, {}, { blocks: true }),
    barcodePromise,
  ])

  onProgress?.({
    label: 'Cleaning structured fields',
    value: 0.96,
  })

  const parsed = parsePhoneMetadata(data.text, barcodeResult.barcodes)

  onProgress?.({
    label: 'Scan finished',
    value: 1,
  })

  return {
    rawText: data.text,
    normalizedText: parsed.normalizedText,
    ocrConfidence: data.confidence,
    barcodes: barcodeResult.barcodes,
    barcodeDetectorSupported: barcodeResult.supported,
    parsed: parsed.metadata,
  }
}

import { createWorker, PSM } from 'tesseract.js'
import {
  buildSourceCanvas,
  createCropCanvas,
  createProcessedCanvas,
} from './imageTools'
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

type OcrTask = {
  label: string
  canvas: HTMLCanvasElement
  psm: Tesseract.PSM
  whitelist?: string
}

type OcrTaskResult = {
  label: string
  text: string
  confidence: number
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
          value: clamp(0.22 + message.progress * 0.62, 0.22, 0.88),
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

async function recognizeTask(worker: Tesseract.Worker, task: OcrTask) {
  await worker.setParameters({
    tessedit_pageseg_mode: task.psm,
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
    tessedit_char_whitelist: task.whitelist ?? '',
  })

  const { data } = await worker.recognize(task.canvas)
  return {
    label: task.label,
    text: data.text.trim(),
    confidence: data.confidence,
  }
}

function normalizeDigits(value: string) {
  return value.replace(/\D/g, '')
}

function validateUpcA(code: string) {
  if (!/^\d{12}$/.test(code)) {
    return false
  }

  const digits = code.split('').map(Number)
  const checkDigit = digits[11] ?? 0
  const sumOdd =
    (digits[0] ?? 0) +
    (digits[2] ?? 0) +
    (digits[4] ?? 0) +
    (digits[6] ?? 0) +
    (digits[8] ?? 0) +
    (digits[10] ?? 0)
  const sumEven =
    (digits[1] ?? 0) +
    (digits[3] ?? 0) +
    (digits[5] ?? 0) +
    (digits[7] ?? 0) +
    (digits[9] ?? 0)

  const expected = (10 - ((sumOdd * 3 + sumEven) % 10)) % 10
  return expected === checkDigit
}

function validateEan13(code: string) {
  if (!/^\d{13}$/.test(code)) {
    return false
  }

  const digits = code.split('').map(Number)
  const checkDigit = digits[12] ?? 0
  let sum = 0

  for (let index = 0; index < 12; index += 1) {
    sum += (digits[index] ?? 0) * (index % 2 === 0 ? 1 : 3)
  }

  const expected = (10 - (sum % 10)) % 10
  return expected === checkDigit
}

function extractBarcodeDigits(text: string) {
  const compact = normalizeDigits(text)

  for (let length = 12; length <= 13; length += 1) {
    for (let index = 0; index <= compact.length - length; index += 1) {
      const candidate = compact.slice(index, index + length)
      if (
        (length === 12 && validateUpcA(candidate)) ||
        (length === 13 && validateEan13(candidate))
      ) {
        return candidate
      }
    }
  }

  if (compact.length === 12 || compact.length === 13) {
    return compact
  }

  return undefined
}

function normalizeIdentifierLine(
  label: string,
  text: string,
) {
  const compactText = text.replace(/\s+/g, ' ').trim()

  switch (label) {
    case 'eid-line': {
      const digits = normalizeDigits(compactText)
      return digits.length >= 24 ? `EID ${digits}` : compactText
    }
    case 'imei-line': {
      const digits = normalizeDigits(compactText)
      return digits.length >= 14 ? `IMEI ${digits.slice(0, 15)}` : compactText
    }
    case 'meid-line': {
      const digits = normalizeDigits(compactText)
      return digits.length >= 14 ? `IMEI/MEID ${digits.slice(0, 15)}` : compactText
    }
    case 'serial-line': {
      const candidate = compactText
        .replace(/[^A-Za-z0-9]/g, ' ')
        .split(/\s+/)
        .find((token) => /[A-Z]/i.test(token) && /\d/.test(token) && token.length >= 8)

      return candidate ? `Serial No. ${candidate.toUpperCase()}` : compactText
    }
    case 'barcode-digits': {
      const code = extractBarcodeDigits(compactText)
      return code ? `UPC ${code}` : compactText
    }
    default:
      return compactText
  }
}

function buildTargetedTasks(sourceCanvas: HTMLCanvasElement) {
  const generalCanvas = createProcessedCanvas(sourceCanvas, 'general')

  const tasks: OcrTask[] = [
    {
      label: 'full-label',
      canvas: generalCanvas,
      psm: PSM.SPARSE_TEXT,
    },
    {
      label: 'product-line',
      canvas: createCropCanvas(
        sourceCanvas,
        { left: 0.01, top: 0.19, width: 0.50, height: 0.08 },
        'general',
        4,
      ),
      psm: PSM.SINGLE_LINE,
      whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ,./-+',
    },
    {
      label: 'description-model',
      canvas: createCropCanvas(
        sourceCanvas,
        { left: 0.01, top: 0.22, width: 0.56, height: 0.12 },
        'general',
        3.2,
      ),
      psm: PSM.SPARSE_TEXT,
      whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ,./-+',
    },
    {
      label: 'eid-line',
      canvas: createCropCanvas(
        sourceCanvas,
        { left: 0.0, top: 0.31, width: 0.53, height: 0.055 },
        'digits',
        4,
      ),
      psm: PSM.SINGLE_LINE,
      whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /:-',
    },
    {
      label: 'imei-line',
      canvas: createCropCanvas(
        sourceCanvas,
        { left: 0.0, top: 0.39, width: 0.44, height: 0.055 },
        'digits',
        4,
      ),
      psm: PSM.SINGLE_LINE,
      whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /:-',
    },
    {
      label: 'serial-line',
      canvas: createCropCanvas(
        sourceCanvas,
        { left: 0.0, top: 0.47, width: 0.49, height: 0.065 },
        'digits',
        4,
      ),
      psm: PSM.SINGLE_LINE,
      whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /:-()',
    },
    {
      label: 'meid-line',
      canvas: createCropCanvas(
        sourceCanvas,
        { left: 0.0, top: 0.56, width: 0.45, height: 0.055 },
        'digits',
        4,
      ),
      psm: PSM.SINGLE_LINE,
      whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /:-',
    },
    {
      label: 'identifier-block',
      canvas: createCropCanvas(
        sourceCanvas,
        { left: 0.0, top: 0.31, width: 0.53, height: 0.32 },
        'digits',
        3.2,
      ),
      psm: PSM.SPARSE_TEXT,
      whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /:-()',
    },
    {
      label: 'barcode-digits',
      canvas: createCropCanvas(
        sourceCanvas,
        { left: 0.62, top: 0.335, width: 0.34, height: 0.10 },
        'digits',
        5,
      ),
      psm: PSM.SINGLE_LINE,
      whitelist: '0123456789 UPCEAN',
    },
    {
      label: 'barcode-digits-wide',
      canvas: createCropCanvas(
        sourceCanvas,
        { left: 0.58, top: 0.32, width: 0.40, height: 0.14 },
        'digits',
        4,
      ),
      psm: PSM.SINGLE_BLOCK,
      whitelist: '0123456789 UPCEAN',
    },
    {
      label: 'barcode-area',
      canvas: createCropCanvas(
        sourceCanvas,
        { left: 0.56, top: 0.28, width: 0.42, height: 0.20 },
        'binary',
        3,
      ),
      psm: PSM.SPARSE_TEXT,
      whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ',
    },
    {
      label: 'serial-imei-lower',
      canvas: createCropCanvas(
        sourceCanvas,
        { left: 0.0, top: 0.42, width: 0.54, height: 0.24 },
        'digits',
        3,
      ),
      psm: PSM.SPARSE_TEXT,
      whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /:-()',
    },
    {
      label: 'upper-identifiers',
      canvas: createCropCanvas(
        sourceCanvas,
        { left: 0.0, top: 0.29, width: 0.58, height: 0.18 },
        'digits',
        3,
      ),
      psm: PSM.SPARSE_TEXT,
      whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /:-()',
    },
    {
      label: 'lower-left-close',
      canvas: createCropCanvas(
        sourceCanvas,
        { left: 0.0, top: 0.30, width: 0.56, height: 0.36 },
        'general',
        2.8,
      ),
      psm: PSM.SPARSE_TEXT,
      whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /:-(),.',
    },
    {
      label: 'sku-focus',
      canvas: createCropCanvas(
        sourceCanvas,
        { left: 0.0, top: 0.18, width: 0.28, height: 0.06 },
        'general',
        5,
      ),
      psm: PSM.SINGLE_LINE,
      whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /:-',
    },
    {
      label: 'product-line-wide',
      canvas: createCropCanvas(
        sourceCanvas,
        { left: 0.0, top: 0.18, width: 0.58, height: 0.09 },
        'general',
        3.5,
      ),
      psm: PSM.SINGLE_BLOCK,
      whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ,./-+',
    },
    {
      label: 'description-model-wide',
      canvas: createCropCanvas(
        sourceCanvas,
        { left: 0.0, top: 0.22, width: 0.60, height: 0.16 },
        'general',
        2.8,
      ),
      psm: PSM.SPARSE_TEXT,
      whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ,./-+',
    },
    {
      label: 'full-label-source',
      canvas: createProcessedCanvas(sourceCanvas, 'source'),
      psm: PSM.SPARSE_TEXT,
    },
    {
      label: 'full-label-binary',
      canvas: createProcessedCanvas(sourceCanvas, 'binary'),
      psm: PSM.SPARSE_TEXT,
    },
    {
      label: 'full-label-general',
      canvas: generalCanvas,
      psm: PSM.SPARSE_TEXT,
    },
    {
      label: 'full-label-digits',
      canvas: createProcessedCanvas(sourceCanvas, 'digits'),
      psm: PSM.SPARSE_TEXT,
      whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /:-(),.',
    },
    {
      label: 'legacy-full-label',
      canvas: generalCanvas,
      psm: PSM.SPARSE_TEXT,
      whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /:-(),.',
    },
    {
      label: 'barcode-digits-fallback',
      canvas: createCropCanvas(
        sourceCanvas,
        { left: 0.62, top: 0.34, width: 0.34, height: 0.11 },
        'general',
        4,
      ),
      psm: PSM.SINGLE_LINE,
      whitelist: '0123456789 UPCEAN',
    },
  ]

  return {
    generalCanvas,
    tasks,
  }
}

function mergeTextCandidates(
  results: OcrTaskResult[],
) {
  const sections: string[] = []

  for (const result of results) {
    if (!result.text) {
      continue
    }

    sections.push(normalizeIdentifierLine(result.label, result.text))
  }

  return sections.join('\n')
}

export async function scanPhoneLabel(
  file: File,
  onProgress?: (progress: ScanProgress) => void,
): Promise<PhoneLabelScanResult> {
  onProgress?.({
    label: 'Preparing image',
    value: 0.08,
  })

  const sourceCanvas = await buildSourceCanvas(file)
  const { tasks } = buildTargetedTasks(sourceCanvas)

  onProgress?.({
    label: 'Checking barcode area',
    value: 0.16,
  })

  const barcodePromise = detectBarcodes(sourceCanvas)
  const worker = await getWorker(onProgress)

  const taskResults: OcrTaskResult[] = []

  for (const [index, task] of tasks.entries()) {
    onProgress?.({
      label: `Reading ${task.label.replace(/-/g, ' ')}`,
      value: clamp(0.18 + ((index + 1) / tasks.length) * 0.58, 0.18, 0.82),
    })

    taskResults.push(await recognizeTask(worker, task))
  }

  const barcodeResult = await barcodePromise
  const mergedText = mergeTextCandidates(taskResults)
  const barcodeTaskMatches = taskResults
    .filter((result) => result.label.includes('barcode'))
    .map((result) => extractBarcodeDigits(result.text))
    .filter((value): value is string => Boolean(value))
    .map((rawValue) => ({
      format: rawValue.length === 13 ? 'ean_13' : 'upc_a',
      rawValue,
    }))

  const mergedBarcodes = [...new Map(
    [...barcodeResult.barcodes, ...barcodeTaskMatches].map((barcode) => [
      `${barcode.format}:${barcode.rawValue}`,
      barcode,
    ]),
  ).values()]

  const parsed = parsePhoneMetadata(mergedText, mergedBarcodes)

  onProgress?.({
    label: 'Cleaning structured fields',
    value: 0.94,
  })

  const averageConfidence =
    taskResults.reduce((sum, result) => sum + result.confidence, 0) /
    Math.max(taskResults.length, 1)

  onProgress?.({
    label: 'Scan finished',
    value: 1,
  })

  return {
    rawText: mergedText,
    normalizedText: parsed.normalizedText,
    ocrConfidence: averageConfidence,
    barcodes: mergedBarcodes,
    barcodeDetectorSupported: barcodeResult.supported,
    parsed: parsed.metadata,
  }
}

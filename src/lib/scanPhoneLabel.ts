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
        { left: 0.02, top: 0.20, width: 0.56, height: 0.14 },
        'general',
        3,
      ),
      psm: PSM.SINGLE_BLOCK,
      whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ,./-+',
    },
    {
      label: 'description-model',
      canvas: createCropCanvas(
        sourceCanvas,
        { left: 0.02, top: 0.22, width: 0.60, height: 0.20 },
        'general',
        2.8,
      ),
      psm: PSM.SPARSE_TEXT,
      whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ,./-+',
    },
    {
      label: 'upper-identifiers',
      canvas: createCropCanvas(
        sourceCanvas,
        { left: 0.02, top: 0.29, width: 0.58, height: 0.18 },
        'digits',
        3,
      ),
      psm: PSM.SPARSE_TEXT,
      whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /:-',
    },
    {
      label: 'serial-imei-lower',
      canvas: createCropCanvas(
        sourceCanvas,
        { left: 0.02, top: 0.42, width: 0.54, height: 0.24 },
        'digits',
        3,
      ),
      psm: PSM.SPARSE_TEXT,
      whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /:-',
    },
    {
      label: 'barcode-digits',
      canvas: createCropCanvas(
        sourceCanvas,
        { left: 0.62, top: 0.34, width: 0.34, height: 0.11 },
        'digits',
        4,
      ),
      psm: PSM.SINGLE_LINE,
      whitelist: '0123456789 UPCEANGTIN',
    },
  ]

  return {
    generalCanvas,
    tasks,
  }
}

function mergeTextCandidates(
  results: Array<{ label: string; text: string; confidence: number }>,
) {
  const sections: string[] = []

  for (const result of results) {
    if (!result.text) {
      continue
    }

    sections.push(result.text)
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

  const taskResults: Array<{ label: string; text: string; confidence: number }> = []

  for (const [index, task] of tasks.entries()) {
    onProgress?.({
      label: `Reading ${task.label.replace(/-/g, ' ')}`,
      value: clamp(0.18 + ((index + 1) / tasks.length) * 0.58, 0.18, 0.82),
    })

    taskResults.push(await recognizeTask(worker, task))
  }

  const barcodeResult = await barcodePromise
  const mergedText = mergeTextCandidates(taskResults)
  const parsed = parsePhoneMetadata(mergedText, barcodeResult.barcodes)

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
    barcodes: barcodeResult.barcodes,
    barcodeDetectorSupported: barcodeResult.supported,
    parsed: parsed.metadata,
  }
}

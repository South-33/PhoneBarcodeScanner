import { createWorker, PSM } from 'tesseract.js'
import { createCropCanvas, createProcessedCanvas, releaseCanvas } from './imageTools'
import type { ScanProgress } from '../types'

type OcrProviderResult = {
  text: string
  confidence: number
  provider: 'tesseract'
}

type OcrPass = {
  label: string
  createCanvas: () => HTMLCanvasElement
  psm: PSM
  whitelist: string
  progress: number
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

function mergeUniqueLines(texts: string[]) {
  return [...new Set(
    texts
      .join('\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  )].join('\n')
}

export async function runOcrProvider(
  sourceCanvas: HTMLCanvasElement,
  onProgress?: (progress: ScanProgress) => void,
  shouldStop?: (text: string) => boolean,
): Promise<OcrProviderResult> {
  const worker = await getWorker(onProgress)
  const passes: OcrPass[] = [
    {
      label: 'OCR: normal label text',
      createCanvas: () => createProcessedCanvas(sourceCanvas, 'general'),
      psm: PSM.SPARSE_TEXT,
      whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /:-(),.+',
      progress: 0.24,
    },
    {
      label: 'OCR: structured text block',
      createCanvas: () => createProcessedCanvas(sourceCanvas, 'binary'),
      psm: PSM.SINGLE_BLOCK,
      whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /:-(),.+',
      progress: 0.58,
    },
    {
      label: 'OCR: identifier digits',
      createCanvas: () => createProcessedCanvas(sourceCanvas, 'digits'),
      psm: PSM.SPARSE_TEXT,
      whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 /:-.',
      progress: 0.78,
    },
    {
      label: 'OCR: identifier strip',
      createCanvas: () =>
        createCropCanvas(
          sourceCanvas,
          { left: 0.04, top: 0.24, width: 0.92, height: 0.62 },
          'screen',
          2.4,
        ),
      psm: PSM.SPARSE_TEXT,
      whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /:-(),.+',
      progress: 0.84,
    },
    {
      label: 'OCR: identifier strip digits',
      createCanvas: () =>
        createCropCanvas(
          sourceCanvas,
          { left: 0.04, top: 0.34, width: 0.88, height: 0.42 },
          'digits',
          2.8,
        ),
      psm: PSM.SPARSE_TEXT,
      whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 /:-.',
      progress: 0.86,
    },
    {
      label: 'OCR: screen glare cleanup',
      createCanvas: () => createProcessedCanvas(sourceCanvas, 'screen'),
      psm: PSM.SPARSE_TEXT,
      whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /:-(),.+',
      progress: 0.88,
    },
  ]

  const texts: string[] = []
  const confidences: number[] = []

  for (const pass of passes) {
    onProgress?.({
      label: pass.label,
      value: pass.progress,
    })

    await worker.setParameters({
      tessedit_pageseg_mode: pass.psm,
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
      tessedit_char_whitelist: pass.whitelist,
    })

    const passCanvas = pass.createCanvas()

    try {
      const result = await worker.recognize(passCanvas)
      texts.push(result.data.text)
      confidences.push(result.data.confidence)
    } finally {
      releaseCanvas(passCanvas)
    }

    const mergedText = mergeUniqueLines(texts)
    if (shouldStop?.(mergedText)) {
      return {
        text: mergedText,
        confidence:
          confidences.reduce((total, value) => total + value, 0) / confidences.length,
        provider: 'tesseract',
      }
    }
  }

  return {
    text: mergeUniqueLines(texts),
    confidence: confidences.reduce((total, value) => total + value, 0) / confidences.length,
    provider: 'tesseract',
  }
}

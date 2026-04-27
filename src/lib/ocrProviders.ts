import { createWorker, PSM } from 'tesseract.js'
import { createProcessedCanvas } from './imageTools'
import type { ScanProgress } from '../types'

type OcrProviderResult = {
  text: string
  confidence: number
  provider: 'tesseract'
}

type OcrPass = {
  label: string
  canvas: HTMLCanvasElement
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
      canvas: createProcessedCanvas(sourceCanvas, 'general'),
      psm: PSM.SPARSE_TEXT,
      whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /:-(),.+',
      progress: 0.24,
    },
    {
      label: 'OCR: structured text block',
      canvas: createProcessedCanvas(sourceCanvas, 'binary'),
      psm: PSM.SINGLE_BLOCK,
      whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /:-(),.+',
      progress: 0.58,
    },
    {
      label: 'OCR: identifier digits',
      canvas: createProcessedCanvas(sourceCanvas, 'digits'),
      psm: PSM.SPARSE_TEXT,
      whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 /:-.',
      progress: 0.78,
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

    const result = await worker.recognize(pass.canvas)
    texts.push(result.data.text)
    confidences.push(result.data.confidence)

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

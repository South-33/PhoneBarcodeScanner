import { createWorker, PSM } from 'tesseract.js'
import type { ScanProgress } from '../types'

type OcrProviderResult = {
  text: string
  confidence: number
  provider: 'tesseract' | 'google_vision'
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

function canvasToBase64Png(canvas: HTMLCanvasElement) {
  const dataUrl = canvas.toDataURL('image/png')
  const [, base64 = ''] = dataUrl.split(',')
  return base64
}

async function runGoogleVisionOcr(
  canvas: HTMLCanvasElement,
  apiKey: string,
  onProgress?: (progress: ScanProgress) => void,
): Promise<OcrProviderResult> {
  onProgress?.({
    label: 'OCR: Google Vision request',
    value: 0.32,
  })

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            image: {
              content: canvasToBase64Png(canvas),
            },
            features: [
              {
                type: 'DOCUMENT_TEXT_DETECTION',
              },
            ],
          },
        ],
      }),
    },
  )

  if (!response.ok) {
    throw new Error(`Google Vision OCR failed with status ${response.status}.`)
  }

  const data = (await response.json()) as {
    responses?: Array<{
      fullTextAnnotation?: { text?: string }
      error?: { message?: string }
    }>
  }

  const firstResponse = data.responses?.[0]

  if (firstResponse?.error?.message) {
    throw new Error(firstResponse.error.message)
  }

  onProgress?.({
    label: 'OCR: Google Vision response received',
    value: 0.86,
  })

  return {
    text: firstResponse?.fullTextAnnotation?.text?.trim() ?? '',
    confidence: 96,
    provider: 'google_vision',
  }
}

async function runTesseractOcr(
  generalCanvas: HTMLCanvasElement,
  sourceCanvas: HTMLCanvasElement,
  onProgress?: (progress: ScanProgress) => void,
): Promise<OcrProviderResult> {
  const worker = await getWorker(onProgress)

  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
    tessedit_char_whitelist:
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /:-(),.+',
  })

  onProgress?.({
    label: 'Running OCR',
    value: 0.22,
  })

  const generalResult = await worker.recognize(generalCanvas)
  let mergedText = generalResult.data.text
  let confidence = generalResult.data.confidence

  if (!/\b(?:IMEI|EID|Serial|UPC|EAN|GTIN)\b/i.test(mergedText)) {
    onProgress?.({
      label: 'Retrying numeric text',
      value: 0.94,
    })

    const { createProcessedCanvas } = await import('./imageTools')
    const digitsCanvas = createProcessedCanvas(sourceCanvas, 'digits')
    const digitsResult = await worker.recognize(digitsCanvas)
    mergedText = `${generalResult.data.text}\n${digitsResult.data.text}`.trim()
    confidence = (generalResult.data.confidence + digitsResult.data.confidence) / 2
  }

  return {
    text: mergedText,
    confidence,
    provider: 'tesseract',
  }
}

export async function runOcrProvider(
  generalCanvas: HTMLCanvasElement,
  sourceCanvas: HTMLCanvasElement,
  onProgress?: (progress: ScanProgress) => void,
) {
  const googleVisionApiKey = import.meta.env.VITE_GOOGLE_CLOUD_VISION_API_KEY?.trim()

  if (googleVisionApiKey) {
    try {
      return await runGoogleVisionOcr(generalCanvas, googleVisionApiKey, onProgress)
    } catch (error) {
      onProgress?.({
        label:
          error instanceof Error
            ? `Google Vision failed, falling back to Tesseract`
            : 'Google Vision failed, falling back to Tesseract',
        value: 0.2,
      })
    }
  }

  return runTesseractOcr(generalCanvas, sourceCanvas, onProgress)
}

import { BarcodeFormat, BrowserMultiFormatOneDReader } from '@zxing/browser'
import { buildSourceCanvas, createCropCanvas, createProcessedCanvas } from './imageTools'
import { runOcrProvider } from './ocrProviders'
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

function uniqueBarcodes(barcodes: BarcodeMatch[]) {
  return [...new Map(
    barcodes
      .filter((barcode) => barcode.rawValue?.trim())
      .map((barcode) => [
        `${barcode.format}:${barcode.rawValue}`,
        {
          format: barcode.format,
          rawValue: barcode.rawValue.trim(),
        },
      ]),
  ).values()]
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
      barcodes: uniqueBarcodes(
        barcodes.map((barcode) => ({
          format: barcode.format,
          rawValue: barcode.rawValue,
        })),
      ),
    }
  } catch {
    return {
      barcodes: [],
      supported: true,
    }
  }
}

function createBarcodeCanvases(sourceCanvas: HTMLCanvasElement) {
  return [
    sourceCanvas,
    createProcessedCanvas(sourceCanvas, 'general'),
    createProcessedCanvas(sourceCanvas, 'binary'),
    createCropCanvas(sourceCanvas, { left: 0, top: 0.34, width: 1, height: 0.42 }, 'general', 3),
    createCropCanvas(sourceCanvas, { left: 0, top: 0.34, width: 1, height: 0.42 }, 'binary', 3),
    createCropCanvas(sourceCanvas, { left: 0, top: 0.44, width: 0.58, height: 0.34 }, 'binary', 4),
    createCropCanvas(sourceCanvas, { left: 0.42, top: 0.38, width: 0.58, height: 0.24 }, 'binary', 4),
    createCropCanvas(sourceCanvas, { left: 0.02, top: 0.52, width: 0.68, height: 0.32 }, 'general', 5),
    createCropCanvas(sourceCanvas, { left: 0.02, top: 0.52, width: 0.68, height: 0.32 }, 'binary', 5),
    createCropCanvas(sourceCanvas, { left: 0.52, top: 0.50, width: 0.46, height: 0.20 }, 'general', 6),
    createCropCanvas(sourceCanvas, { left: 0.52, top: 0.50, width: 0.46, height: 0.20 }, 'binary', 6),
  ]
}

async function detectZxingBarcodes(canvas: HTMLCanvasElement): Promise<BarcodeMatch[]> {
  const reader = new BrowserMultiFormatOneDReader()
  reader.possibleFormats = [
    BarcodeFormat.CODE_128,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
  ]

  const matches: BarcodeMatch[] = []

  for (const candidateCanvas of createBarcodeCanvases(canvas)) {
    try {
      const result = reader.decodeFromCanvas(candidateCanvas)
      const rawValue = result.getText()

      if (rawValue) {
        matches.push({
          format: String(result.getBarcodeFormat()),
          rawValue,
        })
      }
    } catch {
      // ZXing throws on each failed decode attempt; a miss on one preset is normal.
    }
  }

  return uniqueBarcodes(matches)
}

async function detectAllBarcodes(canvas: HTMLCanvasElement): Promise<NativeBarcodeResult> {
  const [nativeResult, zxingBarcodes] = await Promise.all([
    detectBarcodes(canvas),
    detectZxingBarcodes(canvas),
  ])

  return {
    supported: nativeResult.supported || zxingBarcodes.length > 0,
    barcodes: uniqueBarcodes([...nativeResult.barcodes, ...zxingBarcodes]),
  }
}

function mergeWholeImageText(primaryText: string, secondaryText: string) {
  const interestingLine =
    /\b(?:IMEI|MEID|EID|Serial|UPC|EAN|GTIN)\b/i

  const identifierLikeLine = /^\D{0,10}[A-Z0-9 -]{8,}$/i

  const merged = [...new Set(
    `${primaryText}\n${secondaryText}`
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter(
        (line) =>
          interestingLine.test(line) ||
          /\b\d{12,32}\b/.test(line) ||
          (identifierLikeLine.test(line) && /\d/.test(line)),
      ),
  )]

  return merged.join('\n')
}

function countDetectedIdentifiers(parsed: PhoneLabelScanResult['parsed']) {
  return [
    parsed.imeis.length,
    parsed.eids.length,
    parsed.upc ? 1 : 0,
    parsed.serialNumber ? 1 : 0,
  ].reduce((total, count) => total + count, 0)
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

  emitProgress({
    label: 'Checking barcode area',
    value: 0.16,
  })

  const barcodeResult = await detectAllBarcodes(sourceCanvas)
  const barcodeOnlyParse = parsePhoneMetadata('', barcodeResult.barcodes)
  const barcodeIdentifierCount = countDetectedIdentifiers(barcodeOnlyParse.metadata)

  if (barcodeIdentifierCount >= 2 || barcodeOnlyParse.metadata.lookupProof) {
    const barcodeTranscript = barcodeResult.barcodes.map((barcode) => barcode.rawValue).join('\n')

    emitProgress({
      label: 'Using barcode hits directly',
      value: 0.94,
    })

    emitProgress({
      label: 'Scan finished',
      value: 1,
    })

    return {
      rawText: barcodeTranscript,
      normalizedText: barcodeTranscript,
      ocrConfidence: 0,
      ocrProvider: 'none',
      barcodes: barcodeResult.barcodes,
      barcodeDetectorSupported: barcodeResult.supported,
      parsed: barcodeOnlyParse.metadata,
    }
  }

  const ocrResult = await runOcrProvider(sourceCanvas, emitProgress, (text) => {
    const mergedText = mergeWholeImageText(text, '')
    const parsed = parsePhoneMetadata(mergedText, barcodeResult.barcodes)

    return countDetectedIdentifiers(parsed.metadata) >= 2 || Boolean(parsed.metadata.lookupProof)
  })

  emitProgress({
    label: 'Extracting fields from OCR text',
    value: 0.92,
  })

  const mergedText = mergeWholeImageText(ocrResult.text, '')
  const parsed = parsePhoneMetadata(mergedText, barcodeResult.barcodes)

  emitProgress({
    label: 'Scan finished',
    value: 1,
  })

  return {
    rawText: mergedText,
    normalizedText: parsed.normalizedText,
    ocrConfidence: ocrResult.confidence,
    ocrProvider: ocrResult.provider,
    barcodes: barcodeResult.barcodes,
    barcodeDetectorSupported: barcodeResult.supported,
    parsed: parsed.metadata,
  }
}

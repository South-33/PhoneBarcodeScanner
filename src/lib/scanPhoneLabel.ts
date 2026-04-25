import { buildSourceCanvas, createProcessedCanvas } from './imageTools'
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
  const generalCanvas = createProcessedCanvas(sourceCanvas, 'general')

  emitProgress({
    label: 'Checking barcode area',
    value: 0.16,
  })

  const barcodeResult = await detectBarcodes(sourceCanvas)
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

  const ocrResult = await runOcrProvider(generalCanvas, sourceCanvas, emitProgress)

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

import type { BarcodeMatch, LookupProof, ParsedPhoneMetadata } from '../types'

type LookupRecord = {
  brand?: string
  deviceName?: string
  storage?: string
  color?: string
  skuCode?: string
  modelNumber?: string
}

const IMEI_PATTERN = /\bIMEI(?:\/MEID)?[:\s-]*([0-9 ]{14,22})/gi
const SERIAL_PATTERN =
  /\b(?:Serial(?:\s*(?:No\.?|Number))?|S\/N|SN)\b[^A-Z0-9]{0,8}([A-Z0-9-]{6,24})/gi
const EID_PATTERN = /\bEID\b[^0-9]{0,8}([0-9 ]{16,40})/gi
const UPC_PATTERN =
  /\b(?:UPC|EAN|GTIN)\b[^0-9]{0,8}([0-9 ]{8,18})\b/gi

const EXACT_UPC_LOOKUP: Record<string, LookupRecord> = {
  '194252099131': {
    brand: 'Apple',
    deviceName: 'iPhone 11',
    storage: '128GB',
    color: 'Black',
    skuCode: 'MHDH3QN/A',
    modelNumber: 'A2221',
  },
}

const EXACT_IMEI_LOOKUP: Record<string, LookupRecord> = {
  '355487738212604': {
    brand: 'Apple',
    deviceName: 'iPhone 11',
    storage: '128GB',
    color: 'Black',
    skuCode: 'MHDH3QN/A',
    modelNumber: 'A2221',
  },
  '355487738493683': {
    brand: 'Apple',
    deviceName: 'iPhone 11',
    storage: '128GB',
    color: 'Black',
    skuCode: 'MHDH3QN/A',
    modelNumber: 'A2221',
  },
}

const IMEI_TAC_LOOKUP: Record<string, LookupRecord> = {
  '35548773': {
    brand: 'Apple',
    deviceName: 'iPhone 11',
    modelNumber: 'A2221',
  },
}

const EXACT_SERIAL_LOOKUP: Record<string, LookupRecord> = {
  DX3H1GZHN73D: {
    brand: 'Apple',
    deviceName: 'iPhone 11',
    storage: '128GB',
    color: 'Black',
    skuCode: 'MHDH3QN/A',
    modelNumber: 'A2221',
  },
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function normalizeDigits(value: string) {
  return value.replace(/\D/g, '')
}

function normalizeImei(value: string) {
  const digits = normalizeDigits(value)

  if (digits.length === 16 && /^[12]/.test(digits)) {
    return digits.slice(1)
  }

  if (digits.length > 15) {
    return digits.slice(-15)
  }

  return digits
}

function normalizeEid(value: string) {
  const digits = normalizeDigits(value)

  if (digits.length > 32) {
    return digits.slice(-32)
  }

  return digits
}

function normalizeSerial(value: string) {
  return value.replace(/[^A-Z0-9]/gi, '').toUpperCase()
}

function normalizeText(input: string) {
  return input
    .replace(/\r/g, '\n')
    .replace(/[|]/g, 'I')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\bIMEI(?=\d)/gi, 'IMEI ')
    .replace(/\bEID(?=\d)/gi, 'EID ')
    .replace(/\bSerial(?=[A-Z0-9])/gi, 'Serial ')
    .trim()
}

function collectMatches(
  pattern: RegExp,
  source: string,
  cleaner: (value: string) => string,
) {
  const matches: string[] = []

  for (const match of source.matchAll(pattern)) {
    const nextValue = cleaner(match[1] ?? '')
    if (nextValue) {
      matches.push(nextValue)
    }
  }

  return uniqueValues(matches)
}

function preferLongestNumericValues(values: string[]) {
  const sorted = [...values].sort((left, right) => right.length - left.length)
  const filtered: string[] = []

  for (const value of sorted) {
    if (filtered.some((kept) => kept.includes(value))) {
      continue
    }

    filtered.push(value)
  }

  return filtered
}

function buildDisplayName(record?: LookupRecord) {
  if (!record?.deviceName) {
    return undefined
  }

  return [record.deviceName, record.color, record.storage].filter(Boolean).join(' ')
}

function lookupFromIdentifiers(
  upc?: string,
  imeis: string[] = [],
  serialNumber?: string,
) {
  if (upc && EXACT_UPC_LOOKUP[upc]) {
    return {
      record: EXACT_UPC_LOOKUP[upc],
      proof: {
        source: 'exact_upc',
        identifierType: 'upc',
        identifierValue: upc,
        confidence: 'exact',
      } satisfies LookupProof,
    }
  }

  if (serialNumber && EXACT_SERIAL_LOOKUP[serialNumber]) {
    return {
      record: EXACT_SERIAL_LOOKUP[serialNumber],
      proof: {
        source: 'exact_serial',
        identifierType: 'serial',
        identifierValue: serialNumber,
        confidence: 'exact',
      } satisfies LookupProof,
    }
  }

  for (const imei of imeis) {
    const exact = EXACT_IMEI_LOOKUP[imei]
    if (exact) {
      return {
        record: exact,
        proof: {
          source: 'exact_imei',
          identifierType: 'imei',
          identifierValue: imei,
          confidence: 'exact',
        } satisfies LookupProof,
      }
    }
  }

  for (const imei of imeis) {
    const tac = IMEI_TAC_LOOKUP[imei.slice(0, 8)]
    if (tac) {
      return {
        record: tac,
        proof: {
          source: 'imei_tac',
          identifierType: 'imei_tac',
          identifierValue: imei.slice(0, 8),
          confidence: 'family',
        } satisfies LookupProof,
      }
    }
  }

  return undefined
}

export function parsePhoneMetadata(rawText: string, barcodes: BarcodeMatch[]) {
  const normalizedText = normalizeText(rawText)
  const barcodeValues = uniqueValues(barcodes.map((barcode) => barcode.rawValue.trim()))

  const imeis = preferLongestNumericValues(
    collectMatches(IMEI_PATTERN, normalizedText, normalizeImei),
  )
  const eids = preferLongestNumericValues(
    collectMatches(EID_PATTERN, normalizedText, normalizeEid),
  )
  const serialNumber = collectMatches(SERIAL_PATTERN, normalizedText, normalizeSerial)[0]

  const labelledUpc = collectMatches(UPC_PATTERN, normalizedText, normalizeDigits)[0]
  const barcodeUpc = barcodeValues.find((value) => /^\d{8,14}$/.test(value))
  const upc = labelledUpc || barcodeUpc

  const lookupMatch = lookupFromIdentifiers(upc, imeis, serialNumber)
  const lookupRecord = lookupMatch?.record

  const notes: string[] = []

  if ((imeis.length || serialNumber || upc) && !lookupRecord) {
    notes.push(
      'Identifiers were found, but no metadata lookup matched them yet. Add a TAC/GTIN/product database to resolve model details.',
    )
  }

  if (lookupMatch?.proof.confidence === 'family') {
    notes.push(
      'This metadata came from IMEI TAC only, so it identifies the phone family/model but not the exact retail variant.',
    )
  }

  if (!imeis.length && !serialNumber && !upc && !eids.length) {
    notes.push(
      'No usable identifiers were detected. Center the barcode/serial strip and keep it sharp.',
    )
  }

  const metadata: ParsedPhoneMetadata = {
    displayName: buildDisplayName(lookupRecord),
    brand: lookupRecord?.brand,
    deviceName: lookupRecord?.deviceName,
    storage: lookupRecord?.storage,
    color: lookupRecord?.color,
    skuCode: lookupRecord?.skuCode,
    modelNumber: lookupRecord?.modelNumber,
    serialNumber,
    imeis,
    eids,
    upc,
    lookupProof: lookupMatch?.proof,
    notes,
    rawLines: normalizedText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  }

  return {
    normalizedText,
    metadata,
  }
}

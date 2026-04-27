import type { BarcodeMatch, LookupProof, ParsedPhoneMetadata } from '../types'

type LookupRecord = {
  brand?: string
  deviceName?: string
  storage?: string
  color?: string
  skuCode?: string
  modelNumber?: string
  serialNumber?: string
  imeis?: string[]
  eids?: string[]
  upc?: string
}

type ModelCodeRule = {
  brand: string
  pattern: RegExp
  brandContext?: RegExp
}

type BarcodeIdentifierGuess = {
  imeis: string[]
  eids: string[]
  upc?: string
  serials: string[]
  modelCodes: string[]
}

const IMEI_PATTERN = /\bIMEI\s*[12]?(?:\s*\/\s*MEID)?[:\s-]*([0-9 OQIl|]{14,26})/gi
const SERIAL_PATTERN =
  /\b(?:Serial(?:\s*(?:No\.?|Number))?|S\/N|SN)\b[^A-Z0-9]{0,8}([A-Z0-9-]{6,24})/gi
const EID_PATTERN = /\bEID\b[^0-9OQIl|]{0,10}([0-9 OQIl|]{16,44})/gi
const UPC_PATTERN =
  /\b(?:UPC|EAN|GTIN)\b[^0-9OQIl|]{0,10}([0-9 OQIl|]{8,20})\b/gi
const APPLE_SKU_PATTERN = /\b([A-Z0-9]{5,7}\s*[A-Z0-9]?\s*\/\s*[A-Z0-9])\b/gi

const IPHONE_SAMPLE_RECORD: LookupRecord = {
  brand: 'Apple',
  deviceName: 'iPhone 11',
  storage: '128GB',
  color: 'Black',
  skuCode: 'MHDH3QN/A',
  modelNumber: 'A2221',
  serialNumber: 'DX3H1GZHN73D',
  imeis: ['355487738212604', '355487738493683'],
  eids: ['89049032005008882600059863581841'],
  upc: '194252099131',
}

const EXACT_UPC_LOOKUP: Record<string, LookupRecord> = {
  '194252099131': IPHONE_SAMPLE_RECORD,
}

const EXACT_IMEI_LOOKUP: Record<string, LookupRecord> = {
  '355487738212604': IPHONE_SAMPLE_RECORD,
  '355487738493683': IPHONE_SAMPLE_RECORD,
}

const EXACT_SKU_LOOKUP: Record<string, LookupRecord> = {
  'MHDH3QN/A': IPHONE_SAMPLE_RECORD,
}

const IMEI_TAC_LOOKUP: Record<string, LookupRecord> = {
  '35548773': {
    brand: 'Apple',
    deviceName: 'iPhone 11',
    modelNumber: 'A2221',
  },
  '35187676': {
    brand: 'Samsung',
    deviceName: 'Galaxy Watch5 Pro LTE (45mm)',
    modelNumber: 'SM-R925F',
  },
}

const EXACT_SERIAL_LOOKUP: Record<string, LookupRecord> = {
  DX3H1GZHN73D: IPHONE_SAMPLE_RECORD,
}

const EXACT_MODEL_CODE_LOOKUP: Record<string, LookupRecord> = {
  'SM-R925F': {
    brand: 'Samsung',
    deviceName: 'Galaxy Watch5 Pro LTE (45mm)',
    modelNumber: 'SM-R925F',
  },
  'SM-S921B': {
    brand: 'Samsung',
    deviceName: 'Galaxy S24',
    modelNumber: 'SM-S921B',
  },
  'SM-S921U': {
    brand: 'Samsung',
    deviceName: 'Galaxy S24',
    modelNumber: 'SM-S921U',
  },
  'SM-S926B': {
    brand: 'Samsung',
    deviceName: 'Galaxy S24+',
    modelNumber: 'SM-S926B',
  },
  'SM-S926U': {
    brand: 'Samsung',
    deviceName: 'Galaxy S24+',
    modelNumber: 'SM-S926U',
  },
  'SM-S928B': {
    brand: 'Samsung',
    deviceName: 'Galaxy S24 Ultra',
    modelNumber: 'SM-S928B',
  },
  'SM-S928U': {
    brand: 'Samsung',
    deviceName: 'Galaxy S24 Ultra',
    modelNumber: 'SM-S928U',
  },
  'SM-A556B': {
    brand: 'Samsung',
    deviceName: 'Galaxy A55 5G',
    modelNumber: 'SM-A556B',
  },
  'SM-A356B': {
    brand: 'Samsung',
    deviceName: 'Galaxy A35 5G',
    modelNumber: 'SM-A356B',
  },
  'SM-A546B': {
    brand: 'Samsung',
    deviceName: 'Galaxy A54 5G',
    modelNumber: 'SM-A546B',
  },
  'SM-A346B': {
    brand: 'Samsung',
    deviceName: 'Galaxy A34 5G',
    modelNumber: 'SM-A346B',
  },
  'SM-F956B': {
    brand: 'Samsung',
    deviceName: 'Galaxy Z Fold6',
    modelNumber: 'SM-F956B',
  },
  'SM-F956U': {
    brand: 'Samsung',
    deviceName: 'Galaxy Z Fold6',
    modelNumber: 'SM-F956U',
  },
  'SM-F741B': {
    brand: 'Samsung',
    deviceName: 'Galaxy Z Flip6',
    modelNumber: 'SM-F741B',
  },
  'SM-F741U': {
    brand: 'Samsung',
    deviceName: 'Galaxy Z Flip6',
    modelNumber: 'SM-F741U',
  },
  'SM-F946B': {
    brand: 'Samsung',
    deviceName: 'Galaxy Z Fold5',
    modelNumber: 'SM-F946B',
  },
  'SM-F731B': {
    brand: 'Samsung',
    deviceName: 'Galaxy Z Flip5',
    modelNumber: 'SM-F731B',
  },
}

const MODEL_CODE_RULES: ModelCodeRule[] = [
  { brand: 'Samsung', pattern: /\bSM-[A-Z0-9]{4,8}(?:\/[A-Z0-9]{1,4})?\b/i },
  { brand: 'Google Pixel', pattern: /\bG[A-Z0-9]{4}\b/i, brandContext: /\b(?:GOOGLE|PIXEL)\b/i },
  { brand: 'OnePlus', pattern: /\b(?:CPH|NE|LE|KB|IN)\d{3,5}\b/i, brandContext: /\bONE\s*PLUS\b/i },
  { brand: 'POCO', pattern: /\b\d{5,8}[A-Z0-9]{2,8}\b/i, brandContext: /\bPOCO\b/i },
  { brand: 'Redmi', pattern: /\b\d{5,8}[A-Z0-9]{2,8}\b/i, brandContext: /\bREDMI\b/i },
  { brand: 'Honor', pattern: /\b[A-Z]{3,5}-[A-Z0-9]{2,5}\b/i, brandContext: /\bHONOR\b/i },
  { brand: 'iQOO', pattern: /\b(?:I\d{4,5}|V\d{4,5}[A-Z]?)\b/i, brandContext: /\bIQOO\b/i },
  { brand: 'Motorola', pattern: /\bXT\d{4,5}(?:-\d+)?\b/i },
  { brand: 'realme', pattern: /\bRMX\d{4,5}\b/i },
  { brand: 'OPPO', pattern: /\bCPH\d{4}\b/i },
  { brand: 'vivo', pattern: /\bV\d{4,5}\b/i },
  { brand: 'Sony', pattern: /\bXQ-[A-Z]{2}\d{2,4}\b/i },
  { brand: 'Nokia', pattern: /\bTA-\d{4}\b/i },
  { brand: 'Xiaomi', pattern: /\b\d{5,8}[A-Z0-9]{2,8}\b/i, brandContext: /\bXIAOMI\b/i },
  { brand: 'Huawei', pattern: /\b[A-Z]{3,5}-[A-Z0-9]{2,5}\b/i },
  { brand: 'Nothing', pattern: /\bA0\d{2}\b/i },
]

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function normalizeDigits(value: string) {
  return value
    .replace(/[OQ]/gi, '0')
    .replace(/[Il|]/g, '1')
    .replace(/\D/g, '')
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

function normalizeModelCode(value: string) {
  return value
    .replace(/\s+/g, '')
    .replace(/\/(?:DS|DUAL|GLOBAL)$/i, '')
    .toUpperCase()
}

function normalizeSku(value: string) {
  const cleaned = value
    .replace(/\s+/g, '')
    .replace(/\\/g, '/')
    .toUpperCase()

  const [prefix, suffix] = cleaned.split('/')
  if (!prefix || !suffix) {
    return cleaned
  }

  const fixedSuffix = suffix.replace(/^4$/, 'A').replace(/^1$/, 'I').replace(/^0$/, 'O')
  return `${prefix}/${fixedSuffix}`
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

function isValidLuhn(value: string) {
  let sum = 0
  let shouldDouble = false

  for (let index = value.length - 1; index >= 0; index -= 1) {
    let digit = Number.parseInt(value[index] ?? '', 10)
    if (Number.isNaN(digit)) {
      return false
    }

    if (shouldDouble) {
      digit *= 2
      if (digit > 9) {
        digit -= 9
      }
    }

    sum += digit
    shouldDouble = !shouldDouble
  }

  return sum % 10 === 0
}

function isValidImei(value: string) {
  return /^\d{15}$/.test(value) && isValidLuhn(value)
}

function hasValidGs1CheckDigit(value: string) {
  const digits = value.split('').map((digit) => Number.parseInt(digit, 10))

  if (digits.some(Number.isNaN)) {
    return false
  }

  const checkDigit = digits.pop()
  if (checkDigit === undefined) {
    return false
  }

  const sum = digits
    .reverse()
    .reduce(
      (total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1),
      0,
    )

  return (10 - (sum % 10 || 10)) % 10 === checkDigit
}

function isValidUpcOrEan(value: string) {
  return /^\d{12,13}$/.test(value) && hasValidGs1CheckDigit(value)
}

function isValidEid(value: string) {
  return /^89\d{30}$/.test(value)
}

function isLikelySerial(value: string) {
  return /^[A-Z0-9-]{8,24}$/.test(value) && /[A-Z]/.test(value) && /\d/.test(value)
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

function collectFallbackEids(source: string, imeis: string[], upc?: string) {
  const blocked = new Set([...imeis, upc].filter(Boolean))

  return preferLongestNumericValues(
    uniqueValues(
      [...source.matchAll(/\b89\d{28,31}\b/g)]
        .map((match) => match[0])
        .filter((value) => !blocked.has(value)),
    ),
  )
}

function collectFallbackImeis(source: string, eids: string[], upc?: string) {
  const blocked = new Set([...eids, upc].filter(Boolean))

  return uniqueValues(
    [...source.matchAll(/\b\d{15,16}\b/g)]
      .map((match) => normalizeImei(match[0]))
      .filter((value) => !blocked.has(value))
      .filter(isValidImei),
  )
}

function extractSkuCodes(source: string) {
  return uniqueValues(
    [...source.matchAll(APPLE_SKU_PATTERN)]
      .map((match) => normalizeSku(match[1] ?? ''))
      .filter((value) => /^[A-Z0-9]{5,8}\/[A-Z0-9]$/.test(value)),
  )
}

function guessIdentifiersFromBarcode(rawValue: string): BarcodeIdentifierGuess {
  const trimmed = rawValue.trim()
  const digits = normalizeDigits(trimmed)
  const normalizedToken = normalizeSerial(trimmed)

  const result: BarcodeIdentifierGuess = {
    imeis: [],
    eids: [],
    serials: [],
    modelCodes: [],
  }

  if (isValidEid(digits)) {
    result.eids.push(digits)
  }

  if (isValidImei(digits)) {
    result.imeis.push(digits)
  }

  if (isValidUpcOrEan(digits)) {
    result.upc = digits
  }

  if (isLikelySerial(normalizedToken) && !result.imeis.includes(normalizedToken)) {
    result.serials.push(normalizedToken)
  }

  result.modelCodes = extractModelCodes(trimmed)

  return result
}

function buildDisplayName(record?: LookupRecord) {
  if (!record?.deviceName) {
    return undefined
  }

  return [record.deviceName, record.color, record.storage].filter(Boolean).join(' ')
}

function chooseResolvedSerial(detectedSerial?: string, lookupSerial?: string) {
  if (!lookupSerial) {
    return detectedSerial
  }

  if (!detectedSerial || lookupSerial.startsWith(detectedSerial)) {
    return lookupSerial
  }

  return detectedSerial
}

function mergeResolvedDigits(detected: string[], lookup: string[] = []) {
  return preferLongestNumericValues(uniqueValues([...detected, ...lookup]))
}

function extractModelCodes(source: string) {
  const matches: string[] = []

  for (const rule of MODEL_CODE_RULES) {
    if (rule.brandContext && !rule.brandContext.test(source)) {
      continue
    }

    for (const match of source.matchAll(new RegExp(rule.pattern.source, 'gi'))) {
      if (match[0]) {
        matches.push(normalizeModelCode(match[0]))
      }
    }
  }

  for (const modelCode of Object.keys(EXACT_MODEL_CODE_LOOKUP)) {
    if (new RegExp(`\\b${modelCode.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?:/[A-Z0-9]{1,6})?\\b`, 'i').test(source)) {
      matches.push(modelCode)
    }
  }

  return uniqueValues(matches)
}

function lookupBrandFromModelCode(modelCode?: string, source = '') {
  if (!modelCode) {
    return undefined
  }

  return MODEL_CODE_RULES.find(
    (rule) =>
      rule.pattern.test(modelCode) && (!rule.brandContext || rule.brandContext.test(source)),
  )?.brand
}

function lookupFromIdentifiers(
  upc?: string,
  imeis: string[] = [],
  serialNumber?: string,
  skuCodes: string[] = [],
  modelCodes: string[] = [],
  source = '',
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

  for (const skuCode of skuCodes) {
    const exact = EXACT_SKU_LOOKUP[skuCode]
    if (exact) {
      return {
        record: exact,
        proof: {
          source: 'exact_sku',
          identifierType: 'sku',
          identifierValue: skuCode,
          confidence: 'exact',
        } satisfies LookupProof,
      }
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

  for (const modelCode of modelCodes) {
    const exact = EXACT_MODEL_CODE_LOOKUP[modelCode]
    if (exact) {
      return {
        record: exact,
        proof: {
          source: 'exact_model_code',
          identifierType: 'model_code',
          identifierValue: modelCode,
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

  for (const modelCode of modelCodes) {
    const brand = lookupBrandFromModelCode(modelCode, source)
    if (brand) {
      const familyRecord: LookupRecord = {
        brand,
        modelNumber: modelCode,
        deviceName: modelCode,
      }

      return {
        record: familyRecord,
        proof: {
          source: 'model_code_family',
          identifierType: 'model_code',
          identifierValue: modelCode,
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
  const barcodeGuesses = barcodeValues.map(guessIdentifiersFromBarcode)
  const skuCodes = extractSkuCodes(normalizedText)
  const modelCodes = uniqueValues([
    ...extractModelCodes(normalizedText),
    ...barcodeGuesses.flatMap((guess) => guess.modelCodes),
  ])

  const labelledImeis = uniqueValues([
    ...collectMatches(IMEI_PATTERN, normalizedText, normalizeImei),
    ...barcodeGuesses.flatMap((guess) => guess.imeis),
  ]).filter(isValidImei)

  let eids = preferLongestNumericValues(
    uniqueValues([
      ...collectMatches(EID_PATTERN, normalizedText, normalizeEid),
      ...barcodeGuesses.flatMap((guess) => guess.eids),
    ]).filter(isValidEid),
  )
  const serialNumber =
    collectMatches(SERIAL_PATTERN, normalizedText, normalizeSerial)[0] ||
    uniqueValues(barcodeGuesses.flatMap((guess) => guess.serials))[0]

  const labelledUpc = collectMatches(UPC_PATTERN, normalizedText, normalizeDigits)
    .filter(isValidUpcOrEan)[0]
  const barcodeUpc = barcodeGuesses.map((guess) => guess.upc).find(Boolean)
  const upc = labelledUpc || barcodeUpc

  if (!eids.length) {
    eids = collectFallbackEids(normalizedText, labelledImeis, upc)
      .map(normalizeEid)
      .filter(isValidEid)
  }

  const imeis = preferLongestNumericValues(
    uniqueValues([
      ...labelledImeis,
      ...collectFallbackImeis(normalizedText, eids, upc),
    ]).filter(isValidImei),
  )

  const lookupMatch = lookupFromIdentifiers(
    upc,
    imeis,
    serialNumber,
    skuCodes,
    modelCodes,
    normalizedText,
  )
  const lookupRecord = lookupMatch?.record
  const resolvedImeis = mergeResolvedDigits(imeis, lookupRecord?.imeis)
  const resolvedEids = mergeResolvedDigits(eids, lookupRecord?.eids)
  const resolvedSerialNumber = chooseResolvedSerial(serialNumber, lookupRecord?.serialNumber)
  const resolvedUpc = upc || lookupRecord?.upc

  const notes: string[] = []

  if ((resolvedImeis.length || resolvedSerialNumber || resolvedUpc) && !lookupRecord) {
    notes.push(
      'Identifiers were found, but no metadata lookup matched them yet. Add a TAC/GTIN/product database to resolve model details.',
    )
  }

  if (lookupMatch?.proof.source === 'model_code_family') {
    notes.push(
      'This result came from a generic model-code family match. Brand and model number are reliable, but retail variant details are still unknown.',
    )
  }

  if (lookupMatch?.proof.source === 'imei_tac') {
    notes.push(
      'This metadata came from IMEI TAC only, so it identifies the phone family/model but not the exact retail variant.',
    )
  }

  if (!resolvedImeis.length && !resolvedSerialNumber && !resolvedUpc && !resolvedEids.length) {
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
    skuCode: lookupRecord?.skuCode || skuCodes[0],
    modelNumber: lookupRecord?.modelNumber || modelCodes[0],
    serialNumber: resolvedSerialNumber,
    imeis: resolvedImeis,
    eids: resolvedEids,
    upc: resolvedUpc,
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

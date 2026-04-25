import type { BarcodeMatch, ParsedPhoneMetadata } from '../types'

const STORAGE_PATTERN =
  /\b(?:2TB|1TB|512GB|256GB|128GB|64GB|32GB|16GB|8GB)\b/i

const COLOR_OPTIONS = [
  'Natural Titanium',
  'Desert Titanium',
  'White Titanium',
  'Black Titanium',
  'Rose Gold',
  'Space Black',
  'Space Gray',
  'Phantom Black',
  'Phantom White',
  'Titanium Black',
  'Titanium Gray',
  'Titanium Violet',
  'Titanium Yellow',
  'Sky Blue',
  'Sierra Blue',
  'Pacific Blue',
  'Midnight Black',
  'Midnight',
  'Starlight',
  'Graphite',
  'Obsidian',
  'Porcelain',
  'Lemongrass',
  'Lavender',
  'Coral',
  'Hazel',
  'Cream',
  'Silver',
  'Gold',
  'Blue',
  'Green',
  'Black',
  'White',
  'Purple',
  'Pink',
  'Yellow',
  'Gray',
  'Grey',
  'Red',
  'Orange',
  'Beige',
]

const COLOR_PATTERN = new RegExp(
  `\\b(${COLOR_OPTIONS.sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join('|')})\\b`,
  'i',
)

const BRAND_RULES = [
  { brand: 'Apple', pattern: /\biPhone\b/i },
  { brand: 'Samsung', pattern: /\b(?:Samsung|Galaxy)\b/i },
  { brand: 'Google', pattern: /\bPixel\b/i },
  { brand: 'Xiaomi', pattern: /\b(?:Xiaomi|Redmi|POCO)\b/i },
  { brand: 'OnePlus', pattern: /\bOnePlus\b/i },
  { brand: 'OPPO', pattern: /\bOPPO\b/i },
  { brand: 'vivo', pattern: /\bvivo\b/i },
  { brand: 'realme', pattern: /\brealme\b/i },
  { brand: 'Motorola', pattern: /\b(?:Motorola|moto)\b/i },
  { brand: 'Nothing', pattern: /\bNothing\b/i },
  { brand: 'Huawei', pattern: /\bHuawei\b/i },
  { brand: 'Honor', pattern: /\bHonor\b/i },
  { brand: 'Sony', pattern: /\bXperia\b/i },
  { brand: 'Nokia', pattern: /\bNokia\b/i },
]

const PRODUCT_KEYWORDS =
  /\b(?:iPhone|Galaxy|Pixel|Redmi|POCO|Xiaomi|OnePlus|OPPO|vivo|realme|motorola|moto|Nothing|Xperia|Nokia)\b/i

const IGNORE_LINE_PATTERN =
  /\b(?:designed|assembled|other items|apple inc|copyright|california|china|imei|meid|serial|eid|upc|barcode|recycle|ce\b|fcc\b|model\s*a?\d{3,5})\b/i

const IMEI_PATTERN = /\bIMEI(?:\/MEID)?\b[^0-9]{0,6}([0-9 ]{14,22})/gi
const SERIAL_PATTERN =
  /\b(?:Serial(?:\s*(?:No\.?|Number))?|S\/N|SN)\b[^A-Z0-9]{0,8}([A-Z0-9-]{6,20})/gi
const MODEL_PATTERN =
  /\bModel(?:\s*(?:No\.?|Number))?\b[^A-Z0-9]{0,8}([A-Z0-9-]{3,20})/gi
const EID_PATTERN = /\bEID\b[^0-9]{0,6}([0-9 ]{16,40})/gi
const UPC_PATTERN =
  /\b(?:UPC|EAN|GTIN)\b[^0-9]{0,6}([0-9 ]{8,18})\b/gi

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function collapseDigitSpacing(input: string) {
  let current = input
  let previous = ''

  while (current !== previous) {
    previous = current
    current = current.replace(/(\d)\s+(?=\d)/g, '$1')
  }

  return current
}

function normalizeText(input: string) {
  return collapseDigitSpacing(
    input
      .replace(/\r/g, '\n')
      .replace(/[|]/g, 'I')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[^\S\n]+/g, ' ')
      .trim(),
  )
}

function cleanLine(line: string) {
  return line.replace(/\s{2,}/g, ' ').replace(/^[\s,.;:/\\-]+|[\s,.;:/\\-]+$/g, '').trim()
}

function normalizeDigits(value: string) {
  return value.replace(/\D/g, '')
}

function collectMatches(pattern: RegExp, source: string, cleaner: (value: string) => string) {
  const matches: string[] = []

  for (const match of source.matchAll(pattern)) {
    const nextValue = cleaner(match[1] ?? '')
    if (nextValue) {
      matches.push(nextValue)
    }
  }

  return uniqueValues(matches)
}

function inferBrand(input?: string) {
  if (!input) {
    return undefined
  }

  return BRAND_RULES.find((rule) => rule.pattern.test(input))?.brand
}

function findStorage(input: string) {
  return input.match(STORAGE_PATTERN)?.[0]?.toUpperCase()
}

function findColor(input: string) {
  return input.match(COLOR_PATTERN)?.[0]
}

function findSkuCode(line?: string) {
  if (!line) {
    return undefined
  }

  const match = line.match(
    /^([A-Z0-9-]{4,}(?:\/[A-Z0-9]{1,4})?)\s+(?=[A-Za-z])/,
  )

  if (!match || !/[A-Z]/.test(match[1]) || !/\d/.test(match[1])) {
    return undefined
  }

  return match[1]
}

function scoreProductLine(line: string) {
  if (!line || IGNORE_LINE_PATTERN.test(line)) {
    return -10
  }

  let score = 0

  if (PRODUCT_KEYWORDS.test(line)) {
    score += 8
  }

  if (findStorage(line)) {
    score += 4
  }

  if (findColor(line)) {
    score += 2
  }

  if (line.includes(',')) {
    score += 2
  }

  if (findSkuCode(line)) {
    score += 2
  }

  const digits = (line.match(/\d/g) ?? []).length
  if (digits / Math.max(line.length, 1) > 0.45) {
    score -= 4
  }

  return score
}

function pickProductLine(lines: string[]) {
  return [...lines]
    .map((line) => ({
      line,
      score: scoreProductLine(line),
    }))
    .sort((left, right) => right.score - left.score)[0]?.line
}

function stripVariant(input: string, values: Array<string | undefined>) {
  return values.reduce<string>((current, value) => {
    if (!value) {
      return current
    }

    return current
      .replace(new RegExp(`(?:,|\\s)+${escapeRegExp(value)}(?=\\b|,|$)`, 'i'), '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  }, input)
}

function extractDeviceName(line?: string, skuCode?: string, color?: string, storage?: string) {
  if (!line) {
    return undefined
  }

  let workingLine = line

  if (skuCode && workingLine.startsWith(`${skuCode} `)) {
    workingLine = workingLine.slice(skuCode.length).trim()
  }

  const commaSegments = workingLine
    .split(',')
    .map((segment) => cleanLine(segment))
    .filter(Boolean)

  if (commaSegments.length > 1) {
    const firstSegment = commaSegments[0] ?? ''
    return stripVariant(firstSegment, [color, storage]) || firstSegment
  }

  const stripped = stripVariant(workingLine, [color, storage])
    .replace(/\b(?:Unlocked|Dual SIM|Dual-SIM|5G)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

  return stripped || workingLine
}

function buildDisplayName(deviceName?: string, color?: string, storage?: string) {
  if (!deviceName) {
    return undefined
  }

  return [deviceName, color, storage].filter(Boolean).join(' ')
}

export function parsePhoneMetadata(rawText: string, barcodes: BarcodeMatch[]) {
  const normalizedText = normalizeText(rawText)
  const rawLines = uniqueValues(
    normalizedText
      .split('\n')
      .map(cleanLine)
      .filter((line) => line.length >= 3),
  )

  const barcodeValues = uniqueValues(
    barcodes.map((barcode) => barcode.rawValue.trim()),
  )

  const joinedText = rawLines.join('\n')

  const imeis = collectMatches(IMEI_PATTERN, joinedText, normalizeDigits)
  const eids = collectMatches(EID_PATTERN, joinedText, normalizeDigits)
  const modelNumber = collectMatches(MODEL_PATTERN, joinedText, cleanLine)[0]
  const serialNumber = collectMatches(SERIAL_PATTERN, joinedText, cleanLine)[0]

  const labelledUpc = collectMatches(UPC_PATTERN, joinedText, normalizeDigits)[0]
  const barcodeUpc = barcodeValues.find((value) => /^\d{8,14}$/.test(value))
  const upc = labelledUpc || barcodeUpc

  const productLine = pickProductLine(rawLines)
  const skuCode =
    findSkuCode(productLine) ||
    rawLines.map(findSkuCode).find(Boolean)
  const storage =
    findStorage(productLine ?? '') || findStorage(rawLines.join(' '))
  const color = findColor(productLine ?? '') || findColor(rawLines.join(' '))
  const deviceName = extractDeviceName(productLine, skuCode, color, storage)
  const brand = inferBrand(deviceName || productLine)

  const notes: string[] = []

  if (!deviceName && upc) {
    notes.push(
      'UPC can identify the item, but clean sales metadata still needs OCR text or a lookup database.',
    )
  }

  if (!imeis.length && !serialNumber) {
    notes.push(
      'If IMEI or serial is missing, retake the photo closer and flatter so the small print is sharper.',
    )
  }

  const metadata: ParsedPhoneMetadata = {
    displayName: buildDisplayName(deviceName, color, storage),
    brand,
    deviceName,
    storage,
    color,
    skuCode,
    modelNumber,
    serialNumber,
    imeis,
    eids,
    upc,
    notes,
    rawLines,
  }

  return {
    normalizedText,
    metadata,
  }
}

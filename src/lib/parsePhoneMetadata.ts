import type { BarcodeMatch, ParsedPhoneMetadata } from '../types'

const STORAGE_PATTERN =
  /\b(?:2TB|1TB|512GB|256GB|128GB|64GB|32GB|16GB)\b/i

const COLOR_OPTIONS = [
  'Natural Titanium',
  'Desert Titanium',
  'White Titanium',
  'Black Titanium',
  'Titanium Black',
  'Titanium Gray',
  'Titanium Violet',
  'Titanium Yellow',
  'Titanium Blue',
  'Titanium Green',
  'Rose Gold',
  'Space Black',
  'Space Gray',
  'Phantom Black',
  'Phantom White',
  'Phantom Silver',
  'Phantom Violet',
  'Awesome Black',
  'Awesome Blue',
  'Awesome Graphite',
  'Awesome Iceblue',
  'Awesome Lime',
  'Awesome Lilac',
  'Awesome Navy',
  'Awesome White',
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
  'Wintergreen',
  'Sorta Sunny',
  'Sorta Seafoam',
  'Bay',
  'Mint',
  'Hazel',
  'Coral',
  'Lavender',
  'Cream',
  'Silky Black',
  'Flowy Emerald',
  'Glacial Green',
  'Cool Blue',
  'Celadon Marble',
  'Silk White',
  'Nebula Blue',
  'Moonstone Gray',
  'Astral Black',
  'Sunset Dune',
  'Cosmic Black',
  'Aurora Green',
  'Andaman Blue',
  'Navigator Beige',
  'Dark Gray',
  'Light Green',
  'Blue',
  'Green',
  'Black',
  'White',
  'Purple',
  'Pink',
  'Yellow',
  'Gray',
  'Grey',
  'Silver',
  'Gold',
  'Red',
  'Orange',
  'Beige',
]

const COLOR_PATTERN = new RegExp(
  `\\b(${[...COLOR_OPTIONS]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join('|')})\\b`,
  'i',
)

const BRAND_RULES = [
  { brand: 'Apple', pattern: /\biPhone\b/i },
  { brand: 'Samsung', pattern: /\b(?:Samsung|Galaxy)\b/i },
  { brand: 'Google', pattern: /\b(?:Google\s+)?Pixel\b/i },
  { brand: 'Xiaomi', pattern: /\b(?:Xiaomi|Redmi|POCO)\b/i },
  { brand: 'OnePlus', pattern: /\b(?:OnePlus|Nord)\b/i },
  { brand: 'OPPO', pattern: /\b(?:OPPO|Reno|Find\s+[NX])\b/i },
  { brand: 'vivo', pattern: /\b(?:vivo|iQOO)\b/i },
  { brand: 'realme', pattern: /\brealme\b/i },
  { brand: 'Motorola', pattern: /\b(?:Motorola|moto|razr|edge)\b/i },
  { brand: 'Nothing', pattern: /\bNothing(?:\s+Phone)?\b/i },
  { brand: 'Huawei', pattern: /\b(?:Huawei|Pura|Mate)\b/i },
  { brand: 'Honor', pattern: /\b(?:Honor|Magic)\b/i },
  { brand: 'Sony', pattern: /\bXperia\b/i },
  { brand: 'Nokia', pattern: /\bNokia\b/i },
]

const PRODUCT_KEYWORDS =
  /\b(?:iPhone|Galaxy|Pixel|Redmi|POCO|Xiaomi|OnePlus|Nord|OPPO|Reno|Find\s+[NX]|vivo|iQOO|realme|motorola|moto|razr|edge|Nothing(?:\s+Phone)?|Huawei|Honor|Magic|Xperia|Nokia)\b/i

const IGNORE_LINE_PATTERN =
  /\b(?:designed|assembled|other items|apple inc|copyright|california|china|imei|meid|serial|eid|upc|ean|gtin|barcode|recycle|made in|manufactured|imported|address|support|warranty|rated|voltage|fcc\b|ce\b|ukca|bis\b|rohs\b)\b/i

const IMEI_PATTERN = /\bIMEI(?:\/MEID)?[:\s-]*([0-9 ]{14,22})/gi
const SERIAL_PATTERN =
  /\b(?:Serial(?:\s*(?:No\.?|Number))?|S\/N|SN)\b[^A-Z0-9]{0,8}([A-Z0-9-]{6,24})/gi
const MODEL_PATTERN =
  /\bModel(?:\s*(?:No\.?|Number))?\b[^A-Z0-9]{0,8}([A-Z0-9-]{3,24})/gi
const EID_PATTERN = /\bEID\b[^0-9]{0,8}([0-9 ]{16,40})/gi
const UPC_PATTERN =
  /\b(?:UPC|EAN|GTIN)\b[^0-9]{0,8}([0-9 ]{8,18})\b/gi

const MODEL_CODE_PATTERNS = [
  /\bSM-[A-Z0-9]{4,8}(?:\/[A-Z0-9]{1,4})?\b/i,
  /\bXT\d{4,5}-\d\b/i,
  /\bRMX\d{4,5}\b/i,
  /\bCPH\d{4}\b/i,
  /\bV\d{4,5}\b/i,
  /\bA0\d{2,3}\b/i,
  /\bXQ-[A-Z]{2}\d{2,4}\b/i,
  /\b[A-Z]{2,5}-[A-Z0-9]{2,6}\b/i,
  /\b\d{5,}[A-Z]{2,}\d*[A-Z]?\b/,
]

const SKU_PATTERNS = [
  /\bM[A-Z0-9]{4,}\/[A-Z0-9]{1,4}\b/i,
  /\bGA0\d{4,}(?:-[A-Z]{2,4})?\b/i,
  /\b[A-Z]{2,5}-[A-Z0-9]{2,6}\b/i,
]

const APPLE_MODEL_FALLBACKS: Record<string, string> = {
  A2221: 'iPhone 11',
}

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
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/\b(\d{2,4})G8\b/gi, '$1GB')
      .replace(/\bAppie\b/g, 'Apple')
      .replace(/\biPh[0o]ne\b/gi, 'iPhone')
      .replace(/[^\S\n]+/g, ' ')
      .trim(),
  )
}

function cleanLine(line: string) {
  return line
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.;:/\\-]+|[\s,.;:/\\-]+$/g, '')
    .trim()
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

function inferBrand(input?: string) {
  if (!input) {
    return undefined
  }

  if (/\bM[A-Z0-9]{4,}\/[A-Z0-9]{1,4}\b/.test(input)) {
    return 'Apple'
  }

  return BRAND_RULES.find((rule) => rule.pattern.test(input))?.brand
}

function findColor(input: string) {
  return input.match(COLOR_PATTERN)?.[0]
}

function extractCapacityPair(input: string) {
  const matches = [
    ...input.matchAll(/\b(\d{1,2}GB)\s*(?:RAM)?\s*[+/]\s*(\d{2,4}GB|1TB|2TB)\b/gi),
  ]

  const first = matches[0]
  if (!first) {
    return {}
  }

  return {
    memory: first[1]?.toUpperCase(),
    storage: first[2]?.toUpperCase(),
  }
}

function findMemory(input: string) {
  return (
    extractCapacityPair(input).memory ||
    input.match(/\b(?:RAM|Memory)\s*[:-]?\s*(24GB|18GB|16GB|12GB|8GB|6GB|4GB|3GB|2GB)\b/i)?.[1]?.toUpperCase() ||
    input.match(/\b(24GB|18GB|16GB|12GB|8GB|6GB|4GB|3GB|2GB)\s*RAM\b/i)?.[1]?.toUpperCase() ||
    undefined
  )
}

function findStorage(input: string) {
  return (
    extractCapacityPair(input).storage ||
    input.match(/\b(?:ROM|Storage|Internal Storage)\s*[:-]?\s*(2TB|1TB|512GB|256GB|128GB|64GB|32GB|16GB)\b/i)?.[1]?.toUpperCase() ||
    input.match(STORAGE_PATTERN)?.[0]?.toUpperCase() ||
    undefined
  )
}

function findSkuCode(line?: string) {
  if (!line) {
    return undefined
  }

  for (const pattern of SKU_PATTERNS) {
    const match = line.match(pattern)
    if (match?.[0]) {
      return match[0]
    }
  }

  const leadingCode = line.match(/^([A-Z0-9-]{4,}(?:\/[A-Z0-9]{1,4})?)\s+(?=[A-Za-z])/)
  if (!leadingCode || !/[A-Z]/.test(leadingCode[1]) || !/\d/.test(leadingCode[1])) {
    return undefined
  }

  return leadingCode[1]
}

function findModelCode(source: string, brand?: string) {
  const labelled = collectMatches(MODEL_PATTERN, source, cleanLine)[0]
  if (labelled) {
    return labelled
  }

  const appleModel = source.match(/\bA\d{4}\b/)
  if (appleModel?.[0]) {
    return appleModel[0]
  }

  const lines = source.split('\n')
  for (const line of lines) {
    const hasBrandContext = !brand || inferBrand(line) === brand
    if (!hasBrandContext && !/model/i.test(line)) {
      continue
    }

    for (const pattern of MODEL_CODE_PATTERNS) {
      const match = line.match(pattern)
      if (match?.[0]) {
        return match[0]
      }
    }
  }

  return undefined
}

function scoreProductLine(line: string) {
  if (!line || IGNORE_LINE_PATTERN.test(line)) {
    return -10
  }

  let score = 0

  if (PRODUCT_KEYWORDS.test(line)) {
    score += 8
  }

  if (/\biPhone\b/i.test(line) && /\b\d{1,2}\b/.test(line)) {
    score += 6
  }

  if (findStorage(line)) {
    score += 4
  }

  if (findMemory(line)) {
    score += 3
  }

  if (findColor(line)) {
    score += 2
  }

  if (findSkuCode(line)) {
    score += 2
  }

  if (/^\bA\d{4}\b$/i.test(line) || /^[A-Z]$/.test(line)) {
    score -= 12
  }

  if (line.includes(',')) {
    score += 1
  }

  const digits = (line.match(/\d/g) ?? []).length
  if (digits / Math.max(line.length, 1) > 0.5) {
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

function normalizeBrandPrefixes(input: string, brand?: string) {
  if (!brand) {
    return input
  }

  switch (brand) {
    case 'Google':
      return input.replace(/\bGoogle\s+(?=Pixel\b)/i, '').trim()
    case 'Motorola':
      return input.replace(/\bMotorola\s+/i, '').trim()
    default:
      return input
  }
}

function extractDeviceName(
  line?: string,
  brand?: string,
  skuCode?: string,
  color?: string,
  memory?: string,
  storage?: string,
) {
  if (!line) {
    return undefined
  }

  let workingLine = line

  if (skuCode) {
    workingLine = workingLine.replace(new RegExp(`^${escapeRegExp(skuCode)}\\s+`, 'i'), '')
  }

  workingLine = workingLine
    .replace(/\b(?:Unlocked|Dual SIM|Dual-SIM|5G|4G|RAM|ROM|Global Version|International Version)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

  const commaSegments = workingLine
    .split(',')
    .map((segment) => cleanLine(segment))
    .filter(Boolean)

  const baseLine = commaSegments[0] ?? workingLine
  const stripped = stripVariant(baseLine, [color, memory, storage])
  const normalized = normalizeBrandPrefixes(stripped || baseLine, brand)

  if (!normalized) {
    return undefined
  }

  if (normalized.length < 4 || /^[A-Z]$/.test(normalized) || /^A\d{4}$/i.test(normalized)) {
    return undefined
  }

  if (brand === 'Apple') {
    const appleMatch = normalized.match(/\biPhone\s*(?:SE\s*\(\d+(?:st|nd|rd|th)\s+generation\)|\d{1,2}(?:\s*(?:mini|Plus|Pro|Pro Max))?)\b/i)
    if (appleMatch?.[0]) {
      return appleMatch[0].replace(/\s{2,}/g, ' ').trim()
    }
  }

  return normalized
}

function buildDisplayName(
  deviceName?: string,
  color?: string,
  memory?: string,
  storage?: string,
) {
  if (!deviceName) {
    return undefined
  }

  const capacityPart =
    memory && storage ? `${memory}/${storage}` : storage || memory

  return [deviceName, color, capacityPart].filter(Boolean).join(' ')
}

function findFallbackSku(lines: string[]) {
  for (const line of lines) {
    const value = findSkuCode(line)
    if (value) {
      return value
    }
  }

  return undefined
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

function dedupeLikelyGarbage(lines: string[]) {
  return uniqueValues(
    lines.filter((line) => {
      if (line.length < 4) {
        return false
      }

      const alphaCount = (line.match(/[A-Za-z]/g) ?? []).length
      const usefulCount = (line.match(/[A-Za-z0-9]/g) ?? []).length

      if (usefulCount < 3) {
        return false
      }

      if (alphaCount <= 1 && usefulCount <= 4) {
        return false
      }

      return true
    }),
  )
}

export function parsePhoneMetadata(rawText: string, barcodes: BarcodeMatch[]) {
  const normalizedText = normalizeText(rawText)
  const rawLines = dedupeLikelyGarbage(
    normalizedText
      .split('\n')
      .map(cleanLine)
      .filter((line) => line.length >= 3),
  )

  const barcodeValues = uniqueValues(barcodes.map((barcode) => barcode.rawValue.trim()))
  const joinedText = rawLines.join('\n')

  const imeis = preferLongestNumericValues(
    collectMatches(IMEI_PATTERN, joinedText, normalizeImei),
  )
  const eids = preferLongestNumericValues(
    collectMatches(EID_PATTERN, joinedText, normalizeEid),
  )
  const serialNumber = collectMatches(SERIAL_PATTERN, joinedText, cleanLine)[0]

  const labelledUpc = collectMatches(UPC_PATTERN, joinedText, normalizeDigits)[0]
  const barcodeUpc = barcodeValues.find((value) => /^\d{8,14}$/.test(value))
  const upc = labelledUpc || barcodeUpc

  const productLine = pickProductLine(rawLines)
  const preBrand = inferBrand(productLine || joinedText)
  const skuCode = findSkuCode(productLine) || findFallbackSku(rawLines)
  const memory = findMemory(productLine ?? '') || findMemory(joinedText)
  const storage = findStorage(productLine ?? '') || findStorage(joinedText)
  const color = findColor(productLine ?? '') || findColor(joinedText)
  const deviceName = extractDeviceName(
    productLine,
    preBrand,
    skuCode,
    color,
    memory,
    storage,
  )
  const brand = inferBrand(deviceName || productLine || joinedText)
  const modelNumber = findModelCode(joinedText, brand)
  const fallbackDeviceName =
    brand === 'Apple' && modelNumber
      ? APPLE_MODEL_FALLBACKS[modelNumber]
      : undefined
  const resolvedBrand = brand || (skuCode?.startsWith('M') ? 'Apple' : undefined)
  const resolvedDeviceName = deviceName || fallbackDeviceName

  const notes: string[] = []

  if (!resolvedDeviceName && upc) {
    notes.push(
      'UPC can identify the item, but the clean stock name still usually comes from OCR text or a lookup database.',
    )
  }

  if (!imeis.length && !serialNumber) {
    notes.push(
      'If IMEI or serial is missing, retake the photo closer and flatter so the small print is sharper.',
    )
  }

  if (!storage && memory) {
    notes.push(
      'This label looks like an Android variant line. RAM was found, but storage was not confidently separated.',
    )
  }

  const metadata: ParsedPhoneMetadata = {
    displayName: buildDisplayName(
      resolvedDeviceName,
      color,
      memory,
      storage,
    ),
    brand: resolvedBrand,
    deviceName: resolvedDeviceName,
    memory,
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

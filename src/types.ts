export type ScanProgress = {
  label: string
  value: number
}

export type BarcodeMatch = {
  format: string
  rawValue: string
}

export type LookupProof = {
  source: 'exact_upc' | 'exact_imei' | 'exact_serial' | 'imei_tac'
  identifierType: 'upc' | 'imei' | 'serial' | 'imei_tac'
  identifierValue: string
  confidence: 'exact' | 'family'
}

export type ParsedPhoneMetadata = {
  displayName?: string
  brand?: string
  deviceName?: string
  memory?: string
  storage?: string
  color?: string
  skuCode?: string
  modelNumber?: string
  serialNumber?: string
  imeis: string[]
  eids: string[]
  upc?: string
  lookupProof?: LookupProof
  notes: string[]
  rawLines: string[]
}

export type PhoneLabelScanResult = {
  rawText: string
  normalizedText: string
  ocrConfidence: number
  barcodes: BarcodeMatch[]
  barcodeDetectorSupported: boolean
  parsed: ParsedPhoneMetadata
}

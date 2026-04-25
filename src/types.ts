export type ScanProgress = {
  label: string
  value: number
}

export type BarcodeMatch = {
  format: string
  rawValue: string
}

export type ParsedPhoneMetadata = {
  displayName?: string
  brand?: string
  deviceName?: string
  storage?: string
  color?: string
  skuCode?: string
  modelNumber?: string
  serialNumber?: string
  imeis: string[]
  eids: string[]
  upc?: string
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

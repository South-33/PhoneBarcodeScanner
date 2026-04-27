import { useEffect, useId, useState } from 'react'
import './App.css'
import { scanPhoneLabel } from './lib/scanPhoneLabel'
import type { PhoneLabelScanResult, ScanProgress } from './types'

const EMPTY_PROGRESS: ScanProgress = {
  label: 'Waiting for image',
  value: 0,
}

const SUPPORTED_BRANDS = [
  'Apple',
  'Samsung',
  'Google Pixel',
  'Xiaomi',
  'Redmi',
  'POCO',
  'OnePlus',
  'OPPO',
  'vivo',
  'iQOO',
  'realme',
  'Motorola',
  'Nothing',
  'Huawei',
  'Honor',
  'Sony',
  'Nokia',
]

function formatLookupSource(source?: string) {
  switch (source) {
    case 'exact_upc':
      return 'Exact UPC match'
    case 'exact_imei':
      return 'Exact IMEI match'
    case 'exact_serial':
      return 'Exact serial match'
    case 'imei_tac':
      return 'IMEI TAC match'
    case 'exact_model_code':
      return 'Exact model-code match'
    case 'model_code_family':
      return 'Model-code family match'
    default:
      return '—'
  }
}

/* SVG icons inlined to keep it zero-dependency */
function IconCamera() {
  return (
    <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

function IconUpload() {
  return (
    <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function IconImage() {
  return (
    <svg className="preview-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  )
}

function IconLogoMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="3" height="12" rx="1" fill="#000" />
      <rect x="7" y="2" width="2" height="12" rx="1" fill="#000" />
      <rect x="11" y="2" width="3" height="12" rx="1" fill="#000" />
    </svg>
  )
}

function App() {
  const cameraInputId = useId()
  const uploadInputId = useId()

  const [scanResult, setScanResult] = useState<PhoneLabelScanResult | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [scanProgress, setScanProgress] = useState<ScanProgress>(EMPTY_PROGRESS)
  const [isScanning, setIsScanning] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  async function handleFile(file: File | null) {
    if (!file) return

    const nextPreviewUrl = URL.createObjectURL(file)
    if (previewUrl) URL.revokeObjectURL(previewUrl)

    setPreviewUrl(nextPreviewUrl)
    setScanResult(null)
    setErrorMessage(null)
    setIsScanning(true)
    setScanProgress({ label: 'Preparing image…', value: 0.06 })

    try {
      const result = await scanPhoneLabel(file, setScanProgress)
      setScanResult(result)
      setScanProgress({ label: 'Fields extracted', value: 1 })
    } catch (error) {
      setScanProgress(EMPTY_PROGRESS)
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Scan failed. Try a tighter crop with less glare.',
      )
    } finally {
      setIsScanning(false)
    }
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    event.target.value = ''
    void handleFile(file)
  }

  const metadata = scanResult?.parsed
  const lookupProof = metadata?.lookupProof

  const primaryFields = [
    { label: 'Brand',         value: metadata?.brand },
    { label: 'Device',        value: metadata?.deviceName },
    { label: 'RAM',           value: metadata?.memory },
    { label: 'Storage',       value: metadata?.storage },
    { label: 'Color',         value: metadata?.color },
    { label: 'Model no.',     value: metadata?.modelNumber },
    { label: 'SKU',           value: metadata?.skuCode },
    { label: 'Serial',        value: metadata?.serialNumber },
    { label: 'IMEI',          value: metadata?.imeis.join(', ') },
    { label: 'EID',           value: metadata?.eids.join(', ') },
    { label: 'UPC / EAN',     value: metadata?.upc },
  ]

  /* Header status text */
  const headerStatusText = isScanning
    ? 'Scanning…'
    : scanResult
      ? 'Scan complete'
      : 'Ready'

  const dotClass = isScanning ? 'scanning' : scanResult ? 'done' : ''

  return (
    <div className="app-shell">
      {/* ── Header ── */}
      <header className="app-header" role="banner">
        <div className="app-logo">
          <span className="app-logo-mark" aria-hidden="true">
            <IconLogoMark />
          </span>
          BoxScan
        </div>
        <div className="header-status">
          <span className={`status-dot ${dotClass}`} aria-hidden="true" />
          <span>{headerStatusText}</span>
          {scanResult ? (
            <span style={{ color: 'var(--ink-faint)' }}>
              · {Math.round(scanProgress.value * 100)}%
              {scanResult.ocrProvider !== 'none' && ` · OCR ${Math.round(scanResult.ocrConfidence)}%`}
            </span>
          ) : null}
        </div>
      </header>

      {/* ── Body ── */}
      <div className="app-body">

        {/* ── Left sidebar: capture ── */}
        <aside className="capture-sidebar" aria-label="Capture controls">
          <div className="capture-title-row">
            <p className="sidebar-eyebrow">Phone store demo</p>
            <p className="capture-focus">Barcode first</p>
          </div>

          <div className="capture-actions">
            <label className="btn btn-primary" htmlFor={cameraInputId}>
              <IconCamera />
              Use phone camera
            </label>
            <input
              id={cameraInputId}
              className="visually-hidden"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleInputChange}
              aria-label="Open phone camera to capture box label"
            />

            <label className="btn" htmlFor={uploadInputId}>
              <IconUpload />
              Upload photo
            </label>
            <input
              id={uploadInputId}
              className="visually-hidden"
              type="file"
              accept="image/*"
              onChange={handleInputChange}
              aria-label="Upload a photo of a phone box label"
            />
          </div>

          <div className="brand-support" aria-label="Supported phone brands">
            <p className="brand-support-label">Brand coverage</p>
            <div className="brand-chip-list">
              {SUPPORTED_BRANDS.map((brand) => (
                <span className="brand-chip" key={brand}>
                  {brand}
                </span>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="preview-wrap">
            <p className="preview-label">Preview</p>
            <div className="preview-frame" aria-label="Captured image preview">
              {previewUrl ? (
                <img src={previewUrl} alt="Phone box label preview" />
              ) : (
                <div className="preview-empty">
                  <IconImage />
                  <p>Image will appear here after capture</p>
                </div>
              )}
            </div>
          </div>

          {/* Progress */}
          <div className="progress-section" aria-live="polite" aria-label="Scan progress">
            <div className="progress-head">
              <span className="progress-label-text">{scanProgress.label}</span>
              <span className="progress-pct">{Math.round(scanProgress.value * 100)}%</span>
            </div>
            <div className="progress-track" role="progressbar" aria-valuenow={Math.round(scanProgress.value * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div
                className="progress-bar"
                style={{ width: `${Math.max(scanProgress.value, isScanning ? 0.04 : 0) * 100}%` }}
              />
            </div>
            {errorMessage ? <p className="error-msg">{errorMessage}</p> : null}
          </div>
        </aside>

        {/* ── Right pane: results ── */}
        <main className="results-pane" aria-label="Scan results">

          {/* Scan info bar */}
          {scanResult ? (
            <div className="scan-info-bar" role="status">
              <span>
                {scanResult.ocrProvider === 'none'
                  ? 'Resolved from barcode — no OCR needed'
                  : `OCR via ${scanResult.ocrProvider === 'google_vision' ? 'Google Vision' : 'Tesseract.js'} · confidence ${Math.round(scanResult.ocrConfidence)}%`}
              </span>
              <div className="scan-info-bar-chips">
                <span className="section-chip">
                  Barcode detector: {scanResult.barcodeDetectorSupported ? 'available' : 'unavailable'}
                </span>
                {scanResult.barcodes.length ? (
                  <span className="section-chip">{scanResult.barcodes.length} barcode{scanResult.barcodes.length > 1 ? 's' : ''} decoded</span>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Stock name hero */}
          <div>
            <div className={`stock-name-card ${metadata?.displayName ? 'populated' : ''}`}>
              <p className="stock-name-kicker">Suggested stock name</p>
              {metadata?.displayName ? (
                <p className="stock-name-value populated">{metadata.displayName}</p>
              ) : (
                <p className="stock-name-value">
                  <span className="stock-name-empty">Awaiting scan result…</span>
                </p>
              )}
            </div>
          </div>

          {/* Lookup proof */}
          {lookupProof || (scanResult && !lookupProof) ? (
            <div>
              <div className="section-head">
                <h2 className="section-title">Lookup match</h2>
                {lookupProof ? (
                  <span className="section-chip">{lookupProof.confidence === 'exact' ? 'Exact' : 'Family-level'}</span>
                ) : (
                  <span className="section-chip neutral">No match</span>
                )}
              </div>
              <div className="proof-grid">
                <div className="proof-card">
                  <p className="proof-kicker">Source</p>
                  <p className="proof-value">{formatLookupSource(lookupProof?.source)}</p>
                </div>
                <div className="proof-card">
                  <p className="proof-kicker">Matched identifier</p>
                  <p className="proof-value">
                    {lookupProof
                      ? `${lookupProof.identifierType}: ${lookupProof.identifierValue}`
                      : '—'}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {/* Metadata fields */}
          <div>
            <div className="section-head">
              <h2 className="section-title">Extracted fields</h2>
              {metadata ? (
                <span className="section-chip">
                  {primaryFields.filter(f => f.value).length} / {primaryFields.length} resolved
                </span>
              ) : null}
            </div>
            <div className="field-grid">
              {primaryFields.map((field) => {
                const hasVal = Boolean(field.value)
                return (
                  <div className={`field-card ${hasVal ? 'has-value' : ''}`} key={field.label}>
                    <p className="field-lbl">{field.label}</p>
                    <p className={`field-val ${hasVal ? 'populated' : ''}`}>
                      {field.value || <span className="field-dash">—</span>}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Notes / callouts */}
          {metadata?.notes.length ? (
            <div>
              <div className="section-head">
                <h2 className="section-title">Parser notes</h2>
              </div>
              <div className="callout-list">
                {metadata.notes.map((note) => (
                  <p className="callout" key={note}>{note}</p>
                ))}
              </div>
            </div>
          ) : null}

          {/* Barcode hits */}
          <div>
            <div className="section-head">
              <h2 className="section-title">Barcode hits</h2>
              {scanResult?.barcodes.length ? (
                <span className="section-chip">{scanResult.barcodes.length} decoded</span>
              ) : null}
            </div>
            <div className="barcode-list">
              {scanResult?.barcodes.length ? (
                scanResult.barcodes.map((barcode) => (
                  <div className="barcode-row" key={`${barcode.format}-${barcode.rawValue}`}>
                    <span className="barcode-format">{barcode.format}</span>
                    <span className="barcode-value">{barcode.rawValue}</span>
                  </div>
                ))
              ) : (
                <p className="empty-list-msg">
                  {scanResult
                    ? 'No barcodes decoded — OCR was used as fallback.'
                    : 'Barcode results will appear here after a scan.'}
                </p>
              )}
            </div>
          </div>

          {/* Raw OCR text */}
          <div>
            <div className="section-head">
              <h2 className="section-title">Raw OCR text</h2>
              <span className="section-chip neutral">Fallback</span>
            </div>
            <pre className="raw-output" aria-label="Raw OCR output">
              {scanResult?.normalizedText || 'OCR text will appear here after a scan with text fallback.'}
            </pre>
          </div>

        </main>
      </div>
    </div>
  )
}

export default App

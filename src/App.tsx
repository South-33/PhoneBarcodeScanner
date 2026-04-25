import { useEffect, useId, useState } from 'react'
import './App.css'
import { scanPhoneLabel } from './lib/scanPhoneLabel'
import type { PhoneLabelScanResult, ScanProgress } from './types'

const EMPTY_PROGRESS: ScanProgress = {
  label: 'Snap a box label or upload a photo to test the demo.',
  value: 0,
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
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  async function handleFile(file: File | null) {
    if (!file) {
      return
    }

    const nextPreviewUrl = URL.createObjectURL(file)

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }

    setPreviewUrl(nextPreviewUrl)
    setScanResult(null)
    setErrorMessage(null)
    setIsScanning(true)
    setScanProgress({
      label: 'Preparing image',
      value: 0.06,
    })

    try {
      const result = await scanPhoneLabel(file, setScanProgress)
      setScanResult(result)
      setScanProgress({
        label: 'Structured fields ready',
        value: 1,
      })
    } catch (error) {
      setScanProgress(EMPTY_PROGRESS)
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'The scan failed. Try a tighter crop with less glare.',
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
  const primaryFields = [
    {
      label: 'Suggested stock name',
      value: metadata?.displayName,
    },
    {
      label: 'Brand',
      value: metadata?.brand,
    },
    {
      label: 'Device',
      value: metadata?.deviceName,
    },
    {
      label: 'Memory / RAM',
      value: metadata?.memory,
    },
    {
      label: 'Storage',
      value: metadata?.storage,
    },
    {
      label: 'Color',
      value: metadata?.color,
    },
    {
      label: 'SKU / retail code',
      value: metadata?.skuCode,
    },
    {
      label: 'Model number',
      value: metadata?.modelNumber,
    },
    {
      label: 'Serial number',
      value: metadata?.serialNumber,
    },
    {
      label: 'IMEI',
      value: metadata?.imeis.join(', '),
    },
    {
      label: 'EID',
      value: metadata?.eids.join(', '),
    },
    {
      label: 'UPC / EAN',
      value: metadata?.upc,
    },
  ]

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Quick showcase for a phone shop workflow</p>
          <h1>Read the box label. Clean the phone metadata. Stop typing it by hand.</h1>
          <p className="hero-lead">
            This demo reads identifier codes from the label strip, extracts IMEI, serial,
            EID, and UPC/EAN, and only fills phone metadata when those identifiers match a
            lookup record.
          </p>

          <div className="workflow-strip" aria-label="Demo workflow">
            <span>1. Capture label</span>
            <span>2. OCR + barcode</span>
            <span>3. Clean metadata</span>
          </div>
        </div>

        <div className="control-panel">
          <div className="control-card">
            <p className="control-kicker">Input</p>
            <div className="action-row">
              <label className="action-button action-button-primary" htmlFor={cameraInputId}>
                Use phone camera
              </label>
              <input
                id={cameraInputId}
                className="visually-hidden"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleInputChange}
              />

              <label className="action-button" htmlFor={uploadInputId}>
                Upload image
              </label>
              <input
                id={uploadInputId}
                className="visually-hidden"
                type="file"
                accept="image/*"
                onChange={handleInputChange}
              />
            </div>

            <div className="tip-list">
              <p>Best results: fill the frame with the sticker, keep glare off the plastic, and include both the product line and barcode area.</p>
            </div>
          </div>

          <div className="status-card">
            <div className="status-head">
              <span className="status-label">
                {isScanning ? 'Scanning' : scanResult ? 'Latest scan' : 'Ready'}
              </span>
              <span className="status-value">{Math.round(scanProgress.value * 100)}%</span>
            </div>
            <div className="progress-track" aria-hidden="true">
              <div
                className="progress-bar"
                style={{ width: `${Math.max(scanProgress.value, 0.03) * 100}%` }}
              />
            </div>
            <p className="status-copy">{scanProgress.label}</p>
            {scanResult ? (
              <p className="status-copy subtle">
                OCR confidence {Math.round(scanResult.ocrConfidence)}%. Barcode detector{' '}
                {scanResult.barcodeDetectorSupported ? 'available' : 'not available'} in this browser.
              </p>
            ) : null}
            {errorMessage ? <p className="error-copy">{errorMessage}</p> : null}
          </div>
        </div>
      </section>

      <section className="content-grid">
        <article className="panel preview-panel">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Label preview</p>
              <h2>Camera shot or upload</h2>
            </div>
            {scanResult?.barcodes.length ? (
              <span className="chip">{scanResult.barcodes.length} barcode hit(s)</span>
            ) : null}
          </div>

          <div className="preview-frame">
            {previewUrl ? (
              <img src={previewUrl} alt="Phone box label preview" />
            ) : (
              <div className="empty-state">
                <p>Drop in a real box label photo to see the parser work.</p>
              </div>
            )}
          </div>

          <div className="info-grid compact">
            <div className="mini-card">
              <p className="mini-label">Why barcode only is not enough</p>
              <p>
                Identifier codes are the source of truth in this mode. Metadata only
                appears when IMEI, serial, or UPC matches a lookup record.
              </p>
            </div>
            <div className="mini-card">
              <p className="mini-label">Current demo scope</p>
              <p>
                Code-only demo. It extracts barcode-strip identifiers first, then resolves
                model details from lookup data instead of the printed product-name text.
              </p>
            </div>
          </div>
        </article>

        <article className="panel result-panel">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Structured output</p>
              <h2>Ready to paste into stock entry</h2>
            </div>
            {metadata?.displayName ? (
              <span className="chip accent">{metadata.displayName}</span>
            ) : null}
          </div>

          <div className="field-grid">
            {primaryFields.map((field) => (
              <div className="field-card" key={field.label}>
                <p className="field-label">{field.label}</p>
                <p className="field-value">{field.value || '-'}</p>
              </div>
            ))}
          </div>

          {metadata?.notes.length ? (
            <div className="callout-list">
              {metadata.notes.map((note) => (
                <p className="callout" key={note}>
                  {note}
                </p>
              ))}
            </div>
          ) : null}
        </article>

        <article className="panel raw-panel">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Raw OCR</p>
              <h2>Identifier text the model read</h2>
            </div>
          </div>

          <pre className="raw-output">
            {scanResult?.normalizedText || 'OCR output will appear here after the first scan.'}
          </pre>
        </article>

        <article className="panel barcode-panel">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Barcode hits</p>
              <h2>Native browser detection when available</h2>
            </div>
          </div>

          <div className="barcode-list">
            {scanResult?.barcodes.length ? (
              scanResult.barcodes.map((barcode) => (
                <div className="barcode-row" key={`${barcode.format}-${barcode.rawValue}`}>
                  <span>{barcode.format}</span>
                  <strong>{barcode.rawValue}</strong>
                </div>
              ))
            ) : (
              <p className="empty-copy">
                No barcode detected yet. OCR can still extract useful fields even when the
                browser does not expose `BarcodeDetector`.
              </p>
            )}
          </div>
        </article>
      </section>
    </main>
  )
}

export default App

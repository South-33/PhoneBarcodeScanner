# Phone Box OCR Demo

Simple React + Vite demo for showing how a phone shop can turn a box-label photo into structured stock fields.

## What it does

- Uses phone camera capture or normal image upload
- Preprocesses the image for OCR
- Runs OCR in the browser with `tesseract.js`
- Uses the native `BarcodeDetector` API when the browser supports it
- Parses likely phone metadata into fields like:
  - device name
  - storage
  - color
  - SKU / retail code
  - model number
  - serial number
  - IMEI
  - EID
  - UPC / EAN

## Why OCR is needed

For retail phone boxes, the barcode usually gives you an identifier such as UPC / GTIN. It does not reliably give you the human-friendly sales metadata by itself. The useful stock name usually comes from the printed label text, so this demo combines barcode reading with OCR.

## Run it

```bash
pnpm install
pnpm dev
```

Build for production:

```bash
pnpm build
```

## Demo scope

- Optimized first for iPhone-style box labels like `MHDH3QN/A iPhone 11, Black, 128GB`
- Includes generic parsing for other common smartphone brands
- Keeps everything browser-only for a fast showcase

## Next step if the demo lands

Add a GTIN / catalog lookup source or model catalog table so barcode hits can enrich OCR results and improve brand-wide coverage.

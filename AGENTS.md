This is the project's AGENTS.md

## Notes
- Demo scope -> keep v1 browser-only with file capture/upload, `tesseract.js`, and optional `BarcodeDetector`; live camera streams or server OCR add setup friction without helping the showcase.
- Barcode labels -> UPC/GTIN is usually just the identifier, so clean stock metadata should come from OCR text unless a product lookup database is added.
- OCR quality -> the image preprocessing in `src/lib/imageTools.ts` matters; glare on shrink-wrap and wide shots are the main failure modes to fix before changing parsing rules.
- Docs -> Apple confirms iPhone packaging includes serial, EID, and IMEI/MEID on the box: https://support.apple.com/en-us/108037
- Docs -> Tesseract.js recommends reusing a worker, and Tesseract docs note higher-resolution images improve OCR: https://github.com/naptha/tesseract.js and https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html

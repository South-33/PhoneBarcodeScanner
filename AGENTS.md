This is the project's AGENTS.md

## Notes
- Demo scope -> keep v1 browser-only for phone use; decode barcode-strip identifiers first and only fall back to OCR when bars are missing or unreadable.
- Code-only mode -> do not derive device name, storage, or color from the printed product line; only show metadata that resolves from IMEI/serial/GTIN lookup data.
- Model-code path -> support major brand identifier formats (`SM-`, `XT`, `RMX`, `CPH`, `V`, `XQ-`, `TA-`, Xiaomi numeric codes, etc.); when exact catalog data is missing, fall back to brand + model code with family-level proof.
- Android variant lines -> parse RAM and storage separately; labels like `8GB+256GB` or `12GB/512GB` should not treat the first capacity as storage.
- OCR quality -> the image preprocessing in `src/lib/imageTools.ts` matters; glare on shrink-wrap and wide shots are the main failure modes to fix before changing parsing rules.
- Docs -> Apple confirms iPhone packaging includes serial, EID, and IMEI/MEID on the box: https://support.apple.com/en-us/108037
- Docs -> Tesseract.js recommends reusing a worker, and Tesseract docs note higher-resolution images improve OCR: https://github.com/naptha/tesseract.js and https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html

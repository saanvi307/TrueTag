# TruTag Product Scanner OCR

The Product Scanner runs server-side OCR using **Tesseract.js 7** against images already saved in the TruTag MySQL database. Product photographs are not sent to a third-party OCR service. Administrators can analyze up to 10 saved photos in one request. The English language model is bundled with the application under `assets/tessdata`, so OCR does not need to download a model at runtime.

To use a different language model directory, set optional `TESSERACT_LANG_PATH` to a directory containing `eng.traineddata.gz`. `TESSERACT_CACHE_PATH` can optionally set the worker cache directory; by default it uses the operating system temporary directory.

The admin-only endpoint is `POST /api/admin/product-scanner/ocr` with JSON `{ "scanReference": "<current scan UUID>" }`. It returns the recognized declaration values, Tesseract confidence, and source image name/view/text excerpt/pixel bounding box for each detected value. A field without matching OCR text is returned as `value: null`, confidence `0`, and an empty evidence list. Declaration visibility is only an OCR text-detection estimate, not a legal or regulatory compliance determination.

OCR is recognition, not verification. Review extracted values against the original package images. Recognition and field matching can miss text or misread low-resolution, curved, reflective, or multilingual packaging. English is the configured OCR language; no declaration is inferred when the English label patterns are not recognized.

'use client';

import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { isProductScanReference, PRODUCT_SCAN_IMAGE_MAX_BYTES, PRODUCT_SCAN_IMAGE_TYPES, type ProductImageView } from '@/lib/product-scan-image';
import type { ProductLabelOcrResult, ProductDeclaration } from '@/lib/product-label-parser';
import './product-scanner.css';
import '../admin-dashboard.css';

const nav = [
  { label: 'WORKSPACE', items: [{ label: 'Overview', href: '/', icon: '▦' }, { label: 'Officers', href: '/officers', icon: '♙' }, { label: 'Food businesses', href: '/food-businesses', icon: '▤' }, { label: 'Assignments', href: '/assignments', icon: '▣' }, { label: 'Product Scanner', href: '/product-scanner', icon: '⌕' }] },
  { label: 'INSIGHTS', items: [{ label: 'QR verification', href: '/verify', icon: '⌗' }, { label: 'Verification logs', href: '/verification-logs', icon: '≡' }, { label: 'Reports & activity', href: '/#reports', icon: '⌁' }] },
];
const views: { value: ProductImageView; label: string; description: string }[] = [
  { value: 'front', label: 'Front', description: 'Product name and front label' },
  { value: 'back', label: 'Back', description: 'Ingredients and licence details' },
  { value: 'side', label: 'Sides', description: 'Additional panels and packaging' },
];
const MAX_IMAGES_PER_SCAN = 20;
const declarationLabels: Record<keyof ProductLabelOcrResult['declarations'], string> = {
  manufacturerPackerImporterDetails: 'Manufacturer / packer / importer details',
  countryOfOrigin: 'Country of origin',
  genericFoodName: 'Generic food name',
  netQuantity: 'Net quantity',
  manufacturingMonthYear: 'Manufacturing month / year',
  bestBeforeUseBy: 'Best before / use by',
  mrp: 'MRP',
  unitSalePrice: 'Unit sale price',
  consumerCareDetails: 'Consumer care details',
  declarationVisibility: 'Declaration visibility',
};
type SavedImage = { id: number; view: ProductImageView; filename: string; mimeType: string; byteSize: number; uploadedAt: string; url: string };
type DraftImage = { localId: string; file: File; preview: string; view: ProductImageView; status: 'ready' | 'uploading' | 'error'; error?: string; replacesImageId?: number };
type CameraTarget = { view: ProductImageView; draftId?: string; imageId?: number };

async function readResponse(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'The request could not be completed.');
  return body;
}

export default function ProductScannerClient({ username }: { username: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scanReference, setScanReference] = useState('');
  const [savedImages, setSavedImages] = useState<SavedImage[]>([]);
  const [drafts, setDrafts] = useState<DraftImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [ocrResult, setOcrResult] = useState<ProductLabelOcrResult | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraTarget, setCameraTarget] = useState<CameraTarget | null>(null);
  const [cameraBusy, setCameraBusy] = useState(false);
  const inputRefs = useRef<Record<ProductImageView, HTMLInputElement | null>>({ front: null, back: null, side: null });
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const loadImages = useCallback(async (reference: string) => {
    setLoading(true);
    try {
      const result = await readResponse(await fetch(`/api/admin/product-scanner/images?scan=${encodeURIComponent(reference)}`, { cache: 'no-store' }));
      setSavedImages(result.images as SavedImage[]);
      setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load product scan images.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    let reference = search.get('scan') || '';
    if (!isProductScanReference(reference)) {
      if (!window.crypto?.randomUUID) { setError('Secure random ID generation is unavailable in this browser. Use a current browser over HTTPS or localhost.'); setLoading(false); return; }
      reference = window.crypto.randomUUID();
      search.set('scan', reference);
      window.history.replaceState(null, '', `${window.location.pathname}?${search.toString()}`);
    }
    setScanReference(reference);
  }, []);

  useEffect(() => { if (scanReference) void loadImages(scanReference); }, [scanReference, loadImages]);

  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
  }, [cameraOpen]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
    setCameraBusy(false);
  }, []);

  useEffect(() => () => { streamRef.current?.getTracks().forEach(track => track.stop()); }, []);

  function addDraft(file: File, view: ProductImageView, replacesImageId?: number) {
    const preview = URL.createObjectURL(file);
    setDrafts(current => [...current, { localId: window.crypto.randomUUID(), file, preview, view, status: 'ready', replacesImageId }]);
    setNotice('');
    setOcrResult(null);
  }

  function addFiles(fileList: FileList | null, view: ProductImageView) {
    if (!fileList?.length) return;
    setError('');
    const incoming = Array.from(fileList);
    if (incoming.length + savedImages.length + drafts.length > MAX_IMAGES_PER_SCAN) {
      setError(`A product scan can contain up to ${MAX_IMAGES_PER_SCAN} images.`);
      return;
    }
    for (const file of incoming) {
      if (!(PRODUCT_SCAN_IMAGE_TYPES as readonly string[]).includes(file.type)) { setError(`${file.name}: choose a JPEG, PNG or WebP image.`); continue; }
      if (file.size < 1 || file.size > PRODUCT_SCAN_IMAGE_MAX_BYTES) { setError(`${file.name}: each image must be between 1 byte and 6 MB.`); continue; }
      addDraft(file, view);
    }
  }

  function onDrop(event: DragEvent<HTMLElement>, view: ProductImageView) {
    event.preventDefault();
    addFiles(event.dataTransfer.files, view);
  }

  async function openCamera(target: CameraTarget) {
    setCameraError('');
    setCameraTarget(target);
    if (!navigator.mediaDevices?.getUserMedia) { setCameraError('Live camera capture is unavailable. Use a supported browser over HTTPS or localhost.'); setCameraOpen(true); return; }
    try {
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      setCameraOpen(true);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      setCameraError(name === 'NotAllowedError' ? 'Camera access was denied. Allow camera access in your browser settings and try again.' : name === 'NotFoundError' ? 'No camera was found. You can still choose an image file.' : 'The camera could not be started. Check browser permissions or choose an image file.');
      setCameraOpen(true);
    }
  }

  async function captureFrame() {
    const video = videoRef.current;
    if (!video || !cameraTarget || !video.videoWidth || !video.videoHeight) { setCameraError('Camera is still starting. Try again in a moment.'); return; }
    setCameraBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not capture an image from the camera.');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error('The camera did not return an image. Try again.');
      if (blob.size > PRODUCT_SCAN_IMAGE_MAX_BYTES) throw new Error('This camera image is larger than 6 MB. Move closer or use a smaller image.');
      const filename = `${cameraTarget.view}-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
      const file = new File([blob], filename, { type: 'image/jpeg', lastModified: Date.now() });
      const preview = URL.createObjectURL(file);
      if (cameraTarget.draftId) {
        setDrafts(current => current.map(draft => {
          if (draft.localId !== cameraTarget.draftId) return draft;
          URL.revokeObjectURL(draft.preview);
          return { ...draft, file, preview, status: 'ready', error: undefined };
        }));
      } else setDrafts(current => [...current, { localId: window.crypto.randomUUID(), file, preview, view: cameraTarget.view, status: 'ready', replacesImageId: cameraTarget.imageId }]);
      setError('');
      setNotice('');
      stopCamera();
    } catch (err) { setCameraError(err instanceof Error ? err.message : 'Camera capture failed.'); setCameraBusy(false); }
  }

  function removeDraft(localId: string) {
    setDrafts(current => {
      const draft = current.find(item => item.localId === localId);
      if (draft) URL.revokeObjectURL(draft.preview);
      return current.filter(item => item.localId !== localId);
    });
  }

  async function removeSaved(image: SavedImage) {
    if (!window.confirm(`Remove ${image.filename} from this product scan?`)) return;
    setError(''); setNotice('');
    try {
      await readResponse(await fetch(`/api/admin/product-scanner/images/${image.id}`, { method: 'DELETE' }));
      setSavedImages(current => current.filter(item => item.id !== image.id));
      setOcrResult(null);
      setNotice('Image removed from this product scan.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not remove this image.'); }
  }

  async function uploadDrafts() {
    if (!scanReference || uploading || !drafts.length) return;
    setUploading(true); setError(''); setNotice('');
    let uploaded = 0;
    let failed = 0;
    let replacementWarning = '';
    for (const draft of [...drafts]) {
      setDrafts(current => current.map(item => item.localId === draft.localId ? { ...item, status: 'uploading', error: undefined } : item));
      try {
        const form = new FormData();
        form.append('scanReference', scanReference);
        form.append('view', draft.view);
        form.append('image', draft.file);
        await readResponse(await fetch('/api/admin/product-scanner/images', { method: 'POST', body: form }));
        if (draft.replacesImageId) {
          try { await readResponse(await fetch(`/api/admin/product-scanner/images/${draft.replacesImageId}`, { method: 'DELETE' })); }
          catch { replacementWarning = 'A replacement image was saved, but the previous image could not be removed. You can remove it from the saved images below.'; }
        }
        uploaded += 1;
        removeDraft(draft.localId);
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : 'Upload failed.';
        setDrafts(current => current.map(item => item.localId === draft.localId ? { ...item, status: 'error', error: message } : item));
      }
    }
    await loadImages(scanReference);
    if (uploaded) setNotice(`${uploaded} ${uploaded === 1 ? 'image' : 'images'} securely saved to this product scan.${failed ? ` ${failed} could not be uploaded.` : ''}`);
    if (replacementWarning) setError(replacementWarning);
    else if (!uploaded && failed) setError(`${failed} ${failed === 1 ? 'image was' : 'images were'} not uploaded. Review the messages and retry.`);
    setUploading(false);
  }

  async function analyseDeclarations() {
    if (!scanReference || !savedImages.length || analysing || uploading || drafts.length) return;
    setAnalysing(true); setError(''); setNotice(''); setOcrResult(null);
    try {
      const response = await fetch('/api/admin/product-scanner/ocr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanReference }),
      });
      const result = await readResponse(response) as ProductLabelOcrResult;
      setOcrResult(result);
      setNotice('OCR extraction finished. Review each value and its source image before relying on it.');
    } catch (err) { setError(err instanceof Error ? err.message : 'OCR extraction could not be completed.'); }
    finally { setAnalysing(false); }
  }

  function startNewScan() {
    if (drafts.length && !window.confirm('Discard the images that have not been saved and start a new scan?')) return;
    drafts.forEach(draft => URL.revokeObjectURL(draft.preview));
    setDrafts([]); setSavedImages([]); setError(''); setNotice(''); setOcrResult(null);
    const reference = window.crypto.randomUUID();
    setScanReference(reference);
    window.history.pushState(null, '', `${window.location.pathname}?scan=${reference}`);
  }

  return <div className="app-shell admin-shell">
    {mobileOpen && <button className="admin-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'admin-sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><span/><span/><span/><span/></div><div className="brand-copy"><strong>trutag</strong><small>GOVERNMENT PORTAL</small></div><button className="admin-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">×</button></div>
      <div className="org-switch"><div className="org-emblem">भारत</div><div className="org-copy"><strong>FSSAI Administration</strong><span>Government of India</span></div></div>
      <nav className="navigation" aria-label="Main navigation">{nav.map(group => <div className="nav-group" key={group.label}><div className="nav-label">{group.label}</div>{group.items.map(item => <Link key={item.label} className={`nav-item ${item.href === '/product-scanner' ? 'selected' : ''}`} href={item.href} onClick={() => setMobileOpen(false)}><span className="admin-nav-icon">{item.icon}</span><span>{item.label}</span></Link>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="side-divider"/><div className="sidebar-user"><div className="user-avatar">{username.slice(0, 2).toUpperCase()}</div><div className="user-copy"><strong>{username}</strong><span>Administrator</span></div></div><div className="version">TRUTAG ADMIN · LIVE DATA</div></div>
    </aside>
    <main className="main-area">
      <header className="topbar admin-topbar"><button className="admin-mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation">☰</button><div className="breadcrumb">Workspace <span>›</span> <strong>Product Scanner</strong></div><div className="topbar-right"><span className="live-status"><i/>Secure government network</span><span className="top-separator"/><div className="top-user"><div className="user-avatar">{username.slice(0, 2).toUpperCase()}</div><div className="top-user-copy"><strong>{username}</strong><span>Administrator</span></div></div></div></header>
      <div className="page-content admin-content scanner-content">
        <section className="admin-welcome scanner-welcome"><div><div className="eyebrow"><span className="eyebrow-line"/>FSSAI ADMINISTRATION</div><h1>Product Scanner</h1><p className="welcome-subtitle">Capture and securely store product label images.</p></div><button className="scanner-new-button" type="button" onClick={startNewScan}>＋ New product scan</button></section>
        <div className="scanner-scan-ref"><span>PRODUCT SCAN</span><code>{scanReference || 'Preparing secure scan reference…'}</code></div>
        {error && <div className="scanner-alert" role="alert"><b>Action needed</b><span>{error}</span>{scanReference && <button type="button" onClick={() => void loadImages(scanReference)}>Retry</button>}</div>}
        {notice && <div className="scanner-notice" role="status">✓ {notice}</div>}
        <section className="scanner-layout" aria-label="Product label image capture and upload">
          <article className="admin-panel scanner-upload-panel">
            <div className="admin-panel-heading"><div><h2>Product label images</h2><p>Upload or capture front, back and side views. Images are saved privately in TruTag.</p></div><span className="scanner-count">{savedImages.length + drafts.length} / {MAX_IMAGES_PER_SCAN}</span></div>
            {views.map(view => {
              const saved = savedImages.filter(image => image.view === view.value);
              const pending = drafts.filter(image => image.view === view.value);
              return <section className="scanner-view-section" key={view.value} onDragOver={event => event.preventDefault()} onDrop={event => onDrop(event, view.value)}>
                <div className="scanner-view-heading"><div><span className={`scanner-view-index ${view.value}`}>{view.value === 'front' ? 'F' : view.value === 'back' ? 'B' : 'S'}</span><span><b>{view.label}</b><small>{view.description}</small></span></div><div className="scanner-view-actions"><label className="scanner-small-button">＋ Upload<input ref={element => { inputRefs.current[view.value] = element; }} type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={event => { addFiles(event.target.files, view.value); event.target.value = ''; }} /></label><button className="scanner-small-button camera" type="button" onClick={() => void openCamera({ view: view.value })}>◎ Camera</button></div></div>
                {(saved.length > 0 || pending.length > 0) ? <div className="scanner-image-grid">
                  {saved.map(image => <figure className="scanner-image-card" key={`saved-${image.id}`}><img src={image.url} alt={`${view.label} product image: ${image.filename}`} loading="lazy"/><figcaption><b title={image.filename}>{image.filename}</b><small>{(image.byteSize / (1024 * 1024)).toFixed(2)} MB · Saved</small></figcaption><div className="scanner-card-actions"><button type="button" onClick={() => void openCamera({ view: view.value, imageId: image.id })}>Retake</button><button type="button" className="remove" onClick={() => void removeSaved(image)}>Remove</button></div></figure>)}
                  {pending.map(image => <figure className={`scanner-image-card ${image.status}`} key={image.localId}><img src={image.preview} alt={`${view.label} preview: ${image.file.name}`}/><figcaption><b title={image.file.name}>{image.file.name}</b><small>{image.status === 'uploading' ? 'Uploading…' : image.error || `${(image.file.size / (1024 * 1024)).toFixed(2)} MB · Not saved`}</small></figcaption><div className="scanner-card-actions"><button type="button" disabled={uploading} onClick={() => void openCamera({ view: view.value, draftId: image.localId })}>Retake</button><button type="button" className="remove" disabled={uploading} onClick={() => removeDraft(image.localId)}>Remove</button></div></figure>)}
                </div> : <div className="scanner-view-empty"><span>＋</span><b>Add {view.label.toLowerCase()} image</b><small>Choose a file or take a photo with the camera</small></div>}
              </section>;
            })}
            <div className="scanner-upload-footer"><span>{loading ? 'Loading saved images…' : `${savedImages.length} saved · ${drafts.length} ready to upload`}</span><div className="scanner-footer-actions"><button type="button" className="scanner-analyse-button" disabled={!savedImages.length || uploading || analysing || !!drafts.length} onClick={() => void analyseDeclarations()}>{analysing ? 'Reading label text…' : 'Extract declarations'}</button><button type="button" className="scanner-save-button" disabled={!drafts.length || uploading || !scanReference} onClick={() => void uploadDrafts()}>{uploading ? 'Uploading images…' : `Upload ${drafts.length || ''} ${drafts.length === 1 ? 'image' : 'images'}`}</button></div></div>
          </article>
          <aside className="admin-panel scanner-guide">
            <div className="scanner-guide-mark"><span>⌕</span></div><span className="scanner-guide-kicker">IMAGE GUIDANCE</span><h2>Capture a clear label</h2><p>Use the front, back and side sections to keep product photographs organized.</p>
            <div className="scanner-guide-list"><div><span>01</span><p><b>Keep the label in frame</b><small>Include the full panel and readable product details.</small></p></div><div><span>02</span><p><b>Use good lighting</b><small>Avoid glare and heavy shadows.</small></p></div><div><span>03</span><p><b>Images stay private</b><small>Only signed-in administrators can view or remove them.</small></p></div></div>
            <div className="scanner-privacy"><span>◇</span><p>JPEG, PNG or WebP · maximum 6 MB per image · up to {MAX_IMAGES_PER_SCAN} images per scan.</p></div>
          </aside>
        </section>
        {analysing && <div className="scanner-ocr-progress" role="status"><span className="scanner-spinner"/> Tesseract OCR is reading the saved photos. This can take a little while.</div>}
        {ocrResult && <section className="admin-panel scanner-ocr-results" aria-label="OCR declaration extraction results"><header className="scanner-ocr-heading"><div><span className="scanner-guide-kicker">OCR EXTRACTION · {ocrResult.engine}</span><h2>Extracted label declarations</h2><p>Values are copied from OCR text. Missing declarations remain “Not detected”; confidence reflects text-recognition confidence, not correctness.</p></div><span className="scanner-result-count">{ocrResult.sourceImageCount} photos</span></header><div className="scanner-declaration-grid">{(Object.entries(ocrResult.declarations) as [keyof ProductLabelOcrResult['declarations'], ProductDeclaration | ProductLabelOcrResult['declarations']['declarationVisibility']][]).map(([key, item]) => { const isVisibility = key === 'declarationVisibility'; const value = isVisibility ? String(item.value).replaceAll('_', ' ') : item.value; const confidence = item.confidence; const imageEvidence = item.imageEvidence; return <article className="scanner-declaration-card" key={key}><div className="scanner-declaration-top"><h3>{declarationLabels[key]}</h3><span className={`scanner-confidence ${confidence >= 80 ? 'high' : confidence >= 55 ? 'medium' : 'low'}`}>{confidence}%</span></div><p className={value ? 'detected-value' : 'missing-value'}>{value || 'Not detected'}</p>{imageEvidence.length > 0 && <div className="scanner-evidence-list">{imageEvidence.slice(0, 5).map((source, index) => { const image = savedImages.find(saved => saved.id === source.imageId); return <div className="scanner-evidence-item" key={`${source.imageId}-${index}`}>{image && <img src={image.url} alt=""/>}<span><b>{source.view} · {source.filename}</b><small>“{source.excerpt}”</small><small>Image position: {source.bbox.x0}, {source.bbox.y0} to {source.bbox.x1}, {source.bbox.y1}px</small></span></div>; })}</div>}{isVisibility && <small className="scanner-visibility-note">{(item as ProductLabelOcrResult['declarations']['declarationVisibility']).note}</small>}</article>; })}</div><div className="scanner-ocr-meta"><span>Processed {new Date(ocrResult.processedAt).toLocaleString()}</span><span>Review OCR text against the source packaging. This is not a compliance decision.</span></div></section>}
        <footer className="admin-footer scanner-footer"><span>TruTag · FSSAI Administration Portal</span><span>Private product label image storage</span></footer>
      </div>
    </main>
    {cameraOpen && <div className="scanner-camera-backdrop" role="presentation"><section className="scanner-camera-modal" role="dialog" aria-modal="true" aria-labelledby="scanner-camera-title"><header><div><span>LIVE CAPTURE · {cameraTarget?.view.toUpperCase()}</span><h2 id="scanner-camera-title">Take product photo</h2></div><button type="button" onClick={stopCamera} aria-label="Close camera">×</button></header>{cameraError ? <div className="scanner-camera-error" role="alert">{cameraError}</div> : <div className="scanner-camera-frame"><video ref={videoRef} autoPlay playsInline muted aria-label="Live camera preview"/><span className="scanner-camera-guide-line"/></div>}<footer><p>Camera access is used only to capture this image.</p><div><button type="button" className="scanner-cancel-button" onClick={stopCamera}>Cancel</button><button type="button" className="scanner-capture-button" onClick={() => void captureFrame()} disabled={cameraBusy || !streamRef.current}>{cameraBusy ? 'Capturing…' : 'Capture image'}</button></div></footer></section></div>}
  </div>;
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import '../../officer-dashboard.css';
import './inspection-passport.css';

const items = [
  ['food_storage', 'Food storage', 'Check segregation, covered storage, stock rotation and protection from contamination.'],
  ['personal_hygiene', 'Personal hygiene', 'Check handwashing, protective clothing and hygienic practices of food handlers.'],
  ['sanitation', 'Sanitation', 'Check cleaning schedules, equipment cleanliness, waste handling and drainage.'],
  ['pest_control', 'Pest control', 'Check pest prevention measures, monitoring records and evidence of infestation.'],
  ['water_quality_documentation', 'Water quality documentation', 'Review current water test reports and records for water used in food operations.'],
  ['food_labelling', 'Food labelling', 'Check required declarations, legibility, dates and label accuracy for applicable products.'],
  ['temperature_control', 'Temperature control', 'Check temperature monitoring and safe holding, cooking and cold storage temperatures.'],
] as const;
type Key = (typeof items)[number][0];
type Choice = 'compliant' | 'non_compliant' | 'not_applicable';
type ResponseItem = { key: Key; response: Choice | ''; observation: string; updatedAt?: string };
type Data = { assignment: { id: number; inspectionType: string; inspectionDate: string; jurisdiction: string; status: string; businessName: string; licenceReference: string; businessCategory: string; businessAddress: string; businessDistrict: string }; canEdit: boolean; responses: ResponseItem[] };
type Evidence = { id: number; filename: string; mimeType: string; byteSize: number; uploadedAt?: string; url: string };
type Upload = { id: string; filename: string; preview: string; status: 'uploading' | 'error'; message?: string };

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'The request could not be completed.');
  return body;
}

export default function InspectionPassportClient({ assignmentId, username }: { assignmentId: string; username: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [responses, setResponses] = useState<ResponseItem[]>(items.map(([key]) => ({ key, response: '', observation: '' })));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [uploadNotice, setUploadNotice] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result: Data = await api(`/api/officer/assignments/${encodeURIComponent(assignmentId)}/checklist`, { cache: 'no-store' });
      setData(result);
      const byKey = new Map(result.responses.map(item => [item.key, item]));
      setResponses(items.map(([key]) => ({ key, response: byKey.get(key)?.response || '', observation: byKey.get(key)?.observation || '', updatedAt: byKey.get(key)?.updatedAt })));
      const evidenceResult = await api(`/api/officer/assignments/${encodeURIComponent(assignmentId)}/evidence`, { cache: 'no-store' });
      setEvidence(evidenceResult.evidence);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load the inspection checklist.'); }
    finally { setLoading(false); }
  }, [assignmentId]);
  useEffect(() => { void load(); }, [load]);

  function update(key: Key, patch: Partial<ResponseItem>) {
    setResponses(current => current.map(item => item.key === key ? { ...item, ...patch } : item));
    setSaved('');
  }
  async function save(completeInspection = false) {
    if (responses.some(item => !item.response)) { setError('Choose a status for each checklist item before saving.'); return; }
    setSaving(true); setError(''); setSaved('');
    try {
      const result = await api(`/api/officer/assignments/${encodeURIComponent(assignmentId)}/checklist`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ responses, complete: completeInspection }) });
      setResponses(current => current.map(item => ({ ...item, updatedAt: result.responses.find((savedItem: ResponseItem) => savedItem.key === item.key)?.updatedAt })));
      setSaved(completeInspection ? 'Inspection completed. Return to your dashboard to generate its verification QR.' : 'Checklist saved successfully.');
      if (completeInspection) await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save checklist responses.'); }
    finally { setSaving(false); }
  }

  async function uploadFiles(fileList: FileList | null) {
    if (!fileList || !data?.canEdit) return;
    const files = Array.from(fileList);
    setUploading(true); setUploadNotice('');
    let completed = 0;
    for (const file of files) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const preview = URL.createObjectURL(file);
      const fail = (message: string) => {
        setUploads(current => [...current.filter(upload => upload.id !== id), { id, filename: file.name, preview, status: 'error', message }]);
      };
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { fail('Choose a JPEG, PNG, or WebP image.'); continue; }
      if (file.size < 1 || file.size > 6 * 1024 * 1024) { fail('Each image must be 6 MB or smaller.'); continue; }
      setUploads(current => [...current.filter(upload => upload.id !== id), { id, filename: file.name, preview, status: 'uploading' }]);
      try {
        const form = new FormData(); form.append('image', file);
        await api(`/api/officer/assignments/${encodeURIComponent(assignmentId)}/evidence`, { method: 'POST', body: form });
        completed += 1;
        setUploads(current => current.filter(upload => upload.id !== id));
        URL.revokeObjectURL(preview);
      } catch (err) {
        setUploads(current => current.map(upload => upload.id === id ? { ...upload, status: 'error', message: err instanceof Error ? err.message : 'Upload failed.' } : upload));
      }
    }
    try {
      const result = await api(`/api/officer/assignments/${encodeURIComponent(assignmentId)}/evidence`, { cache: 'no-store' });
      setEvidence(result.evidence);
    } catch { /* Keep upload outcomes visible if refreshing the evidence list fails. */ }
    setUploadNotice(completed ? `${completed} ${completed === 1 ? 'image' : 'images'} uploaded successfully.` : '');
    setUploading(false);
  }

  const completed = responses.filter(item => item.response).length;
  const date = data?.assignment.inspectionDate ? new Date(`${data.assignment.inspectionDate}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  return <main className="officer-dashboard"><header className="od-topbar"><Link className="od-brand" href="/officer-dashboard"><span className="od-brand-mark"><i/><i/><i/><i/></span><span><b>trutag</b><small>FOOD SAFETY OFFICER PORTAL</small></span></Link><div className="od-session"><span className="od-secure"><i/>Secure session</span><span className="od-user-chip">{username.slice(0, 2).toUpperCase()}</span><button onClick={() => void signOut({ callbackUrl: '/sign-in' })}>Sign out</button></div></header>
    <div className="od-content passport-content"><div className="passport-back"><Link href="/officer-dashboard">← Back to assigned inspections</Link><span>Signed in as <b>{username}</b></span></div>
      {loading && !data ? <div className="od-loading">Loading inspection passport…</div> : error && !data ? <div className="od-error-banner">{error}<button onClick={() => void load()}>Retry</button></div> : data && <>
        <section className="passport-heading"><div><div className="od-eyebrow"><i/>DIGITAL INSPECTION PASSPORT</div><h1>Inspection checklist</h1><p>Record findings for this assignment. Responses are saved to the inspection record.</p></div><div className="passport-heading-tools"><a className="passport-pdf-button" href={`/api/officer/assignments/${encodeURIComponent(assignmentId)}/pdf`} download>Download PDF passport</a><div className="passport-progress"><b>{completed}<small> / 7</small></b><span>items completed</span></div></div></section>
        <section className="passport-assignment"><div><small>ASSIGNMENT #{String(data.assignment.id).padStart(5, '0')}</small><h2>{data.assignment.businessName}</h2><p>{data.assignment.businessCategory} <span>·</span> FSSAI licence {data.assignment.licenceReference}</p></div><div className="passport-assignment-meta"><span><small>Inspection type</small><b>{data.assignment.inspectionType}</b></span><span><small>Date</small><b>{date}</b></span><span><small>Jurisdiction</small><b>{data.assignment.jurisdiction}</b></span><span><small>Business location</small><b>{data.assignment.businessAddress}, {data.assignment.businessDistrict}</b></span></div></section>
        {!data.canEdit && <div className="passport-readonly">{data.assignment.status === 'completed' ? 'This inspection is completed and read-only. Its verification QR is available from your officer dashboard.' : 'This assignment is read-only because it is no longer scheduled or the officer credential is not currently valid.'}</div>}
        <section className="passport-evidence"><div className="passport-evidence-head"><div><div className="od-eyebrow"><i/>INSPECTION EVIDENCE</div><h2>Photographs</h2><p>Attach images to this inspection record. JPEG, PNG, or WebP · up to 6 MB each.</p></div><label className={`passport-upload-button ${!data.canEdit || uploading ? 'disabled' : ''}`}>+ {uploading ? 'Uploading…' : 'Add photos'}<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={!data.canEdit || uploading} onChange={event => { void uploadFiles(event.target.files); event.target.value = ''; }}/></label></div>
          {uploadNotice && <div className="passport-saved">✓ {uploadNotice}</div>}
          {uploads.filter(upload => upload.status === 'error').map(upload => <div className="passport-upload-error" key={upload.id}><img src={upload.preview} alt="Selected image preview"/><div><b>{upload.filename}</b><span>{upload.message}</span></div></div>)}
          {uploading && <div className="passport-uploading-list">{uploads.filter(upload => upload.status === 'uploading').map(upload => <div className="passport-uploading" key={upload.id}><img src={upload.preview} alt="Image upload preview"/><span><b>{upload.filename}</b><small>Uploading image…</small><i/></span></div>)}</div>}
          {evidence.length ? <div className="passport-evidence-grid">{evidence.map(image => <figure className="passport-evidence-card" key={image.id}><img src={image.url} alt={`Inspection photograph: ${image.filename}`} loading="lazy"/><figcaption><b title={image.filename}>{image.filename}</b><span>{(image.byteSize / (1024 * 1024)).toFixed(2)} MB{image.uploadedAt ? ` · ${new Date(image.uploadedAt).toLocaleDateString('en-IN')}` : ''}</span></figcaption></figure>)}</div> : !uploading && <div className="passport-evidence-empty">No photographs attached to this inspection yet.</div>}
        </section>
        {error && <div className="od-inline-error">{error}</div>}{saved && <div className="passport-saved">✓ {saved}</div>}
        <section className="passport-items">{items.map(([key, title, description], index) => {
          const response = responses.find(item => item.key === key)!;
          return <article className="passport-item" key={key}><div className="passport-item-title"><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{title}</h3><p>{description}</p></div></div><fieldset disabled={!data.canEdit || saving}><legend>Assessment</legend><div className="passport-choices">{([['compliant', 'Compliant'], ['non_compliant', 'Non-compliant'], ['not_applicable', 'Not applicable']] as const).map(([value, label]) => <label className={`passport-choice ${response.response === value ? `selected ${value}` : ''}`} key={value}><input type="radio" name={`response-${key}`} value={value} checked={response.response === value} onChange={() => update(key, { response: value })}/><i/>{label}</label>)}</div><label className="passport-observation">Observations <span>Optional</span><textarea rows={2} maxLength={5000} value={response.observation} onChange={event => update(key, { observation: event.target.value })} placeholder="Record relevant evidence or observations…"/><small>{response.observation.length} / 5000</small></label></fieldset></article>;
        })}</section>
        <div className="passport-actions"><span>{data.canEdit ? 'Save all seven responses, then complete the inspection to enable its verification QR.' : 'Saved responses remain available for review.'}</span>{data.canEdit && <div className="passport-action-buttons"><button className="passport-save-button" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save checklist'}</button><button className="od-qr-button" disabled={saving || completed !== items.length} onClick={() => void save(true)}>{saving ? 'Saving…' : 'Complete inspection'}</button></div>}</div>
      </>}
      <footer className="od-footer"><span>© 2026 TruTag · FSSAI Administration Portal</span><span><i/>Officer account data is securely loaded from your session</span></footer>
    </div>
  </main>;
}

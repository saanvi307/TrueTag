'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import '../officers.css';
import './assignments.css';

type Officer = { id: number; officerId: string; name: string; jurisdiction: string; credentialStatus: 'valid' | 'pending' | 'expired' | 'revoked'; status: 'active' | 'suspended' | 'revoked' };
type Business = { id: number; businessName: string; licenceReference: string; category: string; district: string; jurisdiction: string };
type Assignment = { id: number; officerId: number; officerName: string; officerReference: string; officerCredentialStatus: string; officerStatus: string; foodBusinessId: number; businessName: string; licenceReference: string; inspectionType: string; inspectionDate: string; jurisdiction: string; status: string; createdAt: string; hasActiveQr: boolean };
type FormValues = { officerId: string; foodBusinessId: string; inspectionType: string; inspectionDate: string; jurisdiction: string };
const types = ['Routine inspection', 'Pre-licence inspection', 'Follow-up inspection', 'Complaint-based inspection', 'Surveillance inspection', 'Special inspection'];
const localToday = () => { const date = new Date(); const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10); };
const freshForm = (): FormValues => ({ officerId: '', foodBusinessId: '', inspectionType: types[0], inspectionDate: localToday(), jurisdiction: '' });

function Icon({ name, size = 18 }: { name: 'search' | 'plus' | 'calendar' | 'users' | 'building' | 'pin' | 'shield' | 'alert' | 'refresh' | 'clipboard' | 'clock' | 'ban'; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4 4"/></>, plus: <path d="M12 5v14m-7-7h14"/>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    users: <><path d="M16 20v-1.7a3.3 3.3 0 0 0-3.3-3.3H7.3A3.3 3.3 0 0 0 4 18.3V20"/><circle cx="10" cy="7.5" r="3.5"/><path d="M20 20v-1.7a3.3 3.3 0 0 0-2.5-3.2M16.5 4.2a3.5 3.5 0 0 1 0 6.7"/></>,
    building: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 21v-4h6v4M8 7h2m4 0h2M8 11h2m4 0h2"/></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    shield: <><path d="M12 3 19 6v5c0 4.5-2.9 7.6-7 10-4.1-2.4-7-5.5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    alert: <><path d="M12 3 2.8 19h18.4L12 3Z"/><path d="M12 9v4m0 3h.01"/></>, refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.5-3"/></>,
    clipboard: <><rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 5.5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.5M9 11h6M9 15h6"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    ban: <><circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'The request could not be completed.');
  return body;
}

export default function AssignmentsPage() {
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [total, setTotal] = useState(0);
  const [upcoming, setUpcoming] = useState(0);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<FormValues>(freshForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [qrActionId, setQrActionId] = useState<number | null>(null);
  const [qrActionMessage, setQrActionMessage] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [officerData, businessData, assignmentData] = await Promise.all([request('/api/officers'), request('/api/food-businesses'), request('/api/assignments')]);
      setOfficers(officerData.officers); setBusinesses(businessData.businesses); setAssignments(assignmentData.assignments); setTotal(assignmentData.summary.total); setUpcoming(assignmentData.summary.upcoming);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load assignment data.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadData(); }, [loadData]);

  const eligibleOfficers = useMemo(() => officers.filter(officer => officer.status === 'active' && officer.credentialStatus === 'valid'), [officers]);
  const selectedOfficer = eligibleOfficers.find(officer => String(officer.id) === form.officerId);
  const selectedBusiness = businesses.find(business => String(business.id) === form.foodBusinessId);
  const visibleAssignments = useMemo(() => assignments.filter(a => `${a.officerName} ${a.officerReference} ${a.businessName} ${a.licenceReference} ${a.inspectionType} ${a.jurisdiction}`.toLowerCase().includes(query.trim().toLowerCase())), [assignments, query]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setFormError(''); setFieldError({});
    try {
      const data = await request('/api/assignments', { method: 'POST', body: JSON.stringify({ ...form, officerId: Number(form.officerId), foodBusinessId: Number(form.foodBusinessId) }) });
      setAssignments(current => [data.assignment, ...current]); setTotal(value => value + 1); setUpcoming(value => value + (data.assignment.status === 'scheduled' && data.assignment.inspectionDate >= localToday() ? 1 : 0));
      setForm(freshForm());
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create the inspection assignment.');
      const match = err instanceof Error ? err.message.match(/(officerId|foodBusinessId|inspectionType|inspectionDate|jurisdiction) is required\./) : null;
      if (match) setFieldError({ [match[1]]: err instanceof Error ? err.message : 'Required.' });
    } finally { setSaving(false); }
  }

  async function revokeQr(assignment: Assignment) {
    if (!assignment.hasActiveQr || qrActionId) return;
    if (!window.confirm(`Revoke all active verification QR tokens for assignment #${String(assignment.id).padStart(5, '0')}?`)) return;
    setQrActionId(assignment.id); setQrActionMessage('');
    try {
      const result = await request(`/api/assignments/${assignment.id}/qr`, { method: 'POST' });
      setAssignments(current => current.map(item => item.id === assignment.id ? { ...item, hasActiveQr: false } : item));
      setQrActionMessage(`${result.revokedCount} active QR token${result.revokedCount === 1 ? '' : 's'} revoked for assignment #${String(assignment.id).padStart(5, '0')}.`);
    } catch (err) { setQrActionMessage(err instanceof Error ? err.message : 'Could not revoke the QR tokens.'); }
    finally { setQrActionId(null); }
  }

  function changeOfficer(value: string) {
    const officer = eligibleOfficers.find(item => String(item.id) === value);
    setForm(current => ({ ...current, officerId: value, jurisdiction: officer?.jurisdiction || current.jurisdiction }));
    setFieldError(current => ({ ...current, officerId: '', jurisdiction: '' })); setFormError('');
  }

  return <div className="officers-app assignment-app">
    <aside className="officers-sidebar"><Link className="officers-brand" href="/"><span className="brand-symbol"><i/><i/><i/><i/></span><span><b>trutag</b><small>GOVERNMENT PORTAL</small></span></Link><div className="officers-org"><span className="org-mark">भारत</span><span><b>FSSAI Administration</b><small>Government of India</small></span></div><div className="officers-nav-caption">WORKSPACE</div><Link className="officers-nav" href="/"><span className="nav-mini-icon">▦</span>Overview</Link><Link className="officers-nav" href="/officers"><span className="nav-mini-icon">♙</span>Officers</Link><Link className="officers-nav" href="/food-businesses"><span className="nav-mini-icon">▣</span>Food businesses</Link><Link className="officers-nav chosen" href="/assignments"><span className="nav-mini-icon"><Icon name="clipboard" size={16}/></span>Assignments<span className="nav-badge">{total || '—'}</span></Link><Link className="officers-nav" href="/product-scanner"><span className="nav-mini-icon">⌕</span>Product Scanner</Link><div className="officers-nav disabled"><span className="nav-mini-icon">⌗</span>QR verification</div><div className="officers-side-bottom"><div className="officer-admin-avatar">AS</div><span><b>Admin Supervisor</b><small>Central Authority</small></span></div></aside>
    <main className="officers-main"><header className="officers-topbar"><div><Link href="/" className="back-link">Workspace <span>›</span></Link><b>Inspection assignments</b></div><div className="topbar-secure"><i/>Secure government network</div></header>
      <div className="officers-content"><div className="officers-title-row"><div><div className="officers-eyebrow"><i/>FSSAI ADMINISTRATION</div><h1>Inspection assignments</h1><p>Assign inspections to eligible officers across food business jurisdictions.</p></div></div>
        {error && <div className="database-notice"><span className="notice-icon"><Icon name="alert" size={18}/></span><div><b>Assignment data unavailable</b><p>{error}</p><small>Configure MYSQL_* in <code>.env.local</code>, register officers and businesses, then apply the assignment and verification-token migrations.</small></div><button onClick={() => void loadData()} className="retry-button"><Icon name="refresh" size={14}/>Retry</button></div>}
        <section className="assignment-metrics"><div className="assignment-metric"><span className="assignment-metric-icon total"><Icon name="clipboard"/></span><span><small>Total assignments</small><strong>{total.toLocaleString()}</strong></span></div><div className="assignment-metric"><span className="assignment-metric-icon upcoming"><Icon name="calendar"/></span><span><small>Upcoming inspections</small><strong>{upcoming.toLocaleString()}</strong></span></div><div className="assignment-readiness"><Icon name="shield" size={16}/><span>Assignment eligibility is checked against live officer credentials and jurisdiction.</span></div></section>
        <section className="assignment-layout"><article className="officers-directory assignment-form-card"><div className="directory-head"><div><h2>Create assignment</h2><p>Select an eligible officer and food business.</p></div><span className="assignment-form-mark"><Icon name="clipboard" size={18}/></span></div><form className="assignment-form" onSubmit={submit}><label className="form-field"><span>Inspection officer <i>*</i></span><select required value={form.officerId} onChange={event => changeOfficer(event.target.value)} aria-invalid={Boolean(fieldError.officerId)}><option value="">Select an eligible officer</option>{eligibleOfficers.map(officer => <option key={officer.id} value={officer.id}>{officer.name} · {officer.officerId}</option>)}</select>{eligibleOfficers.length === 0 && !loading && <small className="input-hint">No active officers with valid credentials are available.</small>}{fieldError.officerId && <small className="field-error">{fieldError.officerId}</small>}</label>
          {selectedOfficer && <div className="selection-summary officer-selection"><span className="selection-avatar"><Icon name="users" size={16}/></span><span><b>{selectedOfficer.name}</b><small>{selectedOfficer.officerId} · Valid credentials</small></span><span className="selection-good">Eligible</span></div>}
          <label className="form-field"><span>Food business <i>*</i></span><select required value={form.foodBusinessId} onChange={event => { setForm(current => ({ ...current, foodBusinessId: event.target.value })); setFieldError(current => ({ ...current, foodBusinessId: '' })); }} aria-invalid={Boolean(fieldError.foodBusinessId)}><option value="">Select a registered food business</option>{businesses.map(business => <option key={business.id} value={business.id}>{business.businessName} · {business.licenceReference}</option>)}</select>{businesses.length === 0 && !loading && <small className="input-hint">Register a food business before creating an assignment.</small>}{fieldError.foodBusinessId && <small className="field-error">{fieldError.foodBusinessId}</small>}</label>
          {selectedBusiness && <div className="selection-summary business-selection"><span className="selection-avatar"><Icon name="building" size={16}/></span><span><b>{selectedBusiness.businessName}</b><small>{selectedBusiness.category} · {selectedBusiness.district}</small></span></div>}
          <label className="form-field"><span>Inspection type <i>*</i></span><select required value={form.inspectionType} onChange={event => setForm(current => ({ ...current, inspectionType: event.target.value }))}>{types.map(type => <option key={type}>{type}</option>)}</select></label>
          <div className="assignment-fields-row"><label className="form-field"><span>Inspection date <i>*</i></span><span className="field-with-icon"><Icon name="calendar" size={15}/><input type="date" required min={localToday()} value={form.inspectionDate} onChange={event => setForm(current => ({ ...current, inspectionDate: event.target.value }))}/></span></label><label className="form-field"><span>Jurisdiction <i>*</i></span><span className="field-with-icon"><Icon name="pin" size={15}/><input required maxLength={180} value={form.jurisdiction} onChange={event => { setForm(current => ({ ...current, jurisdiction: event.target.value })); setFieldError(current => ({ ...current, jurisdiction: '' })); }} placeholder="Officer jurisdiction"/></span>{fieldError.jurisdiction && <small className="field-error">{fieldError.jurisdiction}</small>}</label></div>
          {formError && <div className="assignment-form-error"><Icon name="alert" size={15}/><span>{formError}</span></div>}
          <div className="assignment-rule"><Icon name="shield" size={15}/><span>Only active officers with valid credentials can receive assignments. Jurisdiction must match the officer record.</span></div><button className="primary-action assignment-submit" disabled={saving || eligibleOfficers.length === 0 || businesses.length === 0}>{saving ? 'Creating assignment…' : <><Icon name="plus" size={16}/>Create assignment</>}</button>
        </form></article>
          <article className="officers-directory assignment-list-card"><div className="directory-head"><div><h2>Assignment register</h2><p>Inspection schedule saved to the database</p></div><span className="record-count">{visibleAssignments.length} records</span></div><div className="directory-tools"><label className="officer-search"><Icon name="search" size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search officer, business, inspection…"/></label></div>{qrActionMessage && <div className="qr-action-message" role="status">{qrActionMessage}</div>}<div className="officer-table-wrap"><table className="officer-table assignment-table"><thead><tr><th>INSPECTION</th><th>OFFICER</th><th>FOOD BUSINESS</th><th>DATE &amp; JURISDICTION</th><th>STATUS</th><th>QR TOKEN</th></tr></thead><tbody>{loading ? <tr><td colSpan={6} className="table-message">Loading assignment records…</td></tr> : visibleAssignments.map(assignment => <tr key={assignment.id}><td><span className="assignment-type"><span className="type-icon"><Icon name="clipboard" size={15}/></span><span><b>{assignment.inspectionType}</b><small>Assignment #{String(assignment.id).padStart(5, '0')}</small></span></span></td><td><span className="assignment-cell"><b>{assignment.officerName}</b><small>{assignment.officerReference}</small></span></td><td><span className="assignment-cell"><b>{assignment.businessName}</b><small>{assignment.licenceReference}</small></span></td><td><span className="assignment-cell date-cell"><b>{new Date(`${assignment.inspectionDate}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</b><small><Icon name="pin" size={12}/>{assignment.jurisdiction}</small></span></td><td><span className={`assignment-status ${assignment.status}`}><i/>{assignment.status}</span></td><td>{assignment.hasActiveQr ? <button className="revoke-qr-button" onClick={() => void revokeQr(assignment)} disabled={qrActionId === assignment.id}><Icon name="ban" size={13}/>{qrActionId === assignment.id ? 'Revoking…' : 'Revoke QR'}</button> : <span className="no-active-qr">No active QR</span>}</td></tr>)}{!loading && visibleAssignments.length === 0 && <tr><td colSpan={6} className="table-message">{query ? 'No assignments match this search.' : 'No inspections assigned yet. Create an assignment to get started.'}</td></tr>}</tbody></table></div><div className="table-footer"><span>Showing <b>{visibleAssignments.length}</b> of <b>{total}</b> assignments</span><span><Icon name="shield" size={14}/>Eligibility checks run when assigning</span></div></article>
        </section><footer className="officers-footer"><span>© 2026 TruTag · FSSAI Administration Portal</span><span><i/>Last synced just now</span></footer>
      </div>
    </main>
  </div>;
}

'use client';

import Link from 'next/link';
import '../officers.css';
import '../officers-revocation.css';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type Status = 'active' | 'suspended' | 'revoked';
type CredentialStatus = 'valid' | 'pending' | 'expired' | 'revoked';
type Officer = { id: number; officerId: string; name: string; designation: string; department: string; district: string; jurisdiction: string; credentialStatus: CredentialStatus; status: Status; createdAt: string; updatedAt: string };
type FormValues = Omit<Officer, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { status: Status };
const emptyForm: FormValues = { officerId: '', name: '', designation: '', department: '', district: '', jurisdiction: '', credentialStatus: 'pending', status: 'active' };

function Icon({ name, size = 18 }: { name: 'arrow' | 'search' | 'plus' | 'close' | 'users' | 'shield' | 'clock' | 'dots' | 'chevron' | 'edit' | 'check' | 'ban' | 'refresh' | 'alert'; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    arrow: <><path d="M7 17 17 7M8 7h9v9"/></>, search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4 4"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>, close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    users: <><path d="M16 20v-1.7a3.3 3.3 0 0 0-3.3-3.3H7.3A3.3 3.3 0 0 0 4 18.3V20"/><circle cx="10" cy="7.5" r="3.5"/><path d="M20 20v-1.7a3.3 3.3 0 0 0-2.5-3.2M16.5 4.2a3.5 3.5 0 0 1 0 6.7"/></>,
    shield: <><path d="M12 3 19 6v5c0 4.5-2.9 7.6-7 10-4.1-2.4-7-5.5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>, dots: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>, edit: <><path d="m15 5 4 4M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15l-.8 5Z"/></>,
    check: <path d="m5 12 4 4L19 6"/>, ban: <><circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.5-3"/></>, alert: <><path d="M12 3 2.8 19h18.4L12 3Z"/><path d="M12 9v4m0 3h.01"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'The request could not be completed.');
  return body;
}

export default function OfficersPage() {
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [summary, setSummary] = useState({ total: 0, active: 0, suspended: 0, revoked: 0 });
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Officer | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');

  const loadOfficers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await request('/api/officers');
      setOfficers(data.officers);
      setSummary({ total: Number(data.summary.total) || 0, active: Number(data.summary.active) || 0, suspended: Number(data.summary.suspended) || 0, revoked: Number(data.summary.revoked) || 0 });
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load officers.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadOfficers(); }, [loadOfficers]);
  const shown = useMemo(() => officers.filter(o => (filter === 'all' || o.status === filter) && `${o.officerId} ${o.name} ${o.designation} ${o.department} ${o.district} ${o.jurisdiction}`.toLowerCase().includes(query.trim().toLowerCase())), [officers, filter, query]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setActionError(''); setModal(true); };
  const openEdit = (officer: Officer) => { setEditing(officer); setForm({ officerId: officer.officerId, name: officer.name, designation: officer.designation, department: officer.department, district: officer.district, jurisdiction: officer.jurisdiction, credentialStatus: officer.credentialStatus, status: officer.status }); setActionError(''); setModal(true); };

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setActionError('');
    try {
      const data = await request(editing ? `/api/officers/${editing.id}` : '/api/officers', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(form) });
      if (editing) setOfficers(current => current.map(o => o.id === editing.id ? data.officer : o));
      else setOfficers(current => [data.officer, ...current]);
      setModal(false); await loadOfficers();
    } catch (err) { setActionError(err instanceof Error ? err.message : 'Could not save officer.'); }
    finally { setSaving(false); }
  }

  async function setStatus(officer: Officer, status: Status) {
    if (officer.status === status || actionId) return;
    if (status === 'revoked' && !window.confirm(`Revoke credentials for ${officer.name}? This action should be used when access must be permanently withdrawn.`)) return;
    setActionId(officer.id); setActionError('');
    try { const data = await request(`/api/officers/${officer.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); setOfficers(current => current.map(o => o.id === officer.id ? data.officer : o)); await loadOfficers(); }
    catch (err) { setActionError(err instanceof Error ? err.message : 'Could not update officer status.'); }
    finally { setActionId(null); }
  }

  return <div className="officers-app">
    <aside className="officers-sidebar"><Link className="officers-brand" href="/"><span className="brand-symbol"><i/><i/><i/><i/></span><span><b>trutag</b><small>GOVERNMENT PORTAL</small></span></Link><div className="officers-org"><span className="org-mark">भारत</span><span><b>FSSAI Administration</b><small>Government of India</small></span></div><div className="officers-nav-caption">WORKSPACE</div><Link className="officers-nav" href="/"><span className="nav-mini-icon">▦</span>Overview</Link><Link className="officers-nav chosen" href="/officers"><span className="nav-mini-icon"><Icon name="users" size={17}/></span>Officers<span className="nav-badge">{summary.total || '—'}</span></Link><Link className="officers-nav" href="/food-businesses"><span className="nav-mini-icon">▣</span>Food businesses</Link><Link className="officers-nav" href="/assignments"><span className="nav-mini-icon">▤</span>Assignments</Link><Link className="officers-nav" href="/product-scanner"><span className="nav-mini-icon">⌕</span>Product Scanner</Link><div className="officers-nav disabled"><span className="nav-mini-icon">⌗</span>QR verification</div><div className="officers-side-bottom"><div className="officer-admin-avatar">AS</div><span><b>Admin Supervisor</b><small>Central Authority</small></span></div></aside>
    <main className="officers-main"><header className="officers-topbar"><div><Link href="/" className="back-link">Workspace <span>›</span></Link><b>Officer management</b></div><div className="topbar-secure"><i/>Secure government network</div></header>
      <div className="officers-content"><div className="officers-title-row"><div><div className="officers-eyebrow"><i/>FSSAI ADMINISTRATION</div><h1>Officer management</h1><p>Register and manage food safety officers across jurisdictions.</p></div><button className="primary-action" onClick={openCreate}><Icon name="plus" size={17}/>Register officer</button></div>
        {error && <div className="database-notice"><span className="notice-icon"><Icon name="alert" size={18}/></span><div><b>Officer database unavailable</b><p>{error}</p><small>Configure the MYSQL_* variables in <code>.env.local</code>, then run <code>db/officers.sql</code> against the TruTag database.</small></div><button onClick={() => void loadOfficers()} className="retry-button"><Icon name="refresh" size={14}/>Retry</button></div>}
        <section className="officer-summary" aria-label="Officer status summary"><div className="summary-tile"><span className="summary-icon total-icon"><Icon name="users"/></span><span><small>Total officers</small><strong>{summary.total.toLocaleString()}</strong></span></div><div className="summary-tile"><span className="summary-icon active-icon"><Icon name="check"/></span><span><small>Active</small><strong>{summary.active.toLocaleString()}</strong></span></div><div className="summary-tile"><span className="summary-icon suspended-icon"><Icon name="clock"/></span><span><small>Suspended</small><strong>{summary.suspended.toLocaleString()}</strong></span></div><div className="summary-tile"><span className="summary-icon revoked-icon"><Icon name="ban"/></span><span><small>Revoked</small><strong>{summary.revoked.toLocaleString()}</strong></span></div></section>
        <section className="officers-directory"><div className="directory-head"><div><h2>Officer directory</h2><p>Search and update registered officer records</p></div><span className="record-count">{shown.length} {shown.length === 1 ? 'officer' : 'officers'}</span></div><div className="directory-tools"><label className="officer-search"><Icon name="search" size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, Officer ID, district…"/><kbd>⌘ K</kbd></label><label className="status-filter"><span>Status:</span><select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All officers</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="revoked">Revoked</option></select><span className="select-arrow">⌄</span></label></div>
          {actionError && !modal && <div className="inline-error">{actionError}</div>}
          <div className="officer-table-wrap"><table className="officer-table"><thead><tr><th>OFFICER</th><th>DESIGNATION &amp; DEPARTMENT</th><th>JURISDICTION</th><th>CREDENTIAL</th><th>STATUS</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{loading ? <tr><td colSpan={6} className="table-message">Loading officer records…</td></tr> : shown.map(officer => <tr key={officer.id}><td><div className="table-officer"><span className={`initials tone-${officer.id % 4}`}>{officer.name.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</span><span><b>{officer.name}</b><small>{officer.officerId}</small></span></div></td><td><span className="designation-cell"><b>{officer.designation}</b><small>{officer.department}</small></span></td><td><span className="jurisdiction-cell"><b>{officer.district}</b><small>{officer.jurisdiction}</small></span></td><td><span className={`credential-pill ${officer.credentialStatus}`}>{officer.credentialStatus}</span></td><td><span className={`officer-status ${officer.status}`}><i/>{officer.status}</span></td><td><div className="row-actions"><button className="edit-action" onClick={() => openEdit(officer)} aria-label={`Edit ${officer.name}`} title="Edit officer"><Icon name="edit" size={15}/></button><details className="actions-menu"><summary aria-label={`Actions for ${officer.name}`}><Icon name="dots" size={17}/></summary><div className="actions-popover"><b>Officer access</b>{officer.status !== 'active' && <button onClick={() => void setStatus(officer, 'active')}><Icon name="check" size={14}/>Activate</button>}{officer.status !== 'suspended' && officer.status !== 'revoked' && <button onClick={() => void setStatus(officer, 'suspended')}><Icon name="clock" size={14}/>Suspend</button>}{officer.status !== 'revoked' && <button className="revoke-option" onClick={() => void setStatus(officer, 'revoked')}><Icon name="ban" size={14}/>Revoke access</button>}{officer.status === 'revoked' && <span className="menu-note">Revoked access cannot be reactivated here.</span>}</div></details></div></td></tr>)}{!loading && shown.length === 0 && <tr><td colSpan={6} className="table-message">{error ? 'Connect the officer database to load records.' : query || filter !== 'all' ? 'No officers match these filters.' : 'No officers registered yet. Register an officer to get started.'}</td></tr>}</tbody></table></div><div className="table-footer"><span>Showing <b>{shown.length}</b> of <b>{summary.total}</b> officers</span><span><Icon name="shield" size={14}/>Changes are recorded in the officer database</span></div>
        </section><footer className="officers-footer"><span>© 2026 TruTag · FSSAI Administration Portal</span><span><i/>Last synced just now</span></footer>
      </div>
    </main>
    {modal && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !saving) setModal(false); }}><section className="officer-modal" role="dialog" aria-modal="true" aria-labelledby="officer-modal-title"><header><div><div className="modal-eyebrow">OFFICER RECORD</div><h2 id="officer-modal-title">{editing ? 'Edit officer details' : 'Register officer'}</h2><p>{editing ? 'Update officer information and credential status.' : 'Add an officer to the FSSAI administration network.'}</p></div><button className="modal-close" onClick={() => setModal(false)} aria-label="Close dialog"><Icon name="close"/></button></header><form onSubmit={save}><div className="form-grid"><label className="form-field"><span>Officer ID <i>*</i></span><input required value={form.officerId} onChange={e => setForm({ ...form, officerId: e.target.value })} placeholder="e.g. FSSAI-DEL-0241" autoFocus/></label><label className="form-field"><span>Officer name <i>*</i></span><input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name"/></label><label className="form-field"><span>Designation <i>*</i></span><input required value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Food Safety Officer"/></label><label className="form-field"><span>Department <i>*</i></span><input required value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} placeholder="Department or agency"/></label><label className="form-field"><span>District <i>*</i></span><input required value={form.district} onChange={e => setForm({ ...form, district: e.target.value })} placeholder="District"/></label><label className="form-field"><span>Jurisdiction <i>*</i></span><input required value={form.jurisdiction} onChange={e => setForm({ ...form, jurisdiction: e.target.value })} placeholder="Area or jurisdiction"/></label><label className="form-field"><span>Credential status <i>*</i></span><select value={form.credentialStatus} onChange={e => setForm({ ...form, credentialStatus: e.target.value as CredentialStatus })}><option value="valid">Valid</option><option value="pending">Pending</option><option value="expired">Expired</option><option value="revoked">Revoked</option></select></label><label className="form-field"><span>Officer access <i>*</i></span><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Status })}><option value="active">Active</option><option value="suspended">Suspended</option><option value="revoked">Revoked</option></select></label></div>{actionError && <div className="modal-error">{actionError}</div>}<div className="form-note"><Icon name="shield" size={15}/><span>Revoking a credential immediately invalidates all outstanding inspection QR tokens. Existing inspection records remain unchanged.</span></div><footer><button type="button" className="cancel-button" onClick={() => setModal(false)} disabled={saving}>Cancel</button><button type="submit" className="primary-action" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : <><Icon name="plus" size={16}/>Register officer</>}</button></footer></form></section></div>}
  </div>;
}

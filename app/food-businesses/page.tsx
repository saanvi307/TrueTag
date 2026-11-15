'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import '../officers.css';
import './food-businesses.css';

type Business = { id: number; businessName: string; licenceReference: string; category: string; address: string; district: string; jurisdiction: string; createdAt: string; updatedAt: string };
type BusinessForm = Omit<Business, 'id' | 'createdAt' | 'updatedAt'>;
const emptyForm: BusinessForm = { businessName: '', licenceReference: '', category: '', address: '', district: '', jurisdiction: '' };
function Icon({ name, size = 18 }: { name: 'search' | 'plus' | 'edit' | 'close' | 'alert' | 'refresh' | 'building' | 'pin' | 'chevron' | 'shield'; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4 4"/></>, plus: <path d="M12 5v14m-7-7h14"/>,
    edit: <><path d="m15 5 4 4M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15l-.8 5Z"/></>, close: <path d="m6 6 12 12M18 6 6 18"/>,
    alert: <><path d="M12 3 2.8 19h18.4L12 3Z"/><path d="M12 9v4m0 3h.01"/></>, refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.5-3"/></>,
    building: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 21v-4h6v4M8 7h2m4 0h2M8 11h2m4 0h2"/></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>, shield: <><path d="M12 3 19 6v5c0 4.5-2.9 7.6-7 10-4.1-2.4-7-5.5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'The request could not be completed.');
  return body;
}

export default function FoodBusinessesPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Business | null>(null);
  const [form, setForm] = useState<BusinessForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const loadBusinesses = useCallback(async () => {
    setLoading(true); setError('');
    try { const data = await request('/api/food-businesses'); setBusinesses(data.businesses); setTotal(data.total); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load food businesses.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadBusinesses(); }, [loadBusinesses]);
  const visible = useMemo(() => businesses.filter(b => `${b.businessName} ${b.licenceReference} ${b.category} ${b.address} ${b.district} ${b.jurisdiction}`.toLowerCase().includes(query.trim().toLowerCase())), [businesses, query]);

  function openCreate() { setEditing(null); setForm(emptyForm); setFormError(''); setModal(true); }
  function openEdit(business: Business) { setEditing(business); setForm({ businessName: business.businessName, licenceReference: business.licenceReference, category: business.category, address: business.address, district: business.district, jurisdiction: business.jurisdiction }); setFormError(''); setModal(true); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setFormError('');
    try {
      const data = await request(editing ? `/api/food-businesses/${editing.id}` : '/api/food-businesses', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(form) });
      if (editing) setBusinesses(current => current.map(b => b.id === editing.id ? data.business : b)); else setBusinesses(current => [data.business, ...current]);
      setModal(false); await loadBusinesses();
    } catch (err) { setFormError(err instanceof Error ? err.message : 'Could not save business.'); }
    finally { setSaving(false); }
  }

  return <div className="officers-app food-business-app">
    <aside className="officers-sidebar"><Link className="officers-brand" href="/"><span className="brand-symbol"><i/><i/><i/><i/></span><span><b>trutag</b><small>GOVERNMENT PORTAL</small></span></Link><div className="officers-org"><span className="org-mark">भारत</span><span><b>FSSAI Administration</b><small>Government of India</small></span></div><div className="officers-nav-caption">WORKSPACE</div><Link className="officers-nav" href="/"><span className="nav-mini-icon">▦</span>Overview</Link><Link className="officers-nav" href="/officers"><span className="nav-mini-icon">♙</span>Officers</Link><Link className="officers-nav chosen" href="/food-businesses"><span className="nav-mini-icon"><Icon name="building" size={16}/></span>Food businesses<span className="nav-badge">{total || '—'}</span></Link><Link className="officers-nav" href="/assignments"><span className="nav-mini-icon">▤</span>Assignments</Link><Link className="officers-nav" href="/product-scanner"><span className="nav-mini-icon">⌕</span>Product Scanner</Link><div className="officers-nav disabled"><span className="nav-mini-icon">⌗</span>QR verification</div><div className="officers-side-bottom"><div className="officer-admin-avatar">AS</div><span><b>Admin Supervisor</b><small>Central Authority</small></span></div></aside>
    <main className="officers-main"><header className="officers-topbar"><div><Link href="/" className="back-link">Workspace <span>›</span></Link><b>Food business management</b></div><div className="topbar-secure"><i/>Secure government network</div></header>
      <div className="officers-content"><div className="officers-title-row"><div><div className="officers-eyebrow"><i/>FSSAI ADMINISTRATION</div><h1>Food business management</h1><p>Register and maintain food business licence records across jurisdictions.</p></div><button className="primary-action" onClick={openCreate}><Icon name="plus" size={17}/>Register business</button></div>
        {error && <div className="database-notice"><span className="notice-icon"><Icon name="alert" size={18}/></span><div><b>Business database unavailable</b><p>{error}</p><small>Configure the MYSQL_* variables in <code>.env.local</code>, then run <code>db/food-businesses.sql</code> against the TruTag database.</small></div><button onClick={() => void loadBusinesses()} className="retry-button"><Icon name="refresh" size={14}/>Retry</button></div>}
        <section className="business-overview"><div className="business-overview-icon"><Icon name="building" size={20}/></div><div><small>Registered food businesses</small><strong>{total.toLocaleString()}</strong></div><span className="business-overview-note">Records in your network</span></section>
        <section className="officers-directory business-directory"><div className="directory-head"><div><h2>Business directory</h2><p>Search registered businesses by name, licence, category or location</p></div><span className="record-count">{visible.length} {visible.length === 1 ? 'business' : 'businesses'}</span></div><div className="directory-tools"><label className="officer-search"><Icon name="search" size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, FSSAI licence reference, district…"/><kbd>⌘ K</kbd></label><button className="business-refresh" onClick={() => void loadBusinesses()} aria-label="Refresh food business listing"><Icon name="refresh" size={15}/>Refresh</button></div>
          <div className="officer-table-wrap"><table className="officer-table business-table"><thead><tr><th>FOOD BUSINESS</th><th>FSSAI LICENCE</th><th>CATEGORY</th><th>ADDRESS</th><th>DISTRICT &amp; JURISDICTION</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{loading ? <tr><td colSpan={6} className="table-message">Loading business records…</td></tr> : visible.map(business => <tr key={business.id}><td><div className="table-officer"><span className={`business-initials tone-${business.id % 4}`}><Icon name="building" size={15}/></span><span><b>{business.businessName}</b><small>Registered food business</small></span></div></td><td><span className="licence-reference">{business.licenceReference}</span></td><td><span className="category-pill">{business.category}</span></td><td><span className="address-cell">{business.address}</span></td><td><span className="jurisdiction-cell"><b>{business.district}</b><small>{business.jurisdiction}</small></span></td><td><button className="edit-action" onClick={() => openEdit(business)} aria-label={`Edit ${business.businessName}`} title="Edit business"><Icon name="edit" size={15}/></button></td></tr>)}{!loading && visible.length === 0 && <tr><td colSpan={6} className="table-message">{error ? 'Connect the food business database to load records.' : query ? 'No businesses match this search.' : 'No food businesses registered yet. Register a business to get started.'}</td></tr>}</tbody></table></div><div className="table-footer"><span>Showing <b>{visible.length}</b> of <b>{total}</b> businesses</span><span><Icon name="shield" size={14}/>Business records are stored in the TruTag database</span></div>
        </section><footer className="officers-footer"><span>© 2026 TruTag · FSSAI Administration Portal</span><span><i/>Last synced just now</span></footer>
      </div>
    </main>
    {modal && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !saving) setModal(false); }}><section className="officer-modal" role="dialog" aria-modal="true" aria-labelledby="business-modal-title"><header><div><div className="modal-eyebrow">FOOD BUSINESS RECORD</div><h2 id="business-modal-title">{editing ? 'Edit food business' : 'Register food business'}</h2><p>{editing ? 'Update the business licence and jurisdiction details.' : 'Add a food business to the FSSAI administration registry.'}</p></div><button className="modal-close" onClick={() => setModal(false)} aria-label="Close dialog"><Icon name="close"/></button></header><form onSubmit={save}><div className="form-grid"><label className="form-field"><span>Business name <i>*</i></span><input required maxLength={180} value={form.businessName} onChange={e => setForm({ ...form, businessName: e.target.value })} placeholder="Registered business name" autoFocus/></label><label className="form-field"><span>FSSAI licence reference <i>*</i></span><input required maxLength={80} value={form.licenceReference} onChange={e => setForm({ ...form, licenceReference: e.target.value })} placeholder="e.g. 10012011000123"/></label><label className="form-field"><span>Category <i>*</i></span><input required maxLength={100} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g. Manufacturer, Restaurant"/></label><label className="form-field"><span>District <i>*</i></span><input required maxLength={120} value={form.district} onChange={e => setForm({ ...form, district: e.target.value })} placeholder="District"/></label><label className="form-field full-width"><span>Business address <i>*</i></span><textarea required maxLength={500} rows={3} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Street, locality, city and postal code"/></label><label className="form-field full-width"><span>Jurisdiction <i>*</i></span><input required maxLength={180} value={form.jurisdiction} onChange={e => setForm({ ...form, jurisdiction: e.target.value })} placeholder="Area, zone or inspection jurisdiction"/></label></div>{formError && <div className="modal-error">{formError}</div>}<div className="form-note"><Icon name="shield" size={15}/><span>Licence reference must be unique. Business details are stored in the configured MySQL database.</span></div><footer><button type="button" className="cancel-button" onClick={() => setModal(false)} disabled={saving}>Cancel</button><button type="submit" className="primary-action" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : <><Icon name="plus" size={16}/>Register business</>}</button></footer></form></section></div>}
  </div>;
}

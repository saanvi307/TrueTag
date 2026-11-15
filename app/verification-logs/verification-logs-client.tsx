'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import './verification-logs.css';
import '../admin-dashboard.css';

type Outcome = 'authority_verified' | 'identity_verified_authority_not_confirmed' | 'verification_failed';
type LogItem = { id: number; reference: string; assignmentId: number | null; officerName: string | null; officerId: string | null; businessName: string | null; licenceReference: string | null; timestamp: string; outcome: Outcome };
type LogData = { logs: LogItem[]; page: number; pageSize: number; total: number; pages: number };
const filters = [
  { value: 'all', label: 'All attempts' },
  { value: 'authority_verified', label: 'Authorised' },
  { value: 'identity_verified_authority_not_confirmed', label: 'Unauthorised' },
  { value: 'verification_failed', label: 'Failed' },
] as const;

function outcomeLabel(outcome: Outcome) {
  return outcome === 'authority_verified' ? 'Authorised' : outcome === 'identity_verified_authority_not_confirmed' ? 'Unauthorised' : 'Failed';
}
function outcomeNote(outcome: Outcome) {
  return outcome === 'authority_verified' ? 'Authority verified' : outcome === 'identity_verified_authority_not_confirmed' ? 'Identity matched · authority not confirmed' : 'Verification could not be completed';
}
function formatTimestamp(value: string) {
  return new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

const nav = [
  { label: 'WORKSPACE', items: [{ label: 'Overview', href: '/', icon: '▦' }, { label: 'Officers', href: '/officers', icon: '♙' }, { label: 'Food businesses', href: '/food-businesses', icon: '▤' }, { label: 'Assignments', href: '/assignments', icon: '▣' }, { label: 'Product Scanner', href: '/product-scanner', icon: '⌕' }] },
  { label: 'INSIGHTS', items: [{ label: 'QR verification', href: '/verify', icon: '⌗' }, { label: 'Verification logs', href: '/verification-logs', icon: '≡' }, { label: 'Reports & activity', href: '/#reports', icon: '⌁' }] },
];

export default function VerificationLogsClient({ username }: { username: string }) {
  const [outcome, setOutcome] = useState('all');
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    const params = new URLSearchParams({ outcome, page: String(page) });
    if (query) params.set('q', query);
    fetch(`/api/admin/verification-logs?${params}`, { cache: 'no-store' })
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Verification logs could not be loaded.');
        return body as LogData;
      })
      .then(result => { if (!cancelled) setData(result); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Verification logs could not be loaded.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [outcome, page, query, refresh]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPage(1); setQuery(queryInput.trim());
  }

  return <div className="app-shell admin-shell">
    {mobileOpen && <button className="admin-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)}/>}
    <aside className={`sidebar ${mobileOpen ? 'admin-sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><span/><span/><span/><span/></div><div className="brand-copy"><strong>trutag</strong><small>GOVERNMENT PORTAL</small></div><button className="admin-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">×</button></div>
      <div className="org-switch"><div className="org-emblem">भारत</div><div className="org-copy"><strong>FSSAI Administration</strong><span>Government of India</span></div></div>
      <nav className="navigation" aria-label="Main navigation">{nav.map(group => <div className="nav-group" key={group.label}><div className="nav-label">{group.label}</div>{group.items.map(item => <Link key={item.label} className={`nav-item ${item.label === 'Verification logs' ? 'selected' : ''}`} href={item.href} onClick={() => setMobileOpen(false)}><span className="admin-nav-icon">{item.icon}</span><span>{item.label}</span></Link>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="side-divider"/><div className="sidebar-user"><div className="user-avatar">{username.slice(0, 2).toUpperCase()}</div><div className="user-copy"><strong>{username}</strong><span>Administrator</span></div></div><div className="version">TRUTAG ADMIN · LIVE LOGS</div></div>
    </aside>
    <main className="main-area">
      <header className="topbar admin-topbar"><button className="admin-mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation">☰</button><div className="breadcrumb">Insights <span>›</span> <strong>Verification logs</strong></div><div className="topbar-right"><span className="live-status"><i/>Recorded outcomes</span><span className="top-separator"/><div className="top-user"><div className="user-avatar">{username.slice(0, 2).toUpperCase()}</div><div className="top-user-copy"><strong>{username}</strong><span>Administrator</span></div></div></div></header>
      <div className="page-content admin-content logs-content">
        <section className="admin-welcome"><div><div className="eyebrow"><span className="eyebrow-line"/>FSSAI ADMINISTRATION</div><h1>Verification logs</h1><p className="welcome-subtitle">Review recorded inspection QR verification attempts.</p></div><Link className="logs-back-link" href="/">← Dashboard</Link></section>
        <section className="logs-panel">
          <div className="logs-toolbar"><div className="logs-filter-tabs" role="group" aria-label="Filter by verification outcome">{filters.map(filter => <button key={filter.value} className={outcome === filter.value ? 'selected' : ''} onClick={() => { setOutcome(filter.value); setPage(1); }}>{filter.label}</button>)}</div><form className="logs-search" onSubmit={search}><span aria-hidden="true">⌕</span><input value={queryInput} onChange={event => setQueryInput(event.target.value)} placeholder="Search reference, officer or business" aria-label="Search verification logs"/><button type="submit">Search</button></form></div>
          {error && <div className="admin-error"><b>Logs unavailable</b><span>{error}</span><button onClick={() => setRefresh(value => value + 1)}>Retry</button></div>}
          <div className="logs-result-summary"><span>{loading ? 'Loading verification records…' : `${new Intl.NumberFormat('en-IN').format(data?.total || 0)} verification ${data?.total === 1 ? 'record' : 'records'}`}</span><small>Signed QR verification outcomes recorded by TruTag</small></div>
          {loading && !data ? <div className="logs-loading">Loading verification records…</div> : data?.logs.length ? <div className="logs-table-wrap"><table className="logs-table"><thead><tr><th>VERIFICATION REFERENCE</th><th>OFFICER</th><th>FOOD BUSINESS</th><th>TIMESTAMP (IST)</th><th>OUTCOME</th></tr></thead><tbody>{data.logs.map(log => <tr key={log.id}><td><div className="logs-reference"><span className="logs-reference-icon">⌗</span><span><b>{log.reference}</b>{log.assignmentId && <small>Inspection #{String(log.assignmentId).padStart(5, '0')}</small>}</span></div></td><td>{log.officerName ? <div className="logs-person"><b>{log.officerName}</b><small>{log.officerId}</small></div> : <span className="logs-muted">Unidentified scan</span>}</td><td>{log.businessName ? <div className="logs-business"><b>{log.businessName}</b><small>FSSAI {log.licenceReference}</small></div> : <span className="logs-muted">No matching record</span>}</td><td><span className="logs-time">{formatTimestamp(log.timestamp)}</span></td><td><span className={`logs-outcome ${log.outcome}`}><i/>{outcomeLabel(log.outcome)}<small>{outcomeNote(log.outcome)}</small></span></td></tr>)}</tbody></table></div> : !loading && <div className="logs-empty"><span>⌗</span><b>No verification attempts found</b><p>Try another search or outcome filter. New signed QR scans will appear here.</p></div>}
          {data && data.pages > 1 && <div className="logs-pagination"><span>Showing {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} of {new Intl.NumberFormat('en-IN').format(data.total)}</span><div><button disabled={page <= 1 || loading} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</button><b>Page {data.page} of {data.pages}</b><button disabled={page >= data.pages || loading} onClick={() => setPage(value => value + 1)}>Next</button></div></div>}
        </section>
        <footer className="admin-footer"><span>TruTag · FSSAI Administration Portal</span><span>Verification references contain no QR token data</span></footer>
      </div>
    </main>
  </div>;
}

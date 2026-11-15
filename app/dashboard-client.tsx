'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import './admin-dashboard.css';

type DashboardData = {
  days: number;
  summary: { officers: number; activeOfficers: number; revokedOfficers: number; assignments: number; verificationFailures: number; pendingReports: number };
  activity: { date: string; label: string; inspections: number }[];
  verification: { outcome: string; label: string; value: number; color: string }[];
  districts: { district: string; inspections: number }[];
  pendingReports: { id: number; inspectionType: string; inspectionDate: string; officerName: string; officerId: string; businessName: string; completedItems: number; totalItems: number }[];
};

const nav = [
  { label: 'WORKSPACE', items: [{ label: 'Overview', href: '/', icon: '▦' }, { label: 'Officers', href: '/officers', icon: '♙' }, { label: 'Food businesses', href: '/food-businesses', icon: '▤' }, { label: 'Assignments', href: '/assignments', icon: '▣' }, { label: 'Product Scanner', href: '/product-scanner', icon: '⌕' }] },
  { label: 'INSIGHTS', items: [{ label: 'QR verification', href: '/verify', icon: '⌗' }, { label: 'Verification logs', href: '/verification-logs', icon: '≡' }, { label: 'Reports & activity', href: '#reports', icon: '⌁' }] },
];

function formatNumber(value: number) { return new Intl.NumberFormat('en-IN').format(value || 0); }
function formatDate(value: string) { return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }

export default function DashboardClient({ username }: { username: string }) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    fetch(`/api/admin/dashboard?days=${days}`, { cache: 'no-store' })
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Dashboard data could not be loaded.');
        return body as DashboardData;
      })
      .then(result => { if (!cancelled) setData(result); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Dashboard data could not be loaded.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days, refresh]);

  const totalVerifications = data?.verification.reduce((sum, item) => sum + item.value, 0) || 0;
  const totalActivity = data?.activity.reduce((sum, item) => sum + item.inspections, 0) || 0;
  const dateLabel = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const cards = data ? [
    { label: 'Total officers', value: data.summary.officers, note: 'Registered in TruTag', tone: 'blue', icon: 'FO' },
    { label: 'Active officers', value: data.summary.activeOfficers, note: 'Active with valid credentials', tone: 'green', icon: 'AC' },
    { label: 'Revoked officers', value: data.summary.revokedOfficers, note: 'Access or credential revoked', tone: 'red', icon: 'RV' },
    { label: 'Inspection assignments', value: data.summary.assignments, note: 'All assignment records', tone: 'violet', icon: 'IN' },
    { label: 'Verification failures', value: data.summary.verificationFailures, note: `Recorded in last ${days} days`, tone: 'amber', icon: 'QR' },
    { label: 'Pending reports', value: data.summary.pendingReports, note: 'Completed inspections missing checklist items', tone: 'blue', icon: 'RP' },
  ] : [];

  return <div className="app-shell admin-shell">
    {mobileOpen && <button className="admin-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)}/>}
    <aside className={`sidebar ${mobileOpen ? 'admin-sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><span/><span/><span/><span/></div><div className="brand-copy"><strong>trutag</strong><small>GOVERNMENT PORTAL</small></div><button className="admin-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">×</button></div>
      <div className="org-switch"><div className="org-emblem">भारत</div><div className="org-copy"><strong>FSSAI Administration</strong><span>Government of India</span></div></div>
      <nav className="navigation" aria-label="Main navigation">{nav.map(group => <div className="nav-group" key={group.label}><div className="nav-label">{group.label}</div>{group.items.map(item => <Link key={item.label} className={`nav-item ${item.label === 'Overview' ? 'selected' : ''}`} href={item.href} onClick={() => setMobileOpen(false)}><span className="admin-nav-icon">{item.icon}</span><span>{item.label}</span></Link>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="side-divider"/><div className="sidebar-user"><div className="user-avatar">{username.slice(0, 2).toUpperCase()}</div><div className="user-copy"><strong>{username}</strong><span>Administrator</span></div></div><div className="version">TRUTAG ADMIN · LIVE DATA</div></div>
    </aside>
    <main className="main-area">
      <header className="topbar admin-topbar"><button className="admin-mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation">☰</button><div className="breadcrumb">Workspace <span>›</span> <strong>Overview</strong></div><div className="topbar-right"><span className="live-status"><i/>Database summary</span><span className="top-separator"/><div className="top-user"><div className="user-avatar">{username.slice(0, 2).toUpperCase()}</div><div className="top-user-copy"><strong>{username}</strong><span>Administrator</span></div></div></div></header>
      <div className="page-content admin-content">
        <section className="admin-welcome"><div><div className="eyebrow"><span className="eyebrow-line"/>FSSAI ADMINISTRATION</div><h1>Government dashboard</h1><p className="welcome-subtitle">A live view of food safety operations across your network.</p></div><div className="admin-date">{dateLabel}</div></section>
        {error && <div className="admin-error"><b>Dashboard data unavailable</b><span>{error}</span><button onClick={() => setRefresh(value => value + 1)}>Retry</button></div>}
        {loading && !data ? <div className="admin-loading">Loading live administration records…</div> : data && <>
          <section className="admin-stat-grid" aria-label="Network summary">{cards.map(card => <article className="admin-stat" key={card.label}><div className={`admin-stat-icon ${card.tone}`}>{card.icon}</div><div className="admin-stat-copy"><span>{card.label}</span><b>{formatNumber(card.value)}</b><small>{card.note}</small></div></article>)}</section>
          <section className="admin-chart-grid" id="reports">
            <article className="admin-panel admin-activity-panel"><div className="admin-panel-heading"><div><h2>Inspection activity</h2><p>Completed assignments by scheduled inspection date</p></div><select value={days} onChange={event => setDays(Number(event.target.value))} aria-label="Inspection activity date range"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></div><div className="admin-chart-total"><b>{formatNumber(totalActivity)}</b><span>completed inspections in period</span></div><div className="admin-area-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.activity} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}><defs><linearGradient id="inspectionFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#347fe0" stopOpacity={0.22}/><stop offset="100%" stopColor="#347fe0" stopOpacity={0.01}/></linearGradient></defs><CartesianGrid stroke="#edf1f6" vertical={false}/><XAxis dataKey="label" tick={{ fill: '#8693a5', fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={22}/><YAxis allowDecimals={false} tick={{ fill: '#9aa5b3', fontSize: 9 }} tickLine={false} axisLine={false} width={36}/><Tooltip contentStyle={{ border: '1px solid #e4eaf1', borderRadius: 7, fontSize: 11 }} formatter={(value) => [formatNumber(Number(value)), 'Completed']}/><Area type="monotone" dataKey="inspections" stroke="#347fe0" strokeWidth={2.5} fill="url(#inspectionFill)" activeDot={{ r: 5, fill: '#347fe0', stroke: '#fff', strokeWidth: 2 }}/></AreaChart></ResponsiveContainer></div></article>
            <article className="admin-panel admin-verification-panel"><div className="admin-panel-heading"><div><h2>Verification outcomes</h2><p>Recorded signed QR scan outcomes · {days} days</p></div></div><div className="admin-donut-wrap">{totalVerifications ? <><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.verification} dataKey="value" nameKey="label" innerRadius="66%" outerRadius="90%" paddingAngle={3} stroke="none">{data.verification.map(item => <Cell key={item.outcome} fill={item.color}/>)}</Pie><Tooltip contentStyle={{ border: '1px solid #e4eaf1', borderRadius: 7, fontSize: 11 }} formatter={(value, name) => [formatNumber(Number(value)), name]}/></PieChart></ResponsiveContainer><div className="admin-donut-center"><b>{formatNumber(totalVerifications)}</b><span>verifications</span></div></> : <div className="admin-chart-empty">No QR verification attempts recorded in this period.</div>}</div><div className="admin-legend">{data.verification.map(item => <div key={item.outcome}><i style={{ background: item.color }}/><span>{item.label}</span><b>{formatNumber(item.value)}</b></div>)}</div></article>
            <article className="admin-panel admin-district-panel"><div className="admin-panel-heading"><div><h2>District inspection counts</h2><p>Completed inspections in the selected period</p></div></div>{data.districts.length ? <div className="admin-district-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.districts} layout="vertical" margin={{ top: 2, right: 20, left: 6, bottom: 0 }}><CartesianGrid stroke="#edf1f6" horizontal={false}/><XAxis type="number" allowDecimals={false} tick={{ fill: '#9aa5b3', fontSize: 9 }} tickLine={false} axisLine={false}/><YAxis type="category" dataKey="district" width={96} tick={{ fill: '#66758a', fontSize: 9 }} tickLine={false} axisLine={false}/><Tooltip contentStyle={{ border: '1px solid #e4eaf1', borderRadius: 7, fontSize: 11 }} formatter={(value) => [formatNumber(Number(value)), 'Inspections']}/><Bar dataKey="inspections" fill="#4c8de0" radius={[0, 4, 4, 0]} barSize={15}/></BarChart></ResponsiveContainer></div> : <div className="admin-chart-empty">No completed inspections recorded in this period.</div>}</article>
            <article className="admin-panel admin-pending-panel"><div className="admin-panel-heading"><div><h2>Pending reports</h2><p>Completed inspections with checklist responses missing</p></div><span className="admin-pending-count">{formatNumber(data.summary.pendingReports)}</span></div>{data.pendingReports.length ? <div className="admin-pending-list">{data.pendingReports.map(report => <Link className="admin-pending-row" href="/assignments" key={report.id}><span className="admin-pending-mark">!</span><span className="admin-pending-main"><b>{report.businessName}</b><small>{report.inspectionType} · {report.officerName} ({report.officerId})</small></span><span className="admin-pending-tail"><b>{report.completedItems}/{report.totalItems}</b><small>{formatDate(report.inspectionDate)}</small></span></Link>)}</div> : <div className="admin-chart-empty">All completed inspections have a full checklist report.</div>}</article>
          </section>
          <footer className="admin-footer"><span>TruTag · FSSAI Administration Portal</span><span>Metrics sourced from current database records</span></footer>
        </>}
      </div>
    </main>
  </div>;
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';
import Link from 'next/link';
import './officer-dashboard.css';

type Officer = { id: number; officerId: string; name: string; designation: string; department: string; district: string; jurisdiction: string; credentialStatus: 'valid' | 'pending' | 'expired' | 'revoked'; status: 'active' | 'suspended' | 'revoked' };
type Assignment = { id: number; inspectionType: string; inspectionDate: string; jurisdiction: string; status: string; businessName: string; licenceReference: string; businessCategory: string; businessAddress: string; businessDistrict: string; businessJurisdiction: string; canGenerateQr: boolean };
type QrResult = { qrDataUrl: string; expiresAt: string; assignmentId: number };

function Icon({ name, size = 18 }: { name: 'shield' | 'pin' | 'calendar' | 'building' | 'logOut' | 'qr' | 'clock' | 'check' | 'clipboard' | 'close' | 'alert' | 'refresh'; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    shield: <><path d="M12 3 19 6v5c0 4.5-2.9 7.6-7 10-4.1-2.4-7-5.5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    building: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 21v-4h6v4M8 7h2m4 0h2M8 11h2m4 0h2"/></>,
    logOut: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></>,
    qr: <><path d="M4 8V5a1 1 0 0 1 1-1h3m8 0h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3m-8 0H5a1 1 0 0 1-1-1v-3M4 12h16"/><path d="M8 9h2v2H8zm6 4h2v2h-2zm-6 3h2v2H8"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>, check: <path d="m5 12 4 4L19 6"/>,
    clipboard: <><rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 5.5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.5M9 11h6M9 15h6"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>, alert: <><path d="M12 3 2.8 19h18.4L12 3Z"/><path d="M12 9v4m0 3h.01"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.5-3"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

async function getJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'The request could not be completed.');
  return body;
}

function prettyDate(date: string) { return new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }

export default function OfficerDashboardClient({ username }: { username: string }) {
  const [officer, setOfficer] = useState<Officer | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState<number | null>(null);
  const [qr, setQr] = useState<QrResult | null>(null);
  const [qrError, setQrError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const data = await getJson('/api/officer/dashboard', { cache: 'no-store' }); setOfficer(data.officer); setAssignments(data.assignments); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load officer dashboard.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function generateQr(assignment: Assignment) {
    setGenerating(assignment.id); setQrError('');
    try { const data = await getJson(`/api/officer/dashboard/assignments/${assignment.id}/qr`, { method: 'POST' }); setQr(data); }
    catch (err) { setQrError(err instanceof Error ? err.message : 'Could not generate the verification QR.'); }
    finally { setGenerating(null); }
  }

  const validCredential = officer?.credentialStatus === 'valid' && officer.status === 'active';
  return <main className="officer-dashboard"><header className="od-topbar"><a className="od-brand" href="/"><span className="od-brand-mark"><i/><i/><i/><i/></span><span><b>trutag</b><small>FOOD SAFETY OFFICER PORTAL</small></span></a><div className="od-session"><span className="od-secure"><i/>Secure session</span><span className="od-user-chip">{officer?.name?.split(/\s+/).map(part => part[0]).slice(0,2).join('').toUpperCase() || 'FO'}</span><button onClick={() => void signOut({ callbackUrl: '/sign-in' })}><Icon name="logOut" size={15}/>Sign out</button></div></header>
    <div className="od-content"><div className="od-heading"><div><div className="od-eyebrow"><i/>OFFICER WORKSPACE</div><h1>My inspection dashboard</h1><p>Your officer credentials and assigned food safety inspections.</p></div><div className="od-account">Signed in as <b>{username}</b></div></div>
      {error && <div className="od-error-banner"><Icon name="alert"/><span>{error}</span><button onClick={() => void load()}><Icon name="refresh" size={14}/>Retry</button></div>}
      {loading && !officer ? <div className="od-loading">Loading your officer profile and assignments…</div> : officer && <>
        <section className="od-profile-card"><div className="od-profile-main"><div className="od-avatar">{officer.name.split(/\s+/).map(part => part[0]).slice(0,2).join('').toUpperCase()}</div><div><div className="od-profile-label">FOOD SAFETY OFFICER</div><h2>{officer.name}</h2><p>{officer.designation} <span>·</span> {officer.department}</p><div className="od-id">Officer ID <b>{officer.officerId}</b></div></div></div><div className={`od-credential-card ${validCredential ? 'valid' : 'invalid'}`}><div className="od-credential-icon"><Icon name="shield" size={18}/></div><div><small>DIGITAL CREDENTIAL</small><b>{officer.credentialStatus}</b><span>{officer.status === 'active' ? 'Officer access active' : `Officer access ${officer.status}`}</span></div><i/></div><div className="od-profile-meta"><div><Icon name="pin" size={15}/><span><small>District</small><b>{officer.district}</b></span></div><div><Icon name="building" size={15}/><span><small>Jurisdiction</small><b>{officer.jurisdiction}</b></span></div><div><Icon name="clipboard" size={15}/><span><small>Assigned inspections</small><b>{assignments.length}</b></span></div></div></section>
        {!validCredential && <div className="od-credential-notice"><Icon name="alert" size={16}/><span>Your credentials or officer access are not currently valid. QR verification cannot be generated until your account is active and credential status is valid. Contact your administrator.</span></div>}
        <section className="od-inspections"><div className="od-section-head"><div><div className="od-eyebrow"><i/>FIELD WORK</div><h2>Assigned inspections</h2><p>Inspection assignments linked to your officer account.</p></div><span className="od-count">{assignments.length} {assignments.length === 1 ? 'assignment' : 'assignments'}</span></div>
          {qrError && <div className="od-inline-error"><Icon name="alert" size={15}/>{qrError}</div>}
          {assignments.length === 0 ? <div className="od-empty"><span><Icon name="clipboard" size={22}/></span><b>No inspections assigned yet</b><p>New assignments from FSSAI administration will appear here.</p></div> : <div className="od-assignment-list">{assignments.map(assignment => <article className="od-assignment-card" key={assignment.id}><div className="od-assignment-top"><div className="od-type-icon"><Icon name="clipboard" size={18}/></div><div className="od-assignment-title"><small>ASSIGNMENT #{String(assignment.id).padStart(5, '0')}</small><h3>{assignment.inspectionType}</h3></div><span className={`od-assignment-status ${assignment.status}`}><i/>{assignment.status}</span></div><div className="od-business-banner"><div className="od-business-icon"><Icon name="building" size={18}/></div><div><small>FOOD BUSINESS</small><b>{assignment.businessName}</b><span>{assignment.businessCategory} <i>·</i> FSSAI licence {assignment.licenceReference}</span></div></div><div className="od-detail-grid"><div><Icon name="calendar" size={15}/><span><small>Inspection date</small><b>{prettyDate(assignment.inspectionDate)}</b></span></div><div><Icon name="pin" size={15}/><span><small>Inspection jurisdiction</small><b>{assignment.jurisdiction}</b></span></div><div className="od-wide-detail"><Icon name="building" size={15}/><span><small>Business address</small><b>{assignment.businessAddress}, {assignment.businessDistrict}</b></span></div></div><div className="od-assignment-footer"><span className="od-validity"><Icon name={assignment.canGenerateQr ? 'check' : 'clock'} size={14}/>{assignment.canGenerateQr ? 'Ready for verification' : assignment.status === 'scheduled' ? 'Verification unavailable' : `Inspection ${assignment.status}`}</span><div className="od-assignment-actions"><Link className="od-passport-button" href={`/officer-dashboard/assignments/${assignment.id}`}>Open inspection checklist</Link>{assignment.canGenerateQr && <button className="od-qr-button" onClick={() => void generateQr(assignment)} disabled={generating === assignment.id}><Icon name="qr" size={16}/>{generating === assignment.id ? 'Generating…' : 'Generate Verification QR'}</button>}</div></div></article>)}</div>}
        </section>
      </>}
      <footer className="od-footer"><span>© 2026 TruTag · FSSAI Administration Portal</span><span><i/>Officer account data is securely loaded from your session</span></footer>
    </div>
    {qr && <div className="od-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setQr(null); }}><section className="od-qr-modal" role="dialog" aria-modal="true" aria-labelledby="od-qr-title"><button className="od-qr-close" onClick={() => setQr(null)} aria-label="Close"><Icon name="close"/></button><div className="od-qr-success"><Icon name="shield" size={20}/></div><h2 id="od-qr-title">Verification QR ready</h2><p>Present this QR code at the inspection. It is signed and expires after the scheduled inspection date.</p><img src={qr.qrDataUrl} alt="Signed inspection verification QR code"/><div className="od-qr-meta"><span>Assignment</span><b>#{String(qr.assignmentId).padStart(5, '0')}</b></div><div className="od-qr-meta"><span>Valid until</span><b>{new Date(qr.expiresAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</b></div><button className="od-qr-done" onClick={() => setQr(null)}>Done</button></section></div>}
  </main>;
}

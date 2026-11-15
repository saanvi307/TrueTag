'use client';

import { useEffect, useState } from 'react';
import { extractInspectionToken } from '@/lib/inspection-verification-url';
import './verify.css';

type Outcome = 'authority_verified' | 'identity_verified_authority_not_confirmed' | 'verification_failed';
type Verification = {
  outcome: Outcome;
  message: string;
  reasons?: string[];
  details?: {
    officer: { name: string; designation: string };
    inspection: { assignmentReference: string; type: string; date: string; jurisdiction: string };
    business: { name: string; licenceReference: string; category: string };
  };
};

function Icon({ name }: { name: 'shield' | 'alert' | 'user' | 'building' | 'calendar' | 'pin' | 'check' }) {
  const paths: Record<string, React.ReactNode> = {
    shield: <><path d="M12 3 19 6v5c0 4.5-2.9 7.6-7 10-4.1-2.4-7-5.5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    alert: <><path d="M12 3 2.8 19h18.4L12 3Z"/><path d="M12 9v4m0 3h.01"/></>,
    user: <><path d="M20 20v-1.7a3.3 3.3 0 0 0-3.3-3.3H7.3A3.3 3.3 0 0 0 4 18.3V20"/><circle cx="12" cy="7.5" r="3.5"/></>,
    building: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 21v-4h6v4M8 7h2m4 0h2M8 11h2m4 0h2"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
  };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const failed = (message: string): Verification => ({ outcome: 'verification_failed', message });
const labels: Record<Outcome, string> = {
  authority_verified: 'AUTHORITY VERIFIED',
  identity_verified_authority_not_confirmed: 'IDENTITY VERIFIED — AUTHORITY NOT CONFIRMED',
  verification_failed: 'VERIFICATION FAILED',
};

export default function VerifyPage() {
  const [result, setResult] = useState<Verification | null>(null);
  useEffect(() => {
    const token = extractInspectionToken(window.location.href);
    if (!token) { setResult(failed('This page did not receive a TruTag verification token. Scan the inspection QR again or open its complete verification link.')); return; }
    fetch('/api/qr/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }), cache: 'no-store' })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error('The verification service is temporarily unavailable.');
        return data as Verification;
      })
      .then(setResult)
      .catch(() => setResult(failed('The verification service is temporarily unavailable. Please try again.')));
  }, []);

  const outcome = result?.outcome;
  const details = result?.details;
  return <main className="verify-page"><section className={`verify-card ${outcome || 'is-loading'}`}>
    <header className="verify-brand"><span className="verify-mark"><i/><i/><i/><i/></span><span><b>trutag</b><small>PUBLIC INSPECTION VERIFICATION</small></span><span className="verify-government">FSSAI<br/>GOVERNMENT OF INDIA</span></header>
    {!result ? <div className="verify-pending"><span className="verify-spinner"/><h1>Checking this inspection</h1><p>Validating the signed QR token against current TruTag records.</p></div> : <>
      <div className={`verify-result-banner ${result.outcome}`}><span className="verify-seal">{result.outcome === 'authority_verified' ? <Icon name="check"/> : <Icon name="alert"/>}</span><div><small>TRUTAG VERIFICATION RESULT</small><h1>{labels[result.outcome]}</h1><p>{result.message}</p></div></div>
      {details && <><div className="verify-section-title">INSPECTION DETAILS</div><div className="verify-details">
        <article className="verify-detail-card"><span className="verify-detail-icon"><Icon name="user"/></span><div><small>ASSIGNED OFFICER</small><b>{details.officer.name}</b><span>{details.officer.designation}</span><em>FSSAI food safety officer</em></div></article>
        <article className="verify-detail-card"><span className="verify-detail-icon"><Icon name="building"/></span><div><small>FOOD BUSINESS</small><b>{details.business.name}</b><span>{details.business.category}</span><em>FSSAI licence · {details.business.licenceReference}</em></div></article>
        <article className="verify-detail-card"><span className="verify-detail-icon"><Icon name="calendar"/></span><div><small>INSPECTION</small><b>{details.inspection.type}</b><span>{new Date(`${details.inspection.date}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</span><em>Assignment · {details.inspection.assignmentReference}</em></div></article>
        <article className="verify-detail-card"><span className="verify-detail-icon"><Icon name="pin"/></span><div><small>JURISDICTION</small><b>{details.inspection.jurisdiction}</b><span>Recorded for this inspection</span></div></article>
      </div></>}
      {result.reasons?.length ? <div className="verify-reasons"><b>Authority check</b><ul>{result.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></div> : null}
      {result.outcome === 'verification_failed' && <div className="verify-failed-help"><Icon name="shield"/><span>No inspection or officer details are shown because the verification token could not be trusted.</span></div>}
    </>}
    <footer className="verify-footer"><span><i/>Official TruTag verification service</span><span>Food Safety and Standards Authority of India</span></footer>
  </section></main>;
}

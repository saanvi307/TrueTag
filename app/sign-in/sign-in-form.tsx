'use client';

import { FormEvent, useState } from 'react';
import { signIn } from 'next-auth/react';

export default function SignInForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await signIn('credentials', { username, password, redirect: false });
      if (!result || result.error) { setError('Unable to sign in. Check your credentials or contact your administrator.'); return; }
      const response = await fetch('/api/auth/session', { cache: 'no-store' });
      const session = await response.json();
      window.location.assign(session?.user?.role === 'officer' ? '/officer-dashboard' : '/');
    } catch { setError('Sign in is temporarily unavailable. Please try again.'); }
    finally { setBusy(false); }
  }
  return <form className="signin-form" onSubmit={submit}><label><span>Username</span><input autoComplete="username" required value={username} onChange={event => setUsername(event.target.value)} placeholder="Enter your username"/></label><label><span>Password</span><input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password"/></label>{error && <div className="signin-error" role="alert">{error}</div>}<button disabled={busy}>{busy ? 'Signing in…' : 'Sign in securely'}</button></form>;
}

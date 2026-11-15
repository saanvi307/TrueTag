import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import SignInForm from './sign-in-form';
import './sign-in.css';

export default async function SignInPage() {
  const session = await auth();
  if (session?.user.role === 'officer') redirect('/officer-dashboard');
  if (session?.user.role === 'admin') redirect('/');
  return <main className="signin-page"><div className="signin-card"><div className="signin-logo"><span className="signin-mark"><i/><i/><i/><i/></span><span><b>trutag</b><small>GOVERNMENT PORTAL</small></span></div><div className="signin-heading"><div className="signin-eyebrow">FSSAI ADMINISTRATION</div><h1>Welcome back</h1><p>Sign in to your TruTag government account.</p></div><SignInForm/><div className="signin-footer"><span className="secure-dot"/>Secure government network</div></div><div className="signin-copyright">© 2026 TruTag · Food Safety and Standards Authority of India</div></main>;
}

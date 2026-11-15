import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import VerificationLogsClient from './verification-logs-client';

export default async function VerificationLogsPage() {
  const session = await auth();
  if (session?.user.role !== 'admin') redirect('/sign-in');
  return <VerificationLogsClient username={session.user.username} />;
}

import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import DashboardClient from './dashboard-client';

export default async function DashboardPage() {
  const session = await auth();
  if (session?.user.role !== 'admin') redirect('/sign-in');
  return <DashboardClient username={session.user.username} />;
}

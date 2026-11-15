import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import OfficerDashboardClient from './officer-dashboard-client';

export default async function OfficerDashboardPage() {
  const session = await auth();
  if (session?.user.role !== 'officer' || !session.user.officerId) redirect('/sign-in');
  return <OfficerDashboardClient username={session.user.username}/>;
}

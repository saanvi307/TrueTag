import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import InspectionPassportClient from './inspection-passport-client';

export default async function InspectionPassportPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user.role !== 'officer' || !session.user.officerId) redirect('/sign-in');
  const { id } = await params;
  return <InspectionPassportClient assignmentId={id} username={session.user.username} />;
}

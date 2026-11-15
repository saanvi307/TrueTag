import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import ProductScannerClient from './product-scanner-client';

export default async function ProductScannerPage() {
  const session = await auth();
  if (session?.user.role !== 'admin') redirect('/sign-in');
  return <ProductScannerClient username={session.user.username} />;
}

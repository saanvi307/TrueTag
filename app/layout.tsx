import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TruTag | FSSAI Administration',
  description: 'FSSAI government administration dashboard for TruTag.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

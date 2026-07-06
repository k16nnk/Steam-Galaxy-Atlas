import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Steam Galaxy Atlas',
  description: 'A universe formed by Steam games.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}

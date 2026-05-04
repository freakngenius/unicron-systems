import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Pathfinder · Field Intel',
  description: 'Operations console for the Pathfinder Computer agent fleet.',
  robots: { index: false, follow: false },
};

// Demo Polish UX Gate 15A — `@modal` parallel slot powers the
// intercepting-route lead detail modal. The slot renders alongside
// children; its `default.tsx` returns `null` so the slot is empty until
// an intercept fires.
export default function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body>
        {children}
        {modal}
      </body>
    </html>
  );
}

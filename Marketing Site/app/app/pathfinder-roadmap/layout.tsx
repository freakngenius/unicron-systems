import type { Metadata, Viewport } from 'next';
import { Outfit, JetBrains_Mono } from 'next/font/google';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['400', '500'],
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500'],
});

const TITLE = 'Pathfinder Roadmap';
const DESCRIPTION =
  "What's live, building, and ahead for Pathfinder by Unicron Systems";
const URL = 'https://unicron.systems/pathfinder-roadmap';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: URL },
  robots: { index: true, follow: true },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: URL,
    type: 'website',
    siteName: 'Unicron Systems',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: '#FAFBFC',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${outfit.variable} ${jetbrains.variable}`}>
      {children}
    </div>
  );
}

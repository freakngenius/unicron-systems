import type { Metadata } from 'next';

import { SettingsShell } from '@/components/settings/SettingsShell';

export const metadata: Metadata = {
  title: 'Pathfinder · Settings',
  description: 'Operator-grade settings for the Pathfinder agent fleet.',
  robots: { index: false, follow: false },
};

export default function SettingsPage() {
  return <SettingsShell />;
}

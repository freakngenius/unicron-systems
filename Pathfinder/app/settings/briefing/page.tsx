// /pathfinder/settings/briefing — Demo Polish UX Gate 13W-C.
//
// Server-rendered shell. The form self-sources the operator email
// from localStorage (matches the HubspotUserTile pattern). Initial
// load is empty; the client component fetches /api/briefing/prefs on
// mount.

import type { Metadata } from 'next';

import { BriefingPrefsForm } from '@/components/settings/BriefingPrefsForm';

export const metadata: Metadata = {
  title: 'Pathfinder · Daily Brief Settings',
  description:
    'Configure your daily intelligence brief — frequency, send time, sections, and pause/resume.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function BriefingSettingsPage() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '32px 24px',
        fontFamily: 'system-ui,-apple-system,Segoe UI,sans-serif',
        color: '#1a1a1a',
      }}
    >
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Daily intelligence brief</h1>
      <p style={{ color: '#444', marginBottom: 24 }}>
        Choose when and what to receive in your inbox each day. The brief
        sends from your connected Gmail or Outlook account.
      </p>
      <BriefingPrefsForm />
    </main>
  );
}

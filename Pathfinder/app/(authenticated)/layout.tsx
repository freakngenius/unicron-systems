// app/(authenticated)/layout.tsx
// Route-group operator gate. Mirrors the default branch of app/[slug]/layout.tsx
// (lines 58-90) for routes that aren't under [slug] — currently only
// /internal/zedcor/run. /internal stays in middleware.ts PUBLIC_PATH_PREFIXES
// (basic-auth bypass) and in [slug]/layout.tsx PUBLIC_SLUGS (so OTHER /internal
// flows stay public); this layout gates ONLY routes inside (authenticated)/.

import { redirect } from 'next/navigation';
import { getOperatorIdentity } from '@/lib/auth/require-operator';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const result = await getOperatorIdentity();
  if (!result.ok) {
    if (result.status === 403) redirect('/login?error=unauthorized');
    if (result.status === 500) redirect('/login?error=misconfigured');
    redirect('/login');
  }
  return <>{children}</>;
}

// lib/catalog/modules/daily-digest/DailyDigestModule.tsx, Stream D.
//
// Non-visual catalog module for slot `delivery.digest`. The actual delivery
// runs through the cron route at app/api/cron/internal-digest/route.ts which
// delegates to runInternalDailyDigest. The component itself renders nothing
// (the fallback strategy is 'hidden'); this exists so the catalog has a
// real lazy import to bind, replacing the Stream A floor stub.
//
// Surface streams that introspect catalog resolution may key off the
// data-module-id marker for diagnostics, but no visible UI is produced.

import * as React from 'react';
import type { ModuleComponentProps } from '@/lib/catalog/types';

void React;

export default function DailyDigestModule(_props: ModuleComponentProps): React.ReactElement {
  return (
    <span
      data-module-id="daily-digest"
      data-module-render-mode="non-visual"
      aria-hidden
      style={{ display: 'none' }}
    />
  );
}

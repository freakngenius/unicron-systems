'use client';

import { Card, Phase2Banner } from '../Field';

export function UsersSection() {
  return (
    <>
      <Card title="User list">
        <Phase2Banner note="Add team members + assign roles (admin / operator / branch manager / read-only). Single-tenant basic auth covers the demo + pilot; per-user roles ship in Phase 2." />
      </Card>

      <Card title="Single sign-on">
        <Phase2Banner note="Google SSO or SAML for Zedcor. Phase 2." />
      </Card>

      <Card title="Audit log access">
        <Phase2Banner note="Read-only access to pathfinder.agent_log filtered by agent and date range, gated to operator role and above. Phase 2." />
      </Card>
    </>
  );
}

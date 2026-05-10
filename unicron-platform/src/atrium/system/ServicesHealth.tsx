// ServicesHealth.tsx — Sprint 3 Stream D
// Static health cards for all configured Unicron services.
// Live health checks wire in Sprint 7.

export default function ServicesHealth() {
  const SERVICES = [
    {
      name: 'Supabase',
      key: 'supabase',
      description: 'Database + auth + realtime',
      docsUrl: 'https://supabase.com',
    },
    {
      name: 'Vercel',
      key: 'vercel',
      description: 'Deploy + serverless functions',
      docsUrl: 'https://vercel.com',
    },
    {
      name: 'Anthropic',
      key: 'anthropic',
      description: 'LLM gateway (Sonnet + Haiku)',
      docsUrl: 'https://anthropic.com',
    },
    {
      name: 'Slack',
      key: 'slack',
      description: 'Team comms + Orchestrator surface',
      docsUrl: 'https://slack.com',
    },
    {
      name: 'GitHub (Vault)',
      key: 'github',
      description: 'Knowledge vault (unicron-knowledge)',
      docsUrl: 'https://github.com/freakngenius/unicron-knowledge',
    },
    {
      name: 'Inngest',
      key: 'inngest',
      description: 'Event queue + cron orchestration',
      docsUrl: 'https://inngest.com',
    },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {SERVICES.map((svc) => (
          <div
            key={svc.key}
            className="bg-bg-card rounded-xl p-4 border border-border-default hover:border-border-hover transition-colors flex items-start gap-3"
          >
            <span
              className="w-2 h-2 mt-1.5 rounded-full shrink-0"
              style={{ backgroundColor: '#4FB286', boxShadow: '0 0 4px #4FB28660' }}
            />
            <div className="min-w-0">
              <div className="mono text-[12px] text-text-primary font-medium">{svc.name}</div>
              <div className="mono text-[10px] text-text-secondary mt-0.5">
                {svc.description}
              </div>
              <div className="mono text-[9px] uppercase tracking-[0.12em] text-text-muted mt-1.5">
                Status: healthy (static)
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-bg-card border border-border-default rounded-xl px-5 py-4">
        <div className="mono text-[9px] uppercase tracking-[0.16em] text-text-muted mb-1">
          About this panel
        </div>
        <p className="mono text-[11px] text-text-secondary leading-relaxed">
          Live health checks (latency, error rate, quota remaining) wire in Sprint 7. Current status
          shows statically configured services. If a service is down, check its status page
          directly.
        </p>
      </div>
    </div>
  );
}

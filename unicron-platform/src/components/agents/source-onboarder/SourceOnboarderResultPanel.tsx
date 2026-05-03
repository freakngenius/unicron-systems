import type { OnboardSyncResponse, AdapterKind } from '../../../lib/contracts/sourceOnboarder';

interface Props {
  result: OnboardSyncResponse;
  onCommit?: () => void | Promise<void>;
  onOpenTier2?: (ticketId: string) => void;
  committing?: boolean;
  /** True after the dispatch is verified or rejected — hide actions. */
  readOnly?: boolean;
}

export function SourceOnboarderResultPanel({
  result,
  onCommit,
  onOpenTier2,
  committing,
  readOnly,
}: Props) {
  const isLive = result.status === 'live';
  const isHumanAssist = result.status === 'human-assist';
  const isDeclined = result.status === 'declined';

  return (
    <section
      data-testid="source-onboarder-result-panel"
      data-result-status={result.status}
      className="flex flex-col gap-5"
    >
      <header className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
            ONBOARD RESULT · {result.status.toUpperCase().replace('-', ' ')}
          </span>
          <h2 className="mono text-[14px] tracking-wide text-text-primary leading-snug">
            {isLive
              ? `Tier 1 — adapter ${result.adapter_kind ?? 'unknown'} ready to commit`
              : isHumanAssist
                ? 'Tier 2 — needs operator help'
                : isDeclined
                  ? 'Declined — agent recommends not onboarding'
                  : 'Result'}
          </h2>
        </div>
        <div className="flex flex-col items-end gap-1 mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
          <span>COST ${result.cost_usd.toFixed(2)}</span>
          <span>{(result.duration_ms / 1000).toFixed(1)}s</span>
        </div>
      </header>

      {isLive ? (
        <Tier1Detail result={result} />
      ) : isHumanAssist ? (
        <Tier2Detail result={result} onOpenTier2={onOpenTier2} />
      ) : isDeclined ? (
        <DeclineDetail result={result} />
      ) : null}

      {!readOnly && isLive && onCommit ? (
        <footer className="flex items-center justify-between border-t border-border-default pt-4">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
            Commit registers the source + watcher in production.
          </span>
          <button
            type="button"
            onClick={onCommit}
            disabled={committing}
            data-testid="source-onboarder-commit-button"
            className="mono text-[11px] uppercase tracking-[0.18em] border border-emerald-400/60 text-emerald-400 px-4 py-2 rounded-md hover:bg-emerald-400 hover:text-bg-base disabled:opacity-50 transition-colors"
          >
            {committing ? 'COMMITTING…' : 'COMMIT TO PRODUCTION'}
          </button>
        </footer>
      ) : null}
    </section>
  );
}

function Tier1Detail({ result }: { result: OnboardSyncResponse }) {
  const adapter: AdapterKind | null = (result.adapter_kind as AdapterKind | undefined) ?? null;
  const schema = result.schema && typeof result.schema === 'object' ? result.schema : null;
  return (
    <div className="flex flex-col gap-4">
      <Stat label="SOURCE ID" value={result.source_id ?? '—'} />
      <Stat label="ADAPTER" value={adapter ?? '—'} />
      {result.first_event_at ? (
        <Stat label="FIRST EVENT" value={new Date(result.first_event_at).toLocaleString()} />
      ) : null}
      {schema ? (
        <div className="flex flex-col gap-2">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
            SCHEMA MAPPING ({Object.keys(schema).length} fields)
          </span>
          <pre
            data-testid="source-onboarder-schema-preview"
            className="whitespace-pre-wrap font-mono text-[12px] text-text-primary/80 bg-bg-panel border border-border-default rounded-md p-3 max-h-72 overflow-auto"
          >
            {JSON.stringify(schema, null, 2)}
          </pre>
        </div>
      ) : null}
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/30">
        Adapter code edit is preview-only this PR. Inline edit is a follow-up sprint.
      </span>
    </div>
  );
}

function Tier2Detail({
  result,
  onOpenTier2,
}: {
  result: OnboardSyncResponse;
  onOpenTier2?: (ticketId: string) => void;
}) {
  return (
    <div
      data-testid="source-onboarder-tier2-detail"
      className="flex flex-col gap-3 border border-accent-gold/40 rounded-md bg-bg-panel p-4"
    >
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-accent-gold">
        THIS SOURCE NEEDS YOUR HELP
      </span>
      {result.reason ? (
        <p className="text-[13px] text-text-primary/80">{result.reason}</p>
      ) : null}
      {result.ticket_id && onOpenTier2 ? (
        <button
          type="button"
          onClick={() => onOpenTier2(result.ticket_id!)}
          data-testid="source-onboarder-open-tier2"
          className="self-end mono text-[11px] uppercase tracking-[0.18em] border border-accent-gold text-accent-gold px-3 py-1 rounded-md hover:bg-accent-gold hover:text-bg-base transition-colors"
        >
          OPEN TICKET
        </button>
      ) : null}
    </div>
  );
}

function DeclineDetail({ result }: { result: OnboardSyncResponse }) {
  return (
    <div className="flex flex-col gap-2 border border-rose-400/40 rounded-md bg-bg-panel p-4">
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-rose-400">
        DECLINED
      </span>
      {result.reason ? (
        <p className="text-[13px] text-text-primary/80">{result.reason}</p>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border border-border-default rounded-md bg-bg-panel px-3 py-2">
      <span className="mono text-[9px] uppercase tracking-[0.18em] text-text-primary/40">
        {label}
      </span>
      <span className="mono text-[13px] text-text-primary truncate">{value}</span>
    </div>
  );
}

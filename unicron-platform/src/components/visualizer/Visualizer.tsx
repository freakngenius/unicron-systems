import { useEffect, useRef, useState } from 'react';
import { SimEngine } from './simEngine';
import type { HudSnapshot } from './types';
import type { SystemConfig } from '../../context/SystemContext';

type Props = {
  config: SystemConfig;
  showInternalCostMetrics: boolean;
  reducedMotion?: boolean;
  onNodeClick?: (agentId: string) => void;
  onReportDelivered?: (snapshot: { reports: number; valueSurfaced: number }) => void;
  density?: 'compact' | 'full';
  /** Show the bottom HUD strip. Defaults to true on `full`, false on `compact`. */
  showHud?: boolean;
  /** Set to {agentId, key} to briefly pulse all instances of that agent. */
  pulseSignal?: { agentId: string; key: number } | null;
  /**
   * When provided, the bottom HUD strip reads from this snapshot instead of
   * the simulation's internal HUD. Used by Live System to bind the HUD to
   * real Supabase aggregates while leaving the canvas simulation alone.
   */
  hudOverride?: HudSnapshot | null;
  /** Optional override for canvas height. Component otherwise fills its container. */
  className?: string;
};

const formatValue = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};

export function Visualizer({
  config,
  showInternalCostMetrics,
  reducedMotion = false,
  onNodeClick,
  onReportDelivered,
  density = 'full',
  showHud,
  pulseSignal,
  hudOverride,
  className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<SimEngine | null>(null);
  const [hud, setHud] = useState<HudSnapshot>({
    signalsProcessed: 0,
    signalsRejected: 0,
    decisionsMade: 0,
    valueSurfaced: 0,
    reportsDelivered: 0,
    activeNodes: 0,
    costPerReport: 0.07,
  });

  // Mount the engine once; pass updates via updateConfig.
  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new SimEngine({
      canvas: canvasRef.current,
      config,
      density,
      reducedMotion,
      onEvent: (e) => {
        if (e.kind === 'hud') setHud(e.hud);
        else if (e.kind === 'node-clicked') onNodeClick?.(e.agentId);
        else if (e.kind === 'report-delivered')
          onReportDelivered?.({
            reports: e.reports,
            valueSurfaced: e.valueSurfaced,
          });
      },
    });
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.updateConfig(config);
  }, [config]);

  useEffect(() => {
    engineRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    if (pulseSignal && engineRef.current) {
      engineRef.current.pulseAgent(pulseSignal.agentId);
    }
    // Re-run whenever the key changes, even if the agentId is identical.
  }, [pulseSignal?.agentId, pulseSignal?.key]);

  const renderHud = showHud ?? density === 'full';
  const liveHud = hudOverride ?? hud;

  return (
    <div className={['relative w-full h-full', className ?? ''].join(' ')}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
      {renderHud && (
        <div className="absolute inset-x-0 bottom-0 h-8 bg-bg-base/70 backdrop-blur border-t border-border-default flex items-center px-5 gap-7 mono text-[10.5px] text-text-secondary pointer-events-none z-[2]">
          <HudCell label="signals.processed" value={liveHud.signalsProcessed.toLocaleString()} minCh={6} />
          <HudCell label="signals.rejected" value={liveHud.signalsRejected.toLocaleString()} minCh={6} />
          <HudCell label="decisions.made" value={liveHud.decisionsMade.toLocaleString()} minCh={5} />
          <HudCell label="value.surfaced" value={formatValue(liveHud.valueSurfaced)} minCh={7} />
          <HudCell label="nodes.active" value={liveHud.activeNodes.toLocaleString()} minCh={3} />
          <HudCell label="reports.delivered" value={liveHud.reportsDelivered.toLocaleString()} minCh={4} />
          {showInternalCostMetrics && (
            <HudCell
              label="cost.per.report"
              value={`$${liveHud.costPerReport.toFixed(3)}`}
              minCh={6}
              gold
            />
          )}
        </div>
      )}
    </div>
  );
}

function HudCell({
  label,
  value,
  minCh,
  gold,
}: {
  label: string;
  value: string;
  /** Minimum character width for the value column. Prevents layout shift on tick. */
  minCh: number;
  gold?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2 whitespace-nowrap">
      <span className={gold ? 'text-accent-gold/70' : 'text-text-secondary/60'}>{label}</span>
      <span
        className={[
          'tabular-nums inline-block text-right',
          gold ? 'text-accent-gold' : 'text-text-primary',
        ].join(' ')}
        style={{ minWidth: `${minCh}ch` }}
      >
        {value}
      </span>
    </div>
  );
}

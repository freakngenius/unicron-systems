import { useEffect, useRef } from 'react';

/**
 * Embeds the original `living-intelligence.html` as an iframe and posts the
 * current Settings to it whenever they change. The HTML's pre-React message
 * bridge translates these into body classes so the visual state is correct
 * before the iframe's React even mounts.
 */
type Props = {
  showInternalCostMetrics: boolean;
  reducedMotion: boolean;
  /** Set to false to hide the legend overlay inside the iframe. */
  showLegend?: boolean;
  /** Set to false to hide the HUD strip inside the iframe. */
  showHud?: boolean;
  className?: string;
};

const FRAME_SRC = '/living-intelligence.html';

export function LivingIntelligenceFrame({
  showInternalCostMetrics,
  reducedMotion,
  showLegend = true,
  showHud = true,
  className,
}: Props) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const settingsRef = useRef({
    showInternalCostMetrics,
    reducedMotion,
    showLegend,
    showHud,
  });
  settingsRef.current = { showInternalCostMetrics, reducedMotion, showLegend, showHud };

  // Push current settings to the iframe.
  const post = () => {
    const win = frameRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      { type: 'unicron:settings', settings: settingsRef.current },
      '*',
    );
  };

  useEffect(() => {
    post();
  }, [showInternalCostMetrics, reducedMotion, showLegend, showHud]);

  // Listen for the iframe's "ready" handshake and any later remounts.
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      if (!ev.data || ev.data.type !== 'unicron:ready') return;
      if (ev.source !== frameRef.current?.contentWindow) return;
      post();
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <iframe
      ref={frameRef}
      src={FRAME_SRC}
      title="Living intelligence visualizer"
      className={['block w-full h-full border-0', className ?? ''].join(' ')}
      onLoad={post}
      // No sandbox: the file is first-party, and removing restrictions ensures
      // its in-frame Tune panel, Operations Log, and Agent Key legend all
      // remain interactive.
    />
  );
}

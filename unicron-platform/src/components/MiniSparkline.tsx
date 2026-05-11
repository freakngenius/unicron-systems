// Lightweight inline sparkline. Canvas, no chart lib. Renders a daily-bucket
// trend line plus an end-of-series dot. Width adapts to the parent container
// via a ResizeObserver; height is fixed by the prop.

import { useEffect, useRef } from 'react';

interface Props {
  /** Daily values, oldest → newest. */
  data: number[];
  height?: number;
  /** Stroke colour. Pass a CSS color or token name. Defaults to Atrium accent. */
  stroke?: string;
  /** Fill colour for the area under the line. Pass null to disable. */
  fill?: string | null;
  className?: string;
  ariaLabel?: string;
}

// Canvas 2D requires a resolved color string (var() not supported as fillStyle),
// so we read the value off the document at draw time. Falls back to a sane
// neutral if the token cannot be resolved (e.g. SSR / test).
function resolveCssVar(token: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return v || fallback;
}

// Resolve a value that may be a literal color or `var(--token)` form.
function resolveColor(value: string | undefined, fallbackToken: string, fallback: string): string {
  if (!value) return resolveCssVar(fallbackToken, fallback);
  const m = value.trim().match(/^var\((--[a-zA-Z0-9-]+)\)$/);
  if (m) return resolveCssVar(m[1], fallback);
  return value;
}

export function MiniSparkline({
  data,
  height = 36,
  stroke,
  fill,
  className,
  ariaLabel,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;
    const parent = canvas.parentElement;

    const resolvedStroke = resolveColor(stroke, '--accent', '#E8763A');
    const resolvedFill =
      fill === null
        ? null
        : resolveColor(fill, '--accent-soft', 'rgba(232,118,58,0.14)');

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssW = parent.clientWidth || 200;
      const cssH = height;
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      if (data.length === 0) return;

      const padX = 2;
      const padY = 4;
      const w = cssW - padX * 2;
      const h = cssH - padY * 2;
      const max = Math.max(...data, 1);
      const min = Math.min(...data, 0);
      const range = Math.max(max - min, 1);
      const xStep = data.length > 1 ? w / (data.length - 1) : 0;
      const points = data.map((v, i) => ({
        x: padX + i * xStep,
        y: padY + h - ((v - min) / range) * h,
      }));

      // Fill area under the curve.
      if (resolvedFill) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, padY + h);
        points.forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.lineTo(points[points.length - 1].x, padY + h);
        ctx.closePath();
        ctx.fillStyle = resolvedFill;
        ctx.fill();
      }

      // Stroke the line.
      ctx.beginPath();
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.strokeStyle = resolvedStroke;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      // End-of-series dot.
      const last = points[points.length - 1];
      ctx.beginPath();
      ctx.arc(last.x, last.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = resolvedStroke;
      ctx.fill();
    };

    draw();
    const ro = new ResizeObserver(() => draw());
    ro.observe(parent);
    return () => ro.disconnect();
  }, [data, height, stroke, fill]);

  return (
    <div className={className} role="img" aria-label={ariaLabel}>
      <canvas ref={canvasRef} data-testid="mini-sparkline" />
    </div>
  );
}

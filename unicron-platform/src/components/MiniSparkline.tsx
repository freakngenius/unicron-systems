// Lightweight inline sparkline. Canvas, no chart lib. Renders a daily-bucket
// trend line plus an end-of-series dot. Width adapts to the parent container
// via a ResizeObserver; height is fixed by the prop.

import { useEffect, useRef } from 'react';

interface Props {
  /** Daily values, oldest → newest. */
  data: number[];
  height?: number;
  /** Stroke colour. Defaults to accent gold. */
  stroke?: string;
  /** Fill colour for the area under the line. Pass null to disable. */
  fill?: string | null;
  className?: string;
  ariaLabel?: string;
}

export function MiniSparkline({
  data,
  height = 36,
  stroke = '#E5C56C', // accent gold
  fill = 'rgba(229, 197, 108, 0.10)',
  className,
  ariaLabel,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;
    const parent = canvas.parentElement;

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
      if (fill) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, padY + h);
        points.forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.lineTo(points[points.length - 1].x, padY + h);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      }

      // Stroke the line.
      ctx.beginPath();
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      // End-of-series dot.
      const last = points[points.length - 1];
      ctx.beginPath();
      ctx.arc(last.x, last.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = stroke;
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

type Props = {
  populated?: boolean;
  thinking?: boolean;
  size?: number;
  className?: string;
};

// Atrium token-aligned. Ring strokes use the surface scale; sprite colors map
// to category tokens (operations/discovery/marketing) so the placeholder reads
// on-brand against any Atrium surface.
const ringStroke = 'var(--bg-raised)';
const ringStrokeFaint = 'var(--bg-elevated)';

const colors = {
  cyan: 'var(--cat-operations)',
  gold: 'var(--cat-discovery)',
  magenta: 'var(--cat-marketing)',
};

type Sprite = { kind: 'hex' | 'diamond' | 'octagon'; r: number; theta: number; color: keyof typeof colors };

const sprites: Sprite[] = [
  { kind: 'hex', r: 0.36, theta: -1.2, color: 'cyan' },
  { kind: 'diamond', r: 0.5, theta: 0.6, color: 'gold' },
  { kind: 'octagon', r: 0.62, theta: 2.4, color: 'magenta' },
  { kind: 'hex', r: 0.74, theta: -2.5, color: 'cyan' },
  { kind: 'diamond', r: 0.42, theta: 1.85, color: 'gold' },
  { kind: 'octagon', r: 0.86, theta: 0.15, color: 'magenta' },
  { kind: 'hex', r: 0.58, theta: -0.55, color: 'cyan' },
  { kind: 'diamond', r: 0.78, theta: 2.95, color: 'gold' },
];

export function MeshPlaceholder({ populated, thinking, size = 360, className }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 4;
  const radii = [maxR * 0.25, maxR * 0.5, maxR * 0.75, maxR];

  return (
    <div className={['relative inline-block', className ?? ''].join(' ')} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
        <defs>
          <radialGradient id="meshGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent-soft)" />
            <stop offset="100%" stopColor="rgba(232,118,58,0)" />
          </radialGradient>
        </defs>

        <rect x={0} y={0} width={size} height={size} fill="url(#meshGlow)" />

        {radii.map((r, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={i === radii.length - 1 ? ringStrokeFaint : ringStroke}
            strokeWidth={1}
            strokeDasharray={i === 0 ? '' : `${i + 1} ${i + 3}`}
            opacity={0.85 - i * 0.12}
          />
        ))}

        <line x1={cx} y1={cy - maxR} x2={cx} y2={cy + maxR} stroke={ringStrokeFaint} strokeWidth={1} />
        <line x1={cx - maxR} y1={cy} x2={cx + maxR} y2={cy} stroke={ringStrokeFaint} strokeWidth={1} />

        {populated &&
          sprites.map((s, idx) => {
            const x = cx + Math.cos(s.theta) * (s.r * maxR);
            const y = cy + Math.sin(s.theta) * (s.r * maxR);
            return <Sprite key={idx} kind={s.kind} cx={x} cy={y} fill={colors[s.color]} />;
          })}

        {thinking && (
          <circle
            cx={cx}
            cy={cy}
            r={5}
            fill={colors.gold}
            className="animate-pulseDot"
            style={{ transformOrigin: `${cx}px ${cy}px` }}
          />
        )}
      </svg>
    </div>
  );
}

function Sprite({
  kind,
  cx,
  cy,
  fill,
}: {
  kind: 'hex' | 'diamond' | 'octagon';
  cx: number;
  cy: number;
  fill: string;
}) {
  if (kind === 'diamond') {
    const s = 6;
    return (
      <polygon
        points={`${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`}
        fill={fill}
        stroke="var(--bg-ground)"
        strokeWidth={1}
      />
    );
  }
  if (kind === 'hex') {
    const s = 5.5;
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      pts.push(`${cx + s * Math.cos(a)},${cy + s * Math.sin(a)}`);
    }
    return <polygon points={pts.join(' ')} fill={fill} stroke="var(--bg-ground)" strokeWidth={1} />;
  }
  // octagon
  const s = 5.5;
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i + Math.PI / 8;
    pts.push(`${cx + s * Math.cos(a)},${cy + s * Math.sin(a)}`);
  }
  return <polygon points={pts.join(' ')} fill={fill} stroke="var(--bg-ground)" strokeWidth={1} />;
}

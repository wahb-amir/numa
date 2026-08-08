interface SparklineProps {
  data: (number | null)[];
  width?: number;
  height?: number;
  color?: string;
  fillId?: string;
  strokeWidth?: number;
}

// Pure server-rendered SVG — no client JS, no chart library needed for a simple trend line.
export function Sparkline({
  data,
  width = 320,
  height = 80,
  color = "var(--color-accent-emerald)",
  strokeWidth = 2,
}: SparklineProps) {
  const valid = data.filter((d): d is number => d !== null);
  if (valid.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="Not enough data to chart a trend"
      >
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          fontSize="12"
          fill="var(--color-text-muted)"
        >
          Not enough data yet
        </text>
      </svg>
    );
  }

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  const points: { x: number; y: number }[] = [];
  data.forEach((val, i) => {
    if (val === null) return;
    const x = i * stepX;
    const y = height - ((val - min) / range) * (height - 12) - 6;
    points.push({ x, y });
  });

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${path} L ${points[points.length - 1]?.x} ${height} L ${points[0]?.x} ${height} Z`;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Trend line ranging from ${min} to ${max}`}
      className="overflow-visible"
    >
      <path d={areaPath} fill={color} opacity={0.08} />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === points.length - 1 ? 3 : 0}
          fill={color}
        />
      ))}
    </svg>
  );
}

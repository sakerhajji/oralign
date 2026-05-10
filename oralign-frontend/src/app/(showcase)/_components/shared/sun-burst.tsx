type Variant = "hero" | "core" | "subtle";

export function SunBurst({ variant = "subtle", className = "" }: { variant?: Variant; className?: string }) {
  const opacityScale = variant === "hero" ? 1 : variant === "core" ? 0.55 : 0.35;

  const ray = (a: number, w = 1) => (
    <line
      key={a}
      x1={0}
      y1={-380}
      x2={0}
      y2={380}
      stroke={`rgba(245,200,66,${0.06 * opacityScale})`}
      strokeWidth={w}
      transform={`rotate(${a})`}
    />
  );

  return (
    <svg viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className={className}>
      <g transform="translate(400,400)">
        {[0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5, 180, 202.5, 225, 247.5, 270, 292.5, 315, 337.5].map((a) => ray(a))}
        <circle r="120" fill="none" stroke={`rgba(245,200,66,${0.07 * opacityScale})`} strokeWidth={1} />
        <circle r="200" fill="none" stroke={`rgba(245,200,66,${0.05 * opacityScale})`} strokeWidth={1} />
        <circle r="290" fill="none" stroke={`rgba(245,200,66,${0.035 * opacityScale})`} strokeWidth={1} />
        <circle r="370" fill="none" stroke={`rgba(245,200,66,${0.02 * opacityScale})`} strokeWidth={1} />
        <circle r="80" fill={`rgba(245,200,66,${0.04 * opacityScale})`} />
      </g>
    </svg>
  );
}

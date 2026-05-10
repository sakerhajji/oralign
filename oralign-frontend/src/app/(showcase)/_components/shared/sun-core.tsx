export function SunCore({ name = "", sub = "" }: { name?: string; sub?: string }) {
  return (
    <div className="relative w-[320px] h-[320px]">
      <div className="absolute -inset-20 sc-rotslow" aria-hidden="true">
        <svg viewBox="0 0 480 480" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
          <g transform="translate(240,240)">
            {[0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5].map((a) => (
              <line
                key={a}
                x1={0}
                y1={-230}
                x2={0}
                y2={230}
                stroke="rgba(245,200,66,0.16)"
                strokeWidth={1}
                transform={`rotate(${a})`}
              />
            ))}
            <circle r="230" fill="none" stroke="rgba(245,200,66,0.06)" strokeWidth={1} strokeDasharray="4 6" />
            <circle r="170" fill="none" stroke="rgba(245,200,66,0.08)" strokeWidth={1} />
            <circle r="110" fill="none" stroke="rgba(245,200,66,0.1)" strokeWidth={1} />
          </g>
        </svg>
      </div>
      <div
        className="absolute inset-20 rounded-full flex flex-col items-center justify-center gap-1.5"
        style={{
          background: "radial-gradient(circle at 40% 35%, var(--sc-sun-2) 0%, var(--sc-sun) 60%, #e8a820 100%)",
          boxShadow: "0 0 60px rgba(245,200,66,0.35), 0 0 120px rgba(245,200,66,0.12)",
        }}
      >
        <span className="sc-serif text-[2rem] font-medium tracking-[0.2em] text-[var(--sc-black)] leading-none uppercase">
          {name}
        </span>
        <span className="text-[0.48rem] tracking-[0.5em] uppercase text-[rgba(10,10,10,0.55)]">{sub}</span>
      </div>
    </div>
  );
}

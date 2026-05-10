import type { ReactNode } from "react";

type Props = {
  eyebrow: string;
  children: ReactNode;
  tone?: "light" | "dark";
  align?: "start" | "center";
  id?: string;
};

export function SectionHeading({ eyebrow, children, tone = "light", align = "start", id }: Props) {
  const eyebrowColor = tone === "dark" ? "text-[var(--sc-sun)]" : "text-[var(--sc-black)]";
  const lineBg = tone === "dark" ? "bg-[var(--sc-sun)]" : "bg-[var(--sc-black)]";
  return (
    <div className={align === "center" ? "text-center" : ""}>
      <div
        className={`flex items-center gap-3 ${align === "center" ? "justify-center" : ""} ${eyebrowColor}`}
        style={{ fontSize: "0.55rem", letterSpacing: "0.42em", textTransform: "uppercase" }}
      >
        <span className={`sc-eyebrow-line w-[18px] h-px ${lineBg}`} aria-hidden="true" />
        <span>{eyebrow}</span>
        {align === "center" && <span className={`sc-eyebrow-line w-[18px] h-px ${lineBg}`} aria-hidden="true" />}
      </div>
      <h2
        id={id}
        className={`sc-serif mt-3.5 leading-[1.08]`}
        style={{ fontSize: "clamp(2rem, 3.5vw, 3.6rem)", fontWeight: 300 }}
      >
        {children}
      </h2>
    </div>
  );
}

import Image from "next/image";

type Aspect = "square" | "portrait" | "landscape" | "video" | "wide" | "tall";
type Tone = "light" | "dark" | "gold";

type Props = {
  /** Short label shown inside the placeholder. */
  label?: string;
  src?: string;
  aspect?: Aspect;
  tone?: Tone;
  className?: string;
  /** Hide the corner brackets — useful inside small avatars. */
  bare?: boolean;
};

const ASPECT_CLASS: Record<Aspect, string> = {
  square: "aspect-square",
  portrait: "aspect-[3/4]",
  landscape: "aspect-[4/3]",
  video: "aspect-video",
  wide: "aspect-[16/9]",
  tall: "aspect-[2/3]",
};

const TONE: Record<Tone, { bg: string; text: string; border: string; ring: string }> = {
  light: {
    bg: "bg-[#f1ede5]",
    text: "text-[var(--sc-text-mid)]",
    border: "border-[var(--sc-grey)]",
    ring: "var(--sc-sun)",
  },
  dark: {
    bg: "bg-[#141414]",
    text: "text-[rgba(248,246,242,0.55)]",
    border: "border-[#262626]",
    ring: "var(--sc-sun)",
  },
  gold: {
    bg: "bg-[rgba(245,200,66,0.14)]",
    text: "text-[var(--sc-text-dark)]",
    border: "border-[rgba(245,200,66,0.4)]",
    ring: "var(--sc-sun)",
  },
};

/**
 * Editorial image placeholder. Renders a styled box with corner brackets and
 * a small sun glyph so designers see exactly where to drop a real photo
 * later. Drop in `<ImagePlaceholder label="Smile portrait" />` and replace
 * with `<Image>` + `priority` once the asset is final.
 */
export function ImagePlaceholder({
  label = "Image",
  src,
  aspect = "landscape",
  tone = "light",
  className = "",
  bare = false,
}: Props) {
  const t = TONE[tone];

  return (
    <div
      role="img"
      aria-label={label}
      className={`relative overflow-hidden border ${ASPECT_CLASS[aspect]} ${t.bg} ${t.border} ${className}`}
    >
      {src && (
        <Image
          src={src}
          alt={label}
          fill
          quality={85}
          sizes="(min-width: 1280px) 380px, (min-width: 1024px) 340px, 100vw"
          className="object-cover object-center"
        />
      )}

      {/* Subtle radial glow */}
      <span
        aria-hidden="true"
        className={`absolute inset-0 pointer-events-none ${src ? "opacity-35" : "opacity-60"}`}
        style={{
          background:
            tone === "dark"
              ? "radial-gradient(circle at 50% 35%, rgba(245,200,66,0.12), transparent 65%)"
              : "radial-gradient(circle at 50% 35%, rgba(245,200,66,0.18), transparent 65%)",
        }}
      />

      {/* Corner brackets */}
      {!bare && (
        <>
          <span aria-hidden="true" className="absolute top-0 left-0 w-5 h-5 border-t border-l" style={{ borderColor: t.ring }} />
          <span aria-hidden="true" className="absolute top-0 right-0 w-5 h-5 border-t border-r" style={{ borderColor: t.ring }} />
          <span aria-hidden="true" className="absolute bottom-0 left-0 w-5 h-5 border-b border-l" style={{ borderColor: t.ring }} />
          <span aria-hidden="true" className="absolute bottom-0 right-0 w-5 h-5 border-b border-r" style={{ borderColor: t.ring }} />
        </>
      )}

      {/* Sun glyph + label */}
      {!src && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
          <svg width="38" height="38" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <circle cx="24" cy="24" r="9" fill="var(--sc-sun)" opacity="0.55" />
            <circle cx="24" cy="24" r="13" stroke="var(--sc-sun)" strokeWidth="0.6" opacity="0.45" />
            <circle cx="24" cy="24" r="18" stroke="var(--sc-sun)" strokeWidth="0.4" opacity="0.25" />
          </svg>
          {label && (
            <span className={`${t.text} text-[0.55rem] tracking-[0.3em] uppercase max-w-[80%]`}>
              {label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

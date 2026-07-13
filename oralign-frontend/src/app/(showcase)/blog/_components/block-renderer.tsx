import Image from "next/image";
import { resolveBlogMediaUrl } from "@/lib/api/blog.service";
import type { BlogBlock } from "@/lib/types";

/**
 * Pure, SAFE renderer for a post's structured `BlogBlock[]`.
 *
 * Server component (no hooks / no client state) so it streams inside the
 * RSC detail page. Every branch renders trusted React nodes — NEVER
 * `dangerouslySetInnerHTML`. React escapes all text content by default,
 * so author-entered strings can't inject markup. The only "active" block
 * types (video iframes, CTA / image links) are hardened:
 *   - `video`  → only youtube / vimeo URLs are converted to an embed; any
 *                other host is dropped entirely.
 *   - `cta`    → the href is only emitted when it starts with `/` or
 *                `https://` (no `javascript:`, `data:`, protocol-relative…).
 *
 * The switch is exhaustive over `BlogBlock['type']`; the `default` branch's
 * `never` assignment makes a missing case a compile error if the union grows.
 */
export function BlockRenderer({ blocks }: { blocks: BlogBlock[] }) {
  if (!Array.isArray(blocks) || blocks.length === 0) return null;
  return (
    <div className="sc-blog-body flex flex-col gap-7">
      {blocks.map((block) => (
        <BlockView key={block.id} block={block} />
      ))}
    </div>
  );
}

function BlockView({ block }: { block: BlogBlock }) {
  switch (block.type) {
    case "heading": {
      const text = block.content?.trim();
      if (!text) return null;
      const className =
        "sc-serif text-[var(--sc-black)] " +
        (block.level === 3
          ? "text-[1.35rem] sm:text-[1.55rem] leading-[1.25] mt-4"
          : "text-[1.7rem] sm:text-[2rem] leading-[1.2] mt-6");
      return block.level === 3 ? (
        <h3 className={className}>{text}</h3>
      ) : (
        <h2 className={className}>{text}</h2>
      );
    }

    case "paragraph": {
      const text = block.content?.trim();
      if (!text) return null;
      // `whitespace-pre-line` preserves author line breaks without any HTML.
      return (
        <p className="whitespace-pre-line text-[1.05rem] leading-[1.85] text-[var(--sc-text-mid)]">
          {text}
        </p>
      );
    }

    case "image": {
      const src = resolveBlogMediaUrl(block.url);
      if (!src) return null;
      const hasDims = !!block.width && !!block.height;
      return (
        <figure className="my-2">
          <span className="block overflow-hidden rounded-lg bg-[var(--sc-grey)]">
            {hasDims ? (
              <Image
                src={src}
                alt={block.alt ?? ""}
                width={block.width as number}
                height={block.height as number}
                unoptimized
                loading="lazy"
                sizes="(min-width: 768px) 760px, 100vw"
                className="h-auto w-full object-cover"
              />
            ) : (
              // Unknown intrinsic size — use a fixed-ratio fill box so the
              // layout reserves space and avoids CLS even without w/h.
              <span className="relative block aspect-[16/9] w-full">
                <Image
                  src={src}
                  alt={block.alt ?? ""}
                  fill
                  unoptimized
                  loading="lazy"
                  sizes="(min-width: 768px) 760px, 100vw"
                  className="object-cover"
                />
              </span>
            )}
          </span>
          {block.caption ? (
            <figcaption className="mt-2 text-center text-[0.82rem] italic text-[var(--sc-mid-grey)]">
              {block.caption}
            </figcaption>
          ) : null}
        </figure>
      );
    }

    case "gallery": {
      const images: { src: string; alt?: string; key: string }[] = [];
      for (const [i, img] of (block.images ?? []).entries()) {
        const src = resolveBlogMediaUrl(img.url);
        if (!src) continue;
        images.push({ src, alt: img.alt, key: `${img.imageId ?? img.url}-${i}` });
      }
      if (images.length === 0) return null;
      return (
        <div className="my-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((img) => (
            <span
              key={img.key}
              className="relative block aspect-square overflow-hidden rounded-lg bg-[var(--sc-grey)]"
            >
              <Image
                src={img.src}
                alt={img.alt ?? ""}
                fill
                unoptimized
                loading="lazy"
                sizes="(min-width: 640px) 240px, 50vw"
                className="object-cover"
              />
            </span>
          ))}
        </div>
      );
    }

    case "video": {
      const embed = toVideoEmbedUrl(block.url);
      if (!embed) return null; // not youtube/vimeo → drop entirely
      return (
        <div className="relative my-2 aspect-video w-full overflow-hidden rounded-lg bg-[var(--sc-black)]">
          <iframe
            src={embed}
            title="Embedded video"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 h-full w-full border-0"
          />
        </div>
      );
    }

    case "quote": {
      const text = block.content?.trim();
      if (!text) return null;
      return (
        <blockquote className="my-2 border-l-2 border-[var(--sc-sun)] pl-5 sm:pl-6">
          <p className="sc-serif text-[1.25rem] leading-[1.5] text-[var(--sc-black)]">
            {text}
          </p>
          {block.cite ? (
            <cite className="mt-2 block text-[0.82rem] not-italic uppercase tracking-[0.16em] text-[var(--sc-mid-grey)]">
              {block.cite}
            </cite>
          ) : null}
        </blockquote>
      );
    }

    case "cta": {
      const href = safeHref(block.url);
      const label = block.label?.trim();
      if (!href || !label) return null;
      const external = href.startsWith("https://");
      return (
        <div className="my-2">
          <a
            href={href}
            {...(external
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
            className="sc-serif inline-flex min-h-12 items-center justify-center gap-2 bg-[var(--sc-black)] px-6 py-3 text-[0.66rem] font-bold uppercase tracking-[0.18em] text-[var(--sc-white)] no-underline transition-colors hover:bg-[rgba(25,25,25,0.85)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-sun)]"
          >
            {label}
          </a>
        </div>
      );
    }

    case "divider":
      return <hr className="my-4 border-0 border-t border-[var(--sc-grey)]" />;

    default: {
      // Exhaustiveness guard — a new block type without a case fails the build.
      const _exhaustive: never = block;
      return _exhaustive ?? null;
    }
  }
}

/**
 * Convert a YouTube / Vimeo *watch* URL into an embeddable iframe `src`.
 * Returns `null` for any other host or an unparseable URL, so the renderer
 * never embeds an arbitrary third-party page.
 */
function toVideoEmbedUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  // ── YouTube ──────────────────────────────────────────────
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = url.searchParams.get("v");
    if (id && /^[\w-]{6,}$/.test(id)) {
      return `https://www.youtube-nocookie.com/embed/${id}`;
    }
    // /embed/<id> or /shorts/<id> forms
    const m = url.pathname.match(/^\/(?:embed|shorts)\/([\w-]{6,})/);
    if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
    return null;
  }
  if (host === "youtu.be") {
    const id = url.pathname.replace(/^\//, "").split("/")[0];
    if (id && /^[\w-]{6,}$/.test(id)) {
      return `https://www.youtube-nocookie.com/embed/${id}`;
    }
    return null;
  }

  // ── Vimeo ────────────────────────────────────────────────
  if (host === "vimeo.com") {
    const id = url.pathname.replace(/^\//, "").split("/")[0];
    if (id && /^\d+$/.test(id)) {
      return `https://player.vimeo.com/video/${id}`;
    }
    return null;
  }
  if (host === "player.vimeo.com") {
    const m = url.pathname.match(/^\/video\/(\d+)/);
    if (m) return `https://player.vimeo.com/video/${m[1]}`;
    return null;
  }

  return null;
}

/**
 * Allow only same-origin (`/...`) or explicit `https://` links. Everything
 * else (`javascript:`, `data:`, `http://`, protocol-relative `//evil`) is
 * rejected.
 */
function safeHref(raw: string | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (value.startsWith("//")) return null;
  if (value.startsWith("/") || value.startsWith("https://")) return value;
  return null;
}

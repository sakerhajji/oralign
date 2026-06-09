/**
 * Centered eyebrow + title + optional subtitle. Shared by the practitioner
 * sections (contrast, workflow, platform, packs) so their headers stay
 * pixel-identical. Purely presentational — no client APIs.
 */
export function SectionIntro({
  eyebrow,
  title,
  subtitle,
  id,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  id: string;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="sc-subhead text-[0.66rem] text-[var(--sc-sun-deep)]">
        {eyebrow}
      </p>
      <h2
        id={id}
        className="sc-serif mt-4 text-[clamp(2rem,4vw,4.6rem)] leading-[1.04]"
      >
        {title}
      </h2>
      {subtitle ? (
        <p className="mx-auto mt-5 max-w-2xl text-[0.98rem] leading-7 text-[var(--sc-text-mid)] sm:text-[1.04rem]">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

type GuideSectionHeadingProps = {
  number: string;
  eyebrow: string;
  title: string;
  emphasis: string;
};

export function GuideSectionHeading({
  number,
  eyebrow,
  title,
  emphasis,
}: GuideSectionHeadingProps) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-3 text-[0.58rem] uppercase tracking-[0.34em] text-[var(--sc-text-mid)]">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--sc-sun)] text-[0.62rem] font-medium text-[var(--sc-black)]">
          {number}
        </span>
        <span>{eyebrow}</span>
      </div>

      <h2 className="sc-serif text-balance text-[clamp(2rem,4vw,3.3rem)] leading-[1.12] text-[var(--sc-black)]">
        {title}
        <br />
        <em className="font-normal not-italic text-[var(--sc-black)]">
          {emphasis}
        </em>
      </h2>

      <div
        aria-hidden="true"
        className="mt-6 h-px w-10 bg-[var(--sc-grey)]"
      />
    </div>
  );
}

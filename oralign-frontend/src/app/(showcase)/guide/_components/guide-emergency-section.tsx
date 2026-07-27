import { Mail, Phone, Zap } from "lucide-react";
import type { GuideCopy } from "./guide-copy";

type GuideEmergencySectionProps = {
  emergency: GuideCopy["emergency"];
};

export function GuideEmergencySection({
  emergency,
}: GuideEmergencySectionProps) {
  return (
    <section
      data-section-tone="light"
      className="bg-[var(--sc-white)] px-5 py-10 text-[var(--sc-black)] sm:px-8 lg:px-12"
    >
      <div className="mx-auto max-w-[960px]">
        <div className="grid gap-6 bg-[var(--sc-black)] p-7 text-[var(--sc-white)] shadow-[0_22px_70px_rgba(25,25,25,0.16)] sm:grid-cols-[auto_1fr] sm:p-10">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--sc-sun)] text-[var(--sc-black)]">
            <Zap className="h-6 w-6" aria-hidden="true" />
          </span>

          <div>
            <h2 className="sc-serif text-[1.35rem] leading-tight">
              {emergency.title}
            </h2>
            <p className="mt-3 max-w-[720px] text-[0.9rem] leading-7 text-[var(--sc-text-mid-on-dark)]">
              {emergency.body}
            </p>

            <div className="mt-5 flex flex-col gap-3 text-[0.84rem] sm:flex-row sm:flex-wrap sm:items-center">
              <a
                href={`tel:${emergency.phone.replace(/\s/g, "")}`}
                className="inline-flex items-center gap-2 text-[var(--sc-sun)] no-underline hover:underline"
              >
                <Phone className="h-4 w-4" aria-hidden="true" />
                {emergency.phone}
              </a>
              <a
                href={`mailto:${emergency.email}`}
                className="inline-flex items-center gap-2 text-[var(--sc-sun)] no-underline hover:underline"
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                {emergency.email}
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

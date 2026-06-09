"use client";

import { MonitorCheck, PackageCheck, ScanLine, type LucideIcon } from "lucide-react";
import { useShowcaseLang } from "../../_lib/i18n/lang-context";
import { practitionerCopy, type StepItem } from "./copy";
import { Reveal } from "../shared/reveal";
import { SectionIntro } from "./section-intro";

const workflowIcons = [ScanLine, MonitorCheck, PackageCheck] as const;

/** Three-step adoption workflow. */
export function WorkflowSection() {
  const { lang } = useShowcaseLang();
  const copy = practitionerCopy[lang].workflow;
  return (
    <section
      id="workflow"
      data-section-tone="light"
      aria-labelledby="workflow-title"
      className="bg-[rgba(25,25,25,0.025)] px-4 py-20 text-[var(--sc-black)] sm:px-6 sm:py-24 lg:px-12"
    >
      <div className="mx-auto max-w-[1240px]">
        <Reveal>
          <SectionIntro
            eyebrow={copy.eyebrow}
            title={copy.title}
            subtitle={copy.subtitle}
            id="workflow-title"
          />
        </Reveal>
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {copy.steps.map((step, index) => (
            <WorkflowCard
              key={step.title}
              step={step}
              number={index + 1}
              icon={workflowIcons[index] ?? ScanLine}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function WorkflowCard({
  step,
  number,
  icon: Icon,
}: {
  step: StepItem;
  number: number;
  icon: LucideIcon;
}) {
  return (
    <Reveal delay={number > 1}>
      <article className="relative h-full overflow-hidden border border-[rgba(25,25,25,0.10)] bg-white/55 p-7 shadow-[0_18px_55px_-48px_rgba(25,25,25,0.45)] sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <span className="sc-serif text-6xl leading-none text-[rgba(201,154,11,0.50)]">
            {number}
          </span>
          <span className="inline-flex h-12 w-12 items-center justify-center border border-[rgba(201,154,11,0.22)] bg-[var(--sc-sun-3)] text-[var(--sc-sun-deep)]">
            <Icon aria-hidden="true" size={23} strokeWidth={1.55} />
          </span>
        </div>
        <h3 className="sc-serif mt-9 text-2xl">{step.title}</h3>
        <p className="mt-4 text-[0.96rem] leading-7 text-[var(--sc-text-mid)]">
          {step.body}
        </p>
      </article>
    </Reveal>
  );
}

"use client";

import Image from "next/image";
import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { Reveal } from "./shared/reveal";
import { SectionHeading } from "./shared/section-heading";

const stepImagePaths = [
  "/showcase/Consultationsourire.png",
  "/showcase/Scan3D.png",
  "/showcase/futurSourire.png",
  "/showcase/Portez.png",
  "/showcase/Sourire.png",
];

export function HowItWorks() {
  const { lang } = useShowcaseLang();

  return (
    <section
      id="how-it-works"
      data-section-tone="light"
      aria-labelledby="how-h2"
      className="
        relative isolate overflow-hidden bg-[var(--sc-white)]
        px-5 py-24 sm:px-8 sm:py-28 lg:px-12 lg:py-32
      "
    >
      {/* Soft background atmosphere */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(circle at 18% 12%, rgba(254,202,22,0.12), transparent 28%), radial-gradient(circle at 86% 74%, rgba(254,202,22,0.09), transparent 30%), linear-gradient(to bottom, rgba(17,17,17,0.025), transparent 34%, rgba(17,17,17,0.03))",
        }}
      />

      {/* Very subtle circle guideline pattern */}
      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute left-1/2 top-[46%] z-0
          h-[540px] w-[540px] -translate-x-1/2 -translate-y-1/2
          opacity-[0.055]
          sm:h-[720px] sm:w-[720px]
          lg:h-[920px] lg:w-[920px]
        "
        style={{
          background:
            "repeating-radial-gradient(circle, transparent 0, transparent 72px, var(--sc-black) 73px, transparent 74px)",
        }}
      />

      <div className="relative z-[2] mx-auto max-w-[1400px]">
        <Reveal>
          <div className="mx-auto max-w-3xl text-center">
            <SectionHeading
              eyebrow={dict.how.eyebrow[lang]}
              tone="light"
              align="center"
              id="how-h2"
            >
              {dict.how.h2Part1[lang]}{" "}
              <em
                style={{
                  fontStyle: "italic",
                  color: "var(--sc-sun)",
                }}
              >
                {dict.how.h2Em[lang]}
              </em>
            </SectionHeading>
          </div>
        </Reveal>

        <Reveal delay>
          <div className="relative mt-16 sm:mt-20 lg:mt-24">
            {/* Desktop timeline line */}
            <div
              aria-hidden="true"
              className="
                absolute left-0 right-0 top-[178px] hidden h-px
                bg-gradient-to-r from-transparent via-[rgba(17,17,17,0.18)] to-transparent
                lg:block
              "
            />

            <ol
              className="
                relative grid list-none grid-cols-1 gap-6
                sm:grid-cols-2 sm:gap-8
                lg:grid-cols-5 lg:gap-5
              "
            >
              {dict.how.steps.map((step, i) => {
                const isEven = i % 2 === 0;

                return (
                  <li
                    key={i}
                    className={`
                      group relative flex min-h-full flex-col
                      ${isEven ? "lg:pt-0" : "lg:pt-12"}
                    `}
                  >
                    <article
                      className="
                        relative flex h-full flex-col overflow-hidden rounded-none
                        border border-[rgba(17,17,17,0.08)]
                        bg-[rgba(255,255,255,0.72)] p-3
                        shadow-[0_22px_80px_rgba(17,17,17,0.07)]
                        backdrop-blur-xl transition-all duration-500
                        hover:-translate-y-2 hover:border-[rgba(254,202,22,0.45)]
                        hover:shadow-[0_32px_100px_rgba(17,17,17,0.12)]
                      "
                    >
                      {/* Image block */}
                      <div
                        className="
                          relative aspect-[4/3] overflow-hidden rounded-none
                          bg-[rgba(254,202,22,0.08)]
                        "
                      >
                        <Image
                          src={stepImagePaths[i]}
                          alt={step[lang]}
                          fill
                          sizes="
                            (max-width: 640px) 100vw,
                            (max-width: 1024px) 50vw,
                            20vw
                          "
                          className="
                            object-cover transition-transform duration-700
                            group-hover:scale-105
                          "
                        />

                        <div
                          aria-hidden="true"
                          className="absolute inset-0"
                          style={{
                            background:
                              "linear-gradient(to bottom, transparent 34%, rgba(5,5,5,0.3))",
                          }}
                        />

                        {/* Step number */}
                        <div
                          className="
                            absolute bottom-4 left-4 flex h-12 w-12 items-center
                            justify-center rounded-none
                            border border-[rgba(255,255,255,0.28)]
                            text-[0.8rem] font-semibold tracking-[0.12em]
                            shadow-[0_16px_40px_rgba(0,0,0,0.18)]
                            backdrop-blur-md
                          "
                          style={{
                            background: "var(--sc-sun)",
                            color: "var(--sc-black)",
                            fontFamily:
                              "var(--font-sc-serif, 'Playfair Display', serif)",
                          }}
                        >
                          {String(i + 1).padStart(2, "0")}
                        </div>

                        {/* Small decorative dot */}
                        <div
                          aria-hidden="true"
                          className="
                            absolute right-4 top-4 h-2.5 w-2.5 rounded-none
                            bg-[var(--sc-sun)] opacity-80
                            shadow-[0_0_26px_rgba(254,202,22,0.75)]
                          "
                        />
                      </div>

                      {/* Content */}
                      <div className="flex flex-1 flex-col px-2 pb-4 pt-6">
                        <div className="mb-4 flex items-center gap-3">
                          <span
                            aria-hidden="true"
                            className="h-px w-8 bg-[var(--sc-sun)]"
                          />
                          <span
                            className="
                              text-[0.58rem] uppercase tracking-[0.32em]
                            "
                            style={{ color: "var(--sc-text-mid)" }}
                          >
                            Step {String(i + 1).padStart(2, "0")}
                          </span>
                        </div>

                        <h3
                          className="
                            sc-serif mb-3 text-[1.18rem] font-normal
                            leading-tight tracking-[-0.02em]
                            text-[var(--sc-black)]
                            sm:text-[1.28rem]
                            lg:text-[1.08rem]
                            xl:text-[1.2rem]
                          "
                        >
                          {step[lang]}
                        </h3>

                        <p
                          className="
                            max-w-[32rem] text-[0.88rem] leading-[1.75]
                            lg:text-[0.8rem] xl:text-[0.86rem]
                          "
                          style={{ color: "var(--sc-text-mid)" }}
                        >
                          {dict.how.stepDescs[i][lang]}
                        </p>
                      </div>
                    </article>

                    {/* Mobile/tablet connector */}
                    {i < dict.how.steps.length - 1 && (
                      <div
                        aria-hidden="true"
                        className="
                          mx-auto my-2 h-10 w-px
                          bg-gradient-to-b from-[rgba(254,202,22,0.7)] to-transparent
                          lg:hidden
                        "
                      />
                    )}

                    {/* Desktop connector dot */}
                    <div
                      aria-hidden="true"
                      className="
                        absolute left-1/2 top-[172px] z-10 hidden h-3 w-3
                        -translate-x-1/2 rounded-none bg-[var(--sc-sun)]
                        shadow-[0_0_30px_rgba(254,202,22,0.65)]
                        lg:block
                      "
                    />
                  </li>
                );
              })}
            </ol>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

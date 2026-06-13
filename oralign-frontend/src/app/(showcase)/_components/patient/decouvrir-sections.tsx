"use client";

import { ShowcaseSection } from "../showcase-section";
import { DailyLifeSection } from "./decouvrir/daily-life-section";
import { GuidePreviewSection } from "./decouvrir/guide-preview-section";
import { OralignHeroSection } from "./decouvrir/hero-section";
import { PrecisionSection } from "./decouvrir/precision-section";
import { SmileFreedomSection } from "./decouvrir/smile-freedom-section";
import { TreatmentDurationSection } from "./decouvrir/treatment-duration-section";
import { WearAlignersSection } from "./decouvrir/wear-aligners-section";

export {
  DailyLifeSection,
  GuidePreviewSection,
  OralignHeroSection,
  PrecisionSection,
  SmileFreedomSection,
  TreatmentDurationSection,
  WearAlignersSection,
};

/**
 * Backwards-compatible composition for callers that still expect the
 * original grouped section export.
 */
export function OralignSection() {
  return (
    <>
      <OralignHeroSection />
      <SmileFreedomSection />
      <DailyLifeSection />
      <GuidePreviewSection />
      <PrecisionSection />
      <TreatmentDurationSection />
      <WearAlignersSection />
    </>
  );
}

export function OralignPrimeSection() {
  return (
    <ShowcaseSection
      id="oralign-prime"
      titleKey="oralignPrime"
      tone="tinted"
      flip
      fullScreen
    />
  );
}

export function ParcoursSection() {
  return <ShowcaseSection id="parcours" titleKey="howItWorks" fullScreen />;
}

export function PraticiensSection() {
  return (
    <ShowcaseSection
      id="praticiens"
      titleKey="findPractitioner"
      tone="tinted"
      flip
      fullScreen
    />
  );
}

"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  Infinity as InfinityIcon,
  MessageCircle,
  MonitorCheck,
  PackageCheck,
  ScanLine,
  ShieldCheck,
  Timer,
  Truck,
  UsersRound,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { ArchType } from "@/lib/types";
import { usePublicPacks } from "@/lib/hooks";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import type { Lang } from "../_lib/i18n/dict";
import { NoiseGrain } from "./shared/noise-grain";
import { Reveal } from "./shared/reveal";

/**
 * Practitioner landing page. Visual vocabulary mirrors the patient
 * Hero: amber accents on Midnight Ink, eyebrow + hairline, big serif
 * headline with an italic accent in the brand sun, dual primary +
 * ghost CTAs, film-grain texture.
 *
 * The hero is intentionally typography-only — the previous 3D-dashboard
 * graphic was visually busy and pulled the eye away from the value
 * proposition. The platform preview now lives further down the page
 * where it has room to breathe.
 *
 * Copy strategy:
 *   • Lead with the outcome (time + focus), not the feature.
 *   • Specific numbers everywhere ("48–72h", "0 equipment", "1 click").
 *   • Reduce-risk framing on the CTA ("free account", "no commitment").
 *   • Clinical credibility cues (CBCT, biomechanics, torque) — every
 *     pack is sold to every practitioner; the old "ortho-only" gate
 *     on PRO / PRO+ was retired with the new business plan.
 */

type ListItem = { title?: string; body: string };
type StepItem = { title: string; body: string };
type PlatformItem = { title: string; body: string };
type StatItem = { value: string; label: string };

/**
 * Public mirror of the admin packs catalogue. Mirrors the data shape
 * of `Pack` + `PackPrice` from the backend: max steps per arch,
 * included corrections, unlimited flags, ortho-only flag, and the two
 * arch prices.
 *
 * We hard-code the launch catalogue here rather than fetching from
 * `/api/admin/packs` because:
 *   • The pack endpoint is admin-gated; exposing it publicly would
 *     leak the internal admin DTO unnecessarily.
 *   • This is marketing copy — it should render even when the DB
 *     is unreachable (CDN/edge cache, build-time SSG).
 *   • The seeded catalogue is the canonical launch set; new packs
 *     ship through a deploy anyway.
 * If the catalogue ever needs to change without a redeploy, we add a
 * public `GET /api/packs/public` route and swap the array for a
 * `usePublicPacks()` hook. Until then, keep them here.
 */
interface PackOffering {
  name: string;
  tagline: { fr: string; en: string; ar: string };
  /** `null` ⇒ unlimited. */
  maxStepsPerArch: number | null;
  /** `null` ⇒ unlimited. */
  includedCorrections: number | null;
  /** `null` when the pack is two-arches-only (PRO / PRO+). */
  singleArchPrice: number | null;
  twoArchesPrice: number;
  currency: string;
  /** Visually accents this pack as the recommended choice. */
  featured?: boolean;
}

// Per-pack marketing taglines, keyed by the pack name returned by the
// public backend endpoint. The DB carries a short English `description`
// the admin can edit, but the showcase needs language-aware copy + we
// don't want to add 3 description columns to Prisma just for marketing.
// When a pack name isn't in this map, the renderer falls back to the
// backend `description`.
const PACK_TAGLINES: Record<string, { fr: string; en: string; ar: string }> = {
  LITE: {
    fr: "Cas courts, retouches esthétiques.",
    en: "Short cases, aesthetic touch-ups.",
    ar: "حالات قصيرة ولمسات جمالية.",
  },
  ESSENTIAL: {
    fr: "Cas légers et corrections du quotidien.",
    en: "Light cases and everyday corrections.",
    ar: "حالات خفيفة وتصحيحات يومية.",
  },
  SMART: {
    fr: "Cas modérés, le choix le plus polyvalent.",
    en: "Moderate cases — the most versatile choice.",
    ar: "حالات متوسطة، الخيار الأكثر تنوّعًا.",
  },
  PRO: {
    fr: "Cas complexes — deux arcades en standard.",
    en: "Complex cases — two arches as standard.",
    ar: "حالات معقّدة — فكّان قياسي.",
  },
  "PRO+": {
    fr: "Sans limite — cas exceptionnels, refinements illimités.",
    en: "No limit — exceptional cases, unlimited refinements.",
    ar: "بلا حدود — حالات استثنائية وتعديلات غير محدودة.",
  },
};

// Featured pack — visual emphasis on the showcase. Picked here rather
// than on the backend because "most chosen" is a marketing decision,
// not a clinical one. Falls back to the middle pack if SMART isn't in
// the catalogue any more.
const FEATURED_PACK_NAME = "SMART";

const practitionerCopy: Record<
  Lang,
  {
    hero: {
      eyebrow: string;
      titleStart: string;
      titleEm: string;
      titleEnd: string;
      subtitle: string;
      primary: string;
      secondary: string;
      micro: string;
      stats: StatItem[];
    };
    contrast: {
      eyebrow: string;
      title: string;
      beforeTitle: string;
      withTitle: string;
      before: string[];
      with: string[];
    };
    workflow: {
      eyebrow: string;
      title: string;
      subtitle: string;
      steps: StepItem[];
    };
    clinical: {
      eyebrow: string;
      title: string;
      body: string;
      points: ListItem[];
    };
    platform: {
      eyebrow: string;
      title: string;
      subtitle: string;
      cards: PlatformItem[];
    };
    packs: {
      eyebrow: string;
      title: string;
      subtitle: string;
      labels: {
        stepsLine: (count: number | null) => string;
        correctionsLine: (count: number | null) => string;
        /** Headline benefit shown on every card. */
        installmentsLine: string;
        /** Tag-line for PRO / PRO+ (two-arches only). */
        twoArchesOnly: string;
        /** Tag-line for LITE / ESSENTIAL / SMART. */
        oneOrTwoArches: string;
        featured: string;
        cta: string;
        /** Reassuring footer banner under the 5-pack grid. */
        footer: string;
      };
    };
    cta: {
      eyebrow: string;
      title: string;
      text: string;
      primary: string;
      secondary: string;
    };
  }
> = {
  fr: {
    hero: {
      eyebrow: "Plateforme clinique ORALIGN",
      titleStart: "Vous scannez.",
      titleEm: "ORALIGN gère le reste.",
      titleEnd: "",
      subtitle:
        "Pilotez tous vos cas d'aligneurs sur une plateforme 100 % digitale — du scan à la livraison au cabinet. Zéro logistique. Zéro équipement à acheter.",
      primary: "Créer mon compte gratuit",
      secondary: "Voir le workflow",
      micro: "Compatible avec TRIOS · iTero · Medit · 3Shape — aucun adaptateur requis.",
      stats: [
        { value: "48–72 h", label: "Plan 3D prêt à valider" },
        { value: "0 €", label: "Équipement à acheter" },
        { value: "100 %", label: "Suivi digital, en temps réel" },
      ],
    },
    contrast: {
      eyebrow: "Avant / Après",
      title: "Passez d'un suivi dispersé à un espace clinique unique.",
      beforeTitle: "Avant ORALIGN",
      withTitle: "Avec ORALIGN",
      before: [
        "Fichiers STL éparpillés entre WhatsApp, e-mails et clés USB.",
        "Aucune visibilité sur la fabrication. On appelle, on attend.",
        "Risques cliniques cachés, validations qui dérivent.",
        "Stress logistique : qui livre quoi, à quel cabinet, quand ?",
      ],
      with: [
        "Un espace sécurisé, un cas = un dossier. Tout est traçable.",
        "Suivi en direct : reçu · à valider · en fabrication · expédié.",
        "Plan 3D conforme à la biomécanique, validé par le praticien.",
        "Box livrée au cabinet, prête à l'emploi. Vous insérez. Point.",
      ],
    },
    workflow: {
      eyebrow: "Adoption en 1 séance",
      title: "Un workflow simple en 3 étapes.",
      subtitle:
        "Pas de formation longue. Pas de matériel à installer. Vos cas existants gardent leur historique.",
      steps: [
        {
          title: "Scannez & envoyez",
          body:
            "Glissez-déposez vos STL en un clic. Photos, CBCT, notes cliniques : tout reste attaché au dossier.",
        },
        {
          title: "Validez en 3D",
          body:
            "Plan biomécanique prêt sous 48 à 72 h. Validez ou demandez une révision sans coût supplémentaire.",
        },
        {
          title: "Livrez le patient",
          body:
            "La box ORALIGN arrive au cabinet — gouttières numérotées, prêtes à l'insertion. Aucune manipulation.",
        },
      ],
    },
    clinical: {
      eyebrow: "Excellence clinique",
      title: "Une planification dictée par la biomécanique.",
      body:
        "Chaque cas est lu cliniquement avant le numérique : limites biologiques respectées, intégration CBCT, contrôle strict des forces. Vous gardez le dernier mot à chaque étape.",
      points: [
        {
          title: "CBCT-aware",
          body:
            "Racines, corticales, sinus : analysés avant tout déplacement. Vous décidez, l'algorithme exécute.",
        },
        {
          title: "Torque & rotations contrôlés",
          body:
            "Mouvements séquencés pour éviter les pertes d'ancrage et les rotations approximatives.",
        },
        {
          title: "Moins de refinements",
          body:
            "Séquençage anticipé et over-correction calibrée. Vous traitez plus vite, sans repasser deux fois.",
        },
      ],
    },
    platform: {
      eyebrow: "Plateforme tout-en-un",
      title: "Chaque cas avance avec un statut clair.",
      subtitle: "Construite par des praticiens pour des praticiens. Pas de gadget.",
      cards: [
        {
          title: "Chat technique par cas",
          body:
            "Échangez directement avec nos concepteurs sur le dossier — fini les fils WhatsApp éparpillés.",
        },
        {
          title: "Suivi de production",
          body:
            "Reçu · validé · en fabrication · expédié. Statut visible à toute heure depuis votre dashboard.",
        },
        {
          title: "Espace patient inclus",
          body:
            "Vos patients suivent leur traitement depuis un lien sécurisé. Adhérence et satisfaction en hausse.",
        },
      ],
    },
    packs: {
      eyebrow: "Une offre par indication",
      title: "Choisissez le pack adapté à votre cas.",
      subtitle:
        "Cinq packs couvrent l'ensemble des indications cliniques — du retour de retainer aux cas complexes en orthodontie. Tarif communiqué sur demande, et paiement échelonné disponible sur chaque cas.",
      labels: {
        stepsLine: (count) =>
          count == null
            ? "Pas illimités"
            : `Jusqu'à ${count} pas`,
        correctionsLine: (count) =>
          count == null
            ? "Refinements illimités inclus"
            : `${count} ${count === 1 ? "refinement inclus" : "refinements inclus"}`,
        installmentsLine: "Paiement en 2 ou 3 fois sans frais",
        twoArchesOnly: "Deux arcades uniquement",
        oneOrTwoArches: "Une ou deux arcades",
        featured: "Le plus choisi",
        cta: "Demander un devis",
        footer:
          "Tous les packs sont éligibles au paiement échelonné. Le plan de tranches est défini avec vous lors de la création du devis.",
      },
    },
    cta: {
      eyebrow: "Testez sans risque",
      title: "Envoyez votre cas le plus complexe.",
      text:
        "L'accès à la plateforme est gratuit. Le plan 3D est sans engagement. Vous ne payez que si vous validez la fabrication.",
      primary: "Créer mon compte",
      secondary: "Parler à un commercial",
    },
  },
  en: {
    hero: {
      eyebrow: "ORALIGN clinical platform",
      titleStart: "You scan.",
      titleEm: "ORALIGN handles the rest.",
      titleEnd: "",
      subtitle:
        "Drive every aligner case on a fully digital platform — from scan to chairside delivery. Zero logistics. No equipment to buy.",
      primary: "Create my free account",
      secondary: "See the workflow",
      micro: "Compatible with TRIOS · iTero · Medit · 3Shape — no adapter required.",
      stats: [
        { value: "48–72 h", label: "3D plan ready to review" },
        { value: "$0", label: "Equipment to purchase" },
        { value: "100 %", label: "Digital tracking, in real time" },
      ],
    },
    contrast: {
      eyebrow: "Before / After",
      title: "Move from scattered follow-up to one clinical workspace.",
      beforeTitle: "Before ORALIGN",
      withTitle: "With ORALIGN",
      before: [
        "STL files scattered across WhatsApp, e-mails and USB sticks.",
        "Zero visibility on manufacturing. You call, you wait.",
        "Hidden clinical risks, approvals that drift.",
        "Logistics stress: who delivers what, to which practice, when?",
      ],
      with: [
        "One secure workspace, one case = one file. Fully traceable.",
        "Live tracking: received · waiting for approval · in production · shipped.",
        "Biomechanically-sound 3D plan, validated by you.",
        "Box delivered to your practice, ready to fit. You insert. Done.",
      ],
    },
    workflow: {
      eyebrow: "Onboard in one session",
      title: "A simple 3-step workflow.",
      subtitle:
        "No long training. No hardware to install. Your existing cases keep their history.",
      steps: [
        {
          title: "Scan & send",
          body:
            "Drag-drop your STL files in one click. Photos, CBCT, clinical notes — all attached to the case.",
        },
        {
          title: "Review in 3D",
          body:
            "Biomechanical plan ready within 48–72 h. Approve, or request a revision at no extra cost.",
        },
        {
          title: "Deliver to the patient",
          body:
            "The ORALIGN box arrives at your practice — numbered aligners, ready to seat. Zero handling.",
        },
      ],
    },
    clinical: {
      eyebrow: "Clinical excellence",
      title: "Planning guided by biomechanics.",
      body:
        "Every case is read clinically before going digital: biological limits respected, CBCT integration, strict force control. You stay in the loop at every key step.",
      points: [
        {
          title: "CBCT-aware",
          body:
            "Roots, cortical bone, sinuses — analysed before any tooth moves. You decide, the system executes.",
        },
        {
          title: "Controlled torque & rotations",
          body:
            "Movements sequenced to avoid anchorage loss and lazy rotations.",
        },
        {
          title: "Fewer refinements",
          body:
            "Anticipated sequencing and calibrated over-correction. You treat faster — without a second round.",
        },
      ],
    },
    platform: {
      eyebrow: "All-in-one platform",
      title: "Every case moves forward with a clear status.",
      subtitle: "Built by clinicians for clinicians. No gimmicks.",
      cards: [
        {
          title: "Case-level technical chat",
          body:
            "Talk directly with our designers on each file — no more scattered WhatsApp threads.",
        },
        {
          title: "Production tracking",
          body:
            "Received · approved · in production · shipped. Live status from your dashboard, any time.",
        },
        {
          title: "Patient portal included",
          body:
            "Your patients track their treatment through a secure link. Higher adherence, better satisfaction.",
        },
      ],
    },
    packs: {
      eyebrow: "One pack per indication",
      title: "Pick the pack that fits the case.",
      subtitle:
        "Five packs cover every clinical indication — from retainer touch-ups to complex orthodontic cases. Pricing on request, and every case can be split into installments.",
      labels: {
        stepsLine: (count) =>
          count == null
            ? "Unlimited steps"
            : `Up to ${count} steps`,
        correctionsLine: (count) =>
          count == null
            ? "Unlimited refinements included"
            : `${count} ${count === 1 ? "refinement included" : "refinements included"}`,
        installmentsLine: "Pay in 2 or 3 installments, no extra fee",
        twoArchesOnly: "Two arches only",
        oneOrTwoArches: "Single or two arches",
        featured: "Most chosen",
        cta: "Request a quote",
        footer:
          "Every pack ships with installment payment available. The exact schedule is set with you when the quote is issued.",
      },
    },
    cta: {
      eyebrow: "Risk-free trial",
      title: "Send us your hardest case.",
      text:
        "Platform access is free. The 3D plan is commitment-free. You only pay if you approve manufacturing.",
      primary: "Create my account",
      secondary: "Talk to sales",
    },
  },
  ar: {
    hero: {
      eyebrow: "منصة ORALIGN السريرية",
      titleStart: "أنت تقوم بالمسح.",
      titleEm: "ORALIGN يتولّى الباقي.",
      titleEnd: "",
      subtitle:
        "أدر كل حالات التقويم الشفاف عبر منصة رقمية بالكامل — من المسح إلى التسليم في العيادة. لا لوجستيك. لا معدات للشراء.",
      primary: "أنشئ حسابك المجاني",
      secondary: "شاهد سير العمل",
      micro: "متوافق مع TRIOS و iTero و Medit و 3Shape — بدون أي محوّل.",
      stats: [
        { value: "48–72 س", label: "خطة 3D جاهزة للمراجعة" },
        { value: "0", label: "معدات للشراء" },
        { value: "100 %", label: "متابعة رقمية لحظية" },
      ],
    },
    contrast: {
      eyebrow: "قبل / بعد",
      title: "انتقل من متابعة مشتّتة إلى مساحة سريرية واحدة.",
      beforeTitle: "قبل ORALIGN",
      withTitle: "مع ORALIGN",
      before: [
        "ملفات STL ضائعة بين واتساب والإيميل ووحدات USB.",
        "لا رؤية للإنتاج. تتصل ثم تنتظر.",
        "مخاطر سريرية مخفية، ومصادقات تتأخر.",
        "ضغط لوجستي: من يسلّم ماذا، لأي عيادة، ومتى؟",
      ],
      with: [
        "مساحة آمنة، كل حالة في ملف واحد. تتبّع كامل.",
        "متابعة لحظية: مستلم · بانتظار المصادقة · قيد التصنيع · مُرسل.",
        "خطة 3D متوافقة مع الميكانيكا الحيوية، يصادق عليها الطبيب.",
        "العلبة تصل إلى العيادة جاهزة. تُركّبها وانتهى.",
      ],
    },
    workflow: {
      eyebrow: "اعتماد في جلسة واحدة",
      title: "سير عمل بسيط في 3 خطوات.",
      subtitle: "بدون تدريب طويل. بدون معدات جديدة. حالاتك السابقة تحتفظ بسجلّها.",
      steps: [
        {
          title: "امسح وأرسل",
          body: "اسحب وأفلت ملفات STL بنقرة واحدة. الصور والـ CBCT والملاحظات السريرية كلها مرفقة بالحالة.",
        },
        {
          title: "راجع الخطة ثلاثية الأبعاد",
          body: "خطة ميكانيكية جاهزة خلال 48–72 ساعة. صادق أو اطلب تعديلًا دون أي رسوم إضافية.",
        },
        {
          title: "سلّم للمريض",
          body: "علبة ORALIGN تصل إلى العيادة — الأجهزة مرقّمة وجاهزة للتركيب. لا معالجة إضافية.",
        },
      ],
    },
    clinical: {
      eyebrow: "تميّز سريري",
      title: "تخطيط تقوده الميكانيكا الحيوية.",
      body:
        "كل حالة تُقرأ سريريًا قبل أن تصبح رقمية: حدود حيوية محترمة، دمج CBCT، تحكّم صارم في القوى. تبقى أنت صاحب القرار في كل مرحلة.",
      points: [
        {
          title: "تحليل CBCT",
          body: "الجذور والعظم القشري والجيوب — كلها تُحلَّل قبل أي تحريك. أنت تقرر، والنظام ينفّذ.",
        },
        {
          title: "تحكم في التورك والدورانات",
          body: "تسلسل حركي يتجنّب فقدان الإرساء والدورانات غير الدقيقة.",
        },
        {
          title: "تعديلات أقل",
          body: "تسلسل استباقي وتصحيح زائد معاير. تعالج أسرع، بدون دورة ثانية.",
        },
      ],
    },
    platform: {
      eyebrow: "منصّة شاملة",
      title: "كل حالة تتقدّم بحالة واضحة.",
      subtitle: "بُنيت من قِبل أطباء، للأطباء. بلا حِيَل.",
      cards: [
        {
          title: "محادثة تقنية لكل حالة",
          body: "تواصل مباشرة مع المصممين عبر الملف — وداعًا لمحادثات واتساب المتفرقة.",
        },
        {
          title: "متابعة الإنتاج",
          body: "مستلم · مصادق · قيد التصنيع · مُرسل. حالة فورية من لوحة التحكم في أي وقت.",
        },
        {
          title: "مساحة المريض مضمّنة",
          body: "مرضاك يتابعون علاجهم عبر رابط آمن. التزام أعلى ورضا أفضل.",
        },
      ],
    },
    packs: {
      eyebrow: "باقة لكل مؤشّر",
      title: "اختر الباقة المناسبة لحالتك.",
      subtitle:
        "خمس باقات تغطّي كل المؤشرات السريرية — من تعديلات بسيطة إلى حالات تقويم معقّدة. السعر يُقدَّم عند الطلب، مع إمكانية الدفع بالتقسيط لكل حالة.",
      labels: {
        stepsLine: (count) =>
          count == null
            ? "خطوات غير محدودة"
            : `حتى ${count} خطوة`,
        correctionsLine: (count) =>
          count == null
            ? "تعديلات غير محدودة مشمولة"
            : `${count} ${count === 1 ? "تعديل مشمول" : "تعديلات مشمولة"}`,
        installmentsLine: "دفع على دفعتين أو ثلاث بدون رسوم إضافية",
        twoArchesOnly: "فكّان فقط",
        oneOrTwoArches: "فك واحد أو فكّان",
        featured: "الأكثر اختيارًا",
        cta: "اطلب عرض سعر",
        footer:
          "كل الباقات مؤهّلة للدفع المُقسَّط. تُحدَّد جدولة الدفعات معك عند إعداد العرض.",
      },
    },
    cta: {
      eyebrow: "تجربة بدون مخاطرة",
      title: "أرسل لنا أصعب حالة لديك.",
      text:
        "الوصول إلى المنصة مجاني. الخطة ثلاثية الأبعاد بدون التزام. لا تدفع إلا عند المصادقة على التصنيع.",
      primary: "أنشئ حسابي",
      secondary: "تحدّث إلى المبيعات",
    },
  },
};

const workflowIcons = [ScanLine, MonitorCheck, PackageCheck] as const;
const clinicalIcons = [ShieldCheck, Activity, Timer] as const;
const platformIcons = [MessageCircle, Truck, UsersRound] as const;

export function PractitionerHome() {
  const { lang } = useShowcaseLang();
  const t = practitionerCopy[lang];

  return (
    <>
      <PractitionerHero copy={t.hero} />
      <ContrastSection copy={t.contrast} />
      <WorkflowSection copy={t.workflow} />
      <ClinicalSection copy={t.clinical} />
      <PlatformSection copy={t.platform} />
      <PacksSection copy={t.packs} lang={lang} />
      <PractitionerCta copy={t.cta} />
    </>
  );
}

// ─── Hero ────────────────────────────────────────────────────────────────────

function PractitionerHero({
  copy,
}: {
  copy: (typeof practitionerCopy)[Lang]["hero"];
}) {
  return (
    <section
      id="practitioner-hero"
      data-section-tone="dark"
      aria-labelledby="practitioner-hero-title"
      className="
        relative isolate min-h-[82svh] max-w-full overflow-hidden
        bg-[var(--sc-black)] text-[var(--sc-white)]
      "
    >
      {/* Premium black base — same recipe the patient Hero uses. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(circle at 18% 22%, rgba(254,202,22,0.10), transparent 38%), radial-gradient(circle at 82% 78%, rgba(254,202,22,0.055), transparent 34%), linear-gradient(135deg, rgba(255,255,255,0.035), transparent 38%), var(--sc-black)",
        }}
      />

      {/* Soft vignette. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-[1]"
        style={{
          background:
            "linear-gradient(90deg, rgba(5,5,5,0.78) 0%, rgba(5,5,5,0.42) 46%, rgba(5,5,5,0.74) 100%)",
        }}
      />

      <NoiseGrain opacity={0.14} />

      {/* Bottom fade so the hero blends into the next section. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 z-[4] h-36"
        style={{
          background:
            "linear-gradient(to bottom, transparent, rgba(5,5,5,0.78), var(--sc-black))",
        }}
      />

      <div
        className="
          relative z-[5] mx-auto flex min-h-[82svh] max-w-[1280px]
          flex-col justify-center px-5 py-20
          sm:px-8 sm:py-24
          lg:px-12 lg:py-28
        "
      >
        <Reveal>
          <div className="max-w-[900px]">
            {/* Eyebrow with amber hairline — patient/Hero convention. */}
            <div
              className="
                mb-6 flex max-w-full items-center gap-3
                text-[0.58rem] uppercase tracking-[0.42em]
                sm:mb-8
              "
              style={{ color: "var(--sc-sun)" }}
            >
              <span
                className="h-px w-8 shrink-0 bg-[var(--sc-sun)]"
                aria-hidden="true"
              />
              <span className="leading-none">{copy.eyebrow}</span>
            </div>

            <h1
              id="practitioner-hero-title"
              className="
                sc-serif mb-6 max-w-[980px] text-balance
                text-[clamp(2.6rem,9vw,6.4rem)] font-normal
                leading-[0.98] tracking-[-0.04em]
                text-[var(--sc-white)]
              "
            >
              <span>{copy.titleStart}</span>{" "}
              <em
                className="font-light italic"
                style={{ color: "var(--sc-sun)" }}
              >
                {copy.titleEm}
              </em>
              {copy.titleEnd ? <span> {copy.titleEnd}</span> : null}
            </h1>

            <p
              className="
                mb-10 max-w-[640px] text-pretty
                text-[0.98rem] leading-[1.9]
                sm:text-[1.06rem]
              "
              style={{ color: "rgba(242,245,239,0.78)" }}
            >
              {copy.subtitle}
            </p>

            {/* Primary + ghost CTAs — mirrors patient Hero. */}
            <div className="flex max-w-full flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:gap-7">
              <Link
                href="/signup"
                className="
                  sc-serif group inline-flex min-h-14 w-full max-w-[360px]
                  items-center justify-center gap-3 overflow-hidden px-7 py-4
                  text-center text-[0.72rem] font-bold uppercase
                  tracking-[0.17em] no-underline transition-all duration-300
                  hover:-translate-y-0.5 hover:shadow-[0_22px_70px_rgba(254,202,22,0.18)]
                  focus:outline-none focus-visible:ring-2
                  focus-visible:ring-[var(--sc-sun)]
                  focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sc-black)]
                  sm:w-auto
                "
                style={{
                  background: "var(--sc-sun)",
                  color: "var(--sc-black)",
                }}
              >
                <span className="relative z-10">{copy.primary}</span>
                <ArrowRight aria-hidden="true" size={16} strokeWidth={1.9} />
              </Link>

              <Link
                href="#workflow"
                className="
                  group inline-flex max-w-full items-center gap-3
                  text-[0.64rem] uppercase tracking-[0.2em]
                  no-underline transition-colors duration-300
                  hover:text-[var(--sc-sun)]
                  focus:outline-none focus-visible:text-[var(--sc-sun)]
                "
                style={{ color: "rgba(242,245,239,0.7)" }}
              >
                <span>{copy.secondary}</span>
                <span
                  className="h-px w-7 bg-current transition-transform duration-300 group-hover:translate-x-1 rtl:group-hover:-translate-x-1"
                  aria-hidden="true"
                />
              </Link>
            </div>

            <p
              className="mt-7 text-[0.82rem] leading-6"
              style={{ color: "rgba(242,245,239,0.58)" }}
            >
              {copy.micro}
            </p>
          </div>
        </Reveal>

        {/* Stat strip — trust signal without a heavy graphic. */}
        <Reveal delay>
          <div className="mt-14 grid gap-px border border-white/10 bg-white/[0.04] sm:mt-16 sm:grid-cols-3">
            {copy.stats.map((s) => (
              <div
                key={s.label}
                className="bg-[var(--sc-black)] px-6 py-6 sm:px-8 sm:py-7"
              >
                <p
                  className="sc-serif text-[clamp(1.7rem,3vw,2.4rem)] leading-none"
                  style={{ color: "var(--sc-sun)" }}
                >
                  {s.value}
                </p>
                <p
                  className="mt-3 text-[0.72rem] uppercase tracking-[0.2em]"
                  style={{ color: "rgba(242,245,239,0.66)" }}
                >
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ─── Contrast (before / after) ───────────────────────────────────────────────

function ContrastSection({
  copy,
}: {
  copy: (typeof practitionerCopy)[Lang]["contrast"];
}) {
  return (
    <section
      id="contrast"
      data-section-tone="light"
      aria-labelledby="contrast-title"
      className="bg-[var(--sc-white)] px-4 py-20 text-[var(--sc-black)] sm:px-6 sm:py-24 lg:px-12"
    >
      <div className="mx-auto max-w-[1240px]">
        <Reveal>
          <SectionIntro
            eyebrow={copy.eyebrow}
            title={copy.title}
            id="contrast-title"
          />
        </Reveal>
        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          <ContrastCard
            icon={XCircle}
            title={copy.beforeTitle}
            items={copy.before}
            tone="negative"
          />
          <ContrastCard
            icon={CheckCircle2}
            title={copy.withTitle}
            items={copy.with}
            tone="positive"
          />
        </div>
      </div>
    </section>
  );
}

function ContrastCard({
  icon: Icon,
  title,
  items,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  items: string[];
  tone: "negative" | "positive";
}) {
  const positive = tone === "positive";
  return (
    <Reveal delay={positive}>
      <article
        className={[
          "h-full border p-7 sm:p-9",
          positive
            ? "border-[rgba(201,154,11,0.32)] bg-[var(--sc-sun-3)]"
            : "border-[rgba(25,25,25,0.12)] bg-white/55",
        ].join(" ")}
      >
        <div className="flex items-center gap-3">
          <span
            className={[
              "inline-flex h-12 w-12 items-center justify-center border",
              positive
                ? "bg-[var(--sc-sun)] text-[var(--sc-black)]"
                : "bg-[rgba(25,25,25,0.06)] text-[var(--sc-text-mid)]",
            ].join(" ")}
          >
            <Icon aria-hidden="true" size={21} strokeWidth={1.7} />
          </span>
          <h3 className="sc-serif text-2xl">{title}</h3>
        </div>
        <ul className="mt-7 grid gap-4">
          {items.map((item) => (
            <li
              key={item}
              className="flex gap-3 text-[0.96rem] leading-7 text-[var(--sc-text-mid)]"
            >
              <span
                aria-hidden="true"
                className={[
                  "mt-2 h-2 w-2 shrink-0",
                  positive ? "bg-[var(--sc-sun)]" : "bg-[var(--sc-mid-grey)]",
                ].join(" ")}
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </article>
    </Reveal>
  );
}

// ─── Workflow ────────────────────────────────────────────────────────────────

function WorkflowSection({
  copy,
}: {
  copy: (typeof practitionerCopy)[Lang]["workflow"];
}) {
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

// ─── Clinical ────────────────────────────────────────────────────────────────

function ClinicalSection({
  copy,
}: {
  copy: (typeof practitionerCopy)[Lang]["clinical"];
}) {
  return (
    <section
      id="clinical"
      data-section-tone="dark"
      aria-labelledby="clinical-title"
      className="bg-[var(--sc-black)] px-4 py-20 text-[var(--sc-white)] sm:px-6 sm:py-24 lg:px-12"
    >
      <div className="mx-auto grid max-w-[1240px] gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
        <Reveal>
          <div className="text-start">
            <div
              className="mb-6 flex max-w-full items-center gap-3 text-[0.58rem] uppercase tracking-[0.42em]"
              style={{ color: "var(--sc-sun)" }}
            >
              <span
                className="h-px w-8 shrink-0 bg-[var(--sc-sun)]"
                aria-hidden="true"
              />
              <span className="leading-none">{copy.eyebrow}</span>
            </div>
            <h2
              id="clinical-title"
              className="sc-serif mt-2 max-w-3xl text-[clamp(2rem,4vw,4.4rem)] leading-[1.04]"
            >
              {copy.title}
            </h2>
            <p className="mt-6 max-w-xl text-base leading-8 text-[var(--sc-text-mid-on-dark)]">
              {copy.body}
            </p>
          </div>
        </Reveal>

        <div className="grid gap-4">
          {copy.points.map((point, index) => {
            const Icon = clinicalIcons[index] ?? ShieldCheck;
            return (
              <Reveal key={point.body} delay={index > 0}>
                <article className="border border-white/10 bg-white/[0.055] p-6 backdrop-blur sm:p-7">
                  <div className="flex items-start gap-4">
                    <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center border border-[rgba(254,202,22,0.22)] bg-[rgba(254,202,22,0.10)] text-[var(--sc-sun)]">
                      <Icon aria-hidden="true" size={22} strokeWidth={1.6} />
                    </span>
                    <div className="min-w-0">
                      {point.title ? (
                        <h3 className="sc-serif text-xl text-[var(--sc-white)]">
                          {point.title}
                        </h3>
                      ) : null}
                      <p
                        className={[
                          "text-sm leading-7 sm:text-[0.95rem]",
                          point.title ? "mt-2" : "",
                        ].join(" ")}
                        style={{ color: "rgba(242,245,239,0.78)" }}
                      >
                        {point.body}
                      </p>
                    </div>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Platform ────────────────────────────────────────────────────────────────

function PlatformSection({
  copy,
}: {
  copy: (typeof practitionerCopy)[Lang]["platform"];
}) {
  return (
    <section
      id="platform-b2b"
      data-section-tone="light"
      aria-labelledby="platform-b2b-title"
      className="bg-[var(--sc-white)] px-4 py-20 text-[var(--sc-black)] sm:px-6 sm:py-24 lg:px-12"
    >
      <div className="mx-auto max-w-[1240px]">
        <Reveal>
          <SectionIntro
            eyebrow={copy.eyebrow}
            title={copy.title}
            subtitle={copy.subtitle}
            id="platform-b2b-title"
          />
        </Reveal>
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {copy.cards.map((card, index) => (
            <PlatformCard
              key={card.title}
              card={card}
              icon={platformIcons[index] ?? MessageCircle}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function PlatformCard({
  card,
  icon: Icon,
}: {
  card: PlatformItem;
  icon: LucideIcon;
}) {
  return (
    <Reveal delay>
      <article className="h-full border border-[rgba(25,25,25,0.10)] bg-white/55 p-7 transition hover:-translate-y-1 hover:bg-white hover:shadow-[0_20px_60px_-48px_rgba(25,25,25,0.65)] sm:p-8">
        <span className="inline-flex h-12 w-12 items-center justify-center border border-[rgba(201,154,11,0.22)] bg-[var(--sc-sun-3)] text-[var(--sc-sun-deep)]">
          <Icon aria-hidden="true" size={22} strokeWidth={1.6} />
        </span>
        <h3 className="sc-serif mt-7 text-2xl">{card.title}</h3>
        <p className="mt-4 text-[0.96rem] leading-7 text-[var(--sc-text-mid)]">
          {card.body}
        </p>
      </article>
    </Reveal>
  );
}

// ─── Packs ───────────────────────────────────────────────────────────────────

/**
 * Public catalogue strip. Visually mirrors the admin Packs table —
 * pack name + limits + per-arch prices + ortho-only flag — but renders
 * in the showcase's light-card vocabulary so it matches the rest of
 * the practitioner page.
 *
 * Layout: 1 col base → 2 sm → 3 md → 5 xl. The 5-up row is the brand
 * intent (LITE · ESSENTIAL · SMART · PRO · PRO+), but the responsive
 * staircase keeps every card readable on narrower screens.
 */
function PacksSection({
  copy,
  lang,
}: {
  copy: (typeof practitionerCopy)[Lang]["packs"];
  lang: Lang;
}) {
  // Live catalogue — pulled from the public `/api/packs/public`
  // endpoint via React-Query so an admin deactivating a pack on
  // `/dashboard/packs` removes it from the showcase on the next
  // poll (60 s staleTime + refetchOnWindowFocus). Falls back to a
  // skeleton on first paint, and renders nothing when the catalogue
  // is empty rather than showing an empty grid.
  const { data: packs, isLoading, isError } = usePublicPacks();

  // Normalise the backend row into the shape the card renderer
  // expects. The tagline lookup falls back to the per-row
  // `description` (admin-controlled in the DB) when the i18n map
  // doesn't carry an entry for that pack name.
  const offerings = useMemo<PackOffering[]>(() => {
    if (!packs) return [];
    return packs.map((p) => {
      const tagline = PACK_TAGLINES[p.name] ?? {
        fr: p.description ?? "",
        en: p.description ?? "",
        ar: p.description ?? "",
      };
      const activePrices = (p.prices ?? []).filter((pr) => pr.isActive);
      const single = activePrices.find((pr) => pr.archType === ArchType.ONE_ARCH);
      const two = activePrices.find((pr) => pr.archType === ArchType.TWO_ARCHES);
      return {
        name: p.name,
        tagline,
        maxStepsPerArch: p.isUnlimitedSteps ? null : p.maxStepsPerArch ?? null,
        includedCorrections: p.isUnlimitedCorrections
          ? null
          : p.includedCorrections ?? null,
        singleArchPrice: single ? Number(single.price) : null,
        twoArchesPrice: two ? Number(two.price) : 0,
        currency: two?.currency ?? single?.currency ?? "TND",
        featured: p.name === FEATURED_PACK_NAME,
      } satisfies PackOffering;
    });
  }, [packs]);

  return (
    <section
      id="packs"
      data-section-tone="light"
      aria-labelledby="packs-title"
      className="bg-[var(--sc-white)] px-4 py-20 text-[var(--sc-black)] sm:px-6 sm:py-24 lg:px-12"
    >
      <div className="mx-auto max-w-[1340px]">
        <Reveal>
          <SectionIntro
            eyebrow={copy.eyebrow}
            title={copy.title}
            subtitle={copy.subtitle}
            id="packs-title"
          />
        </Reveal>

        {isLoading ? (
          // Light skeleton — same flex shape as the resting state so
          // the page doesn't jump when the data arrives. Centered
          // because the resting grid is centered too.
          <div className="mt-12 flex flex-wrap items-stretch justify-center gap-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-[360px] w-full max-w-[280px] flex-1 basis-[240px] animate-pulse border border-[rgba(25,25,25,0.08)] bg-[rgba(25,25,25,0.03)] sm:max-w-[280px]"
              />
            ))}
          </div>
        ) : isError || offerings.length === 0 ? (
          // Soft empty state — keeps the section in flow without an
          // angry error toast. The footer banner below still nudges
          // toward the CTA, which is the desired conversion path.
          <p className="mt-12 text-center text-sm text-[var(--sc-text-mid)]">
            {copy.labels.footer}
          </p>
        ) : (
          // Flex + wrap + justify-center keeps the catalogue centered
          // no matter how many active packs the admin is publishing:
          //   • 5 packs → single row on xl, 3 + 2 centered below on md
          //   • 4 packs → centered row (no orphan card flush-left)
          //   • 1 pack  → single centered card, not a sad left-aligned
          //               tile in column 1 of an empty grid
          // The `basis-[240px]` floor + `max-w-[280px]` cap keeps every
          // card the same width regardless of position in the row.
          <div className="mt-12 flex flex-wrap items-stretch justify-center gap-5">
            {offerings.map((pack, index) => (
              <div
                key={pack.name}
                className="flex w-full max-w-[280px] flex-1 basis-[240px] sm:max-w-[280px]"
              >
                <PackCard
                  pack={pack}
                  copy={copy}
                  lang={lang}
                  index={index}
                />
              </div>
            ))}
          </div>
        )}

        {/* Footer banner — surfaces the installment-payment benefit at
            the section level so visitors don't miss it when scanning
            cards quickly. Mirrors the `final CTA` band on the patient
            page in tone but keeps the section light. */}
        <Reveal delay>
          <div className="mt-10 flex flex-col items-start gap-4 border border-[rgba(25,25,25,0.12)] bg-[var(--sc-sun-3)] p-6 sm:flex-row sm:items-center sm:gap-6 sm:p-7">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center border border-[rgba(201,154,11,0.32)] bg-[var(--sc-sun)] text-[var(--sc-black)]">
              <Wallet aria-hidden="true" size={22} strokeWidth={1.6} />
            </span>
            <p className="text-[0.95rem] leading-7 text-[var(--sc-black)]">
              {copy.labels.footer}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function PackCard({
  pack,
  copy,
  lang,
  index,
}: {
  pack: PackOffering;
  copy: (typeof practitionerCopy)[Lang]["packs"];
  lang: Lang;
  index: number;
}) {
  const featured = !!pack.featured;
  const twoArchesOnly = pack.singleArchPrice == null;

  return (
    <Reveal delay={index > 0}>
      <article
        className={[
          "relative flex h-full flex-col border p-6 transition sm:p-7",
          featured
            ? "border-[rgba(201,154,11,0.42)] bg-[var(--sc-sun-3)] shadow-[0_24px_70px_-50px_rgba(254,202,22,0.65)] hover:-translate-y-1 hover:shadow-[0_28px_84px_-46px_rgba(254,202,22,0.75)]"
            : "border-[rgba(25,25,25,0.12)] bg-white/55 hover:-translate-y-1 hover:bg-white hover:shadow-[0_20px_60px_-48px_rgba(25,25,25,0.65)]",
        ].join(" ")}
      >
        {/* Featured ribbon. */}
        {featured ? (
          <span
            className="absolute -top-3 inline-flex items-center bg-[var(--sc-black)] px-3 py-1 text-[0.6rem] font-bold uppercase tracking-[0.18em] text-[var(--sc-sun)]"
            style={{ left: "50%", transform: "translateX(-50%)" }}
          >
            {copy.labels.featured}
          </span>
        ) : null}

        {/* Header: pack name only. The audience-gate chip ("ortho-only")
            is gone — every pack ships to every practitioner now. */}
        <header className="flex items-start justify-between gap-3">
          <h3 className="sc-serif text-2xl tracking-tight sm:text-3xl">
            {pack.name}
          </h3>
        </header>

        <p className="mt-3 min-h-[3rem] text-[0.92rem] leading-6 text-[var(--sc-text-mid)]">
          {pack.tagline[lang]}
        </p>

        {/* Arch eligibility — replaces the price block. Surfaces the
            "single or two arches" / "two arches only" rule that used to
            live in the price column on the admin table, but without
            exposing the numbers. */}
        <p className="mt-1 text-[0.7rem] uppercase tracking-[0.18em] text-[var(--sc-text-mid)]">
          {twoArchesOnly
            ? copy.labels.twoArchesOnly
            : copy.labels.oneOrTwoArches}
        </p>

        {/* Inclusions — same data the admin packs table shows: limits +
            refinements + (new) installment-payment benefit. Three
            uniform check rows, no monetary numbers. */}
        <ul className="mt-5 grid gap-2 border-y border-[rgba(25,25,25,0.10)] py-5 text-[0.9rem] leading-6 text-[var(--sc-black)]">
          <li className="flex items-center gap-2">
            {pack.maxStepsPerArch == null ? (
              <InfinityIcon
                aria-hidden="true"
                size={15}
                strokeWidth={1.9}
                className="shrink-0 text-[var(--sc-sun-deep)]"
              />
            ) : (
              <Check
                aria-hidden="true"
                size={15}
                strokeWidth={2.2}
                className="shrink-0 text-[var(--sc-sun-deep)]"
              />
            )}
            <span>{copy.labels.stepsLine(pack.maxStepsPerArch)}</span>
          </li>
          <li className="flex items-center gap-2">
            {pack.includedCorrections == null ? (
              <InfinityIcon
                aria-hidden="true"
                size={15}
                strokeWidth={1.9}
                className="shrink-0 text-[var(--sc-sun-deep)]"
              />
            ) : (
              <Check
                aria-hidden="true"
                size={15}
                strokeWidth={2.2}
                className="shrink-0 text-[var(--sc-sun-deep)]"
              />
            )}
            <span>{copy.labels.correctionsLine(pack.includedCorrections)}</span>
          </li>
          {/* Installment-payment benefit on every pack. Reads as a
              standard inclusion so it doesn't look like an upsell. */}
          <li className="flex items-center gap-2">
            <Wallet
              aria-hidden="true"
              size={15}
              strokeWidth={1.9}
              className="shrink-0 text-[var(--sc-sun-deep)]"
            />
            <span>{copy.labels.installmentsLine}</span>
          </li>
        </ul>

        {/* CTA pushed to the bottom — `flex-1` spacer keeps every card
            the same height regardless of tagline length. */}
        <div className="mt-auto pt-6">
          <Link
            href={{ pathname: "/signup", query: { pack: pack.name } }}
            className={[
              "inline-flex min-h-11 w-full items-center justify-center gap-2 px-4 py-3",
              "text-center text-[0.66rem] font-bold uppercase tracking-[0.16em] no-underline transition-all duration-300",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              "focus-visible:ring-offset-[var(--sc-white)]",
              featured
                ? "bg-[var(--sc-black)] text-[var(--sc-sun)] hover:bg-[rgba(25,25,25,0.86)] focus-visible:ring-[var(--sc-sun)]"
                : "border border-[rgba(25,25,25,0.20)] bg-transparent text-[var(--sc-black)] hover:border-[var(--sc-black)] hover:bg-[rgba(25,25,25,0.04)] focus-visible:ring-[var(--sc-sun)]",
            ].join(" ")}
          >
            <span>{copy.labels.cta}</span>
            <ArrowRight aria-hidden="true" size={13} strokeWidth={1.9} />
          </Link>
        </div>
      </article>
    </Reveal>
  );
}

// ─── Final CTA ───────────────────────────────────────────────────────────────

function PractitionerCta({
  copy,
}: {
  copy: (typeof practitionerCopy)[Lang]["cta"];
}) {
  return (
    <section
      id="cta"
      data-section-tone="dark"
      aria-labelledby="practitioner-cta-title"
      className="
        relative isolate overflow-hidden bg-[var(--sc-black)] px-4
        py-20 text-[var(--sc-white)] sm:px-6 sm:py-24 lg:px-12
      "
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(circle at 80% 30%, rgba(254,202,22,0.08), transparent 38%), var(--sc-black)",
        }}
      />
      <NoiseGrain opacity={0.12} />

      <Reveal>
        <div className="relative z-[2] mx-auto max-w-[1240px]">
          <div className="grid items-end gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="text-start">
              <div
                className="mb-6 flex max-w-full items-center gap-3 text-[0.58rem] uppercase tracking-[0.42em]"
                style={{ color: "var(--sc-sun)" }}
              >
                <span
                  className="h-px w-8 shrink-0 bg-[var(--sc-sun)]"
                  aria-hidden="true"
                />
                <span className="leading-none">{copy.eyebrow}</span>
              </div>
              <h2
                id="practitioner-cta-title"
                className="sc-serif max-w-3xl text-[clamp(2rem,4.5vw,4.6rem)] leading-[1.02]"
              >
                {copy.title}
              </h2>
              <p
                className="mt-6 max-w-2xl text-base leading-8"
                style={{ color: "rgba(242,245,239,0.78)" }}
              >
                {copy.text}
              </p>
            </div>

            <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-end sm:gap-5 lg:flex-col lg:items-stretch">
              <Link
                href="/signup"
                className="
                  sc-serif group inline-flex min-h-14 w-full
                  items-center justify-center gap-3 px-7 py-4
                  text-center text-[0.72rem] font-bold uppercase
                  tracking-[0.17em] no-underline transition-all duration-300
                  hover:-translate-y-0.5 hover:shadow-[0_22px_70px_rgba(254,202,22,0.18)]
                  focus:outline-none focus-visible:ring-2
                  focus-visible:ring-[var(--sc-sun)]
                  focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sc-black)]
                "
                style={{
                  background: "var(--sc-sun)",
                  color: "var(--sc-black)",
                }}
              >
                <span>{copy.primary}</span>
                <ArrowRight aria-hidden="true" size={16} strokeWidth={1.9} />
              </Link>
              <Link
                href="mailto:contact@oralign.com.tn"
                className="
                  inline-flex min-h-14 w-full items-center justify-center
                  border border-white/22 bg-transparent px-7 py-4
                  text-center text-[0.72rem] font-medium uppercase
                  tracking-[0.17em] text-[var(--sc-white)] no-underline
                  transition-all duration-300
                  hover:border-[var(--sc-sun)] hover:text-[var(--sc-sun)]
                  focus:outline-none focus-visible:ring-2
                  focus-visible:ring-[var(--sc-sun)]
                  focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sc-black)]
                "
              >
                {copy.secondary}
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

// ─── Shared ──────────────────────────────────────────────────────────────────

function SectionIntro({
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

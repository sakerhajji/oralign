import {
  Box,
  ClipboardCheck,
  Factory,
  Headset,
  LayoutDashboard,
  MapPin,
  ReceiptText,
  ScanFace,
  UploadCloud,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Lang } from "../../_lib/i18n/dict";

/**
 * Trilingual copy for the /praticiens B2B landing. Carries lucide icons
 * per item, so it lives co-located instead of in the string dict (same
 * convention as brochure-copy.ts).
 */

type T = Record<Lang, string>;

export const hero = {
  eyebrow: {
    fr: "Pour les dentistes & orthodontistes",
    en: "For dentists & orthodontists",
    ar: "لأطباء وأخصائيي تقويم الأسنان",
  } as T,
  title: {
    fr: "Aligneurs dentaires pour praticiens",
    en: "Clear aligners for dental professionals",
    ar: "مصففات الأسنان الشفافة للأطباء",
  } as T,
  intro: {
    fr: "ORALIGN conçoit et fabrique en Tunisie des aligneurs transparents sur prescription, avec une planification orthodontique 3D validée par vous et une plateforme de suivi pensée pour votre cabinet dentaire.",
    en: "ORALIGN designs and manufactures prescription clear aligners in Tunisia, with 3D orthodontic treatment planning you approve and an online platform built for your dental practice.",
    ar: "تصمم ORALIGN وتصنع في تونس مصففات شفافة بوصفة طبية، مع تخطيط تقويمي ثلاثي الأبعاد تعتمده بنفسك ومنصة متابعة مصممة لعيادتك.",
  } as T,
  ctaJoin: {
    fr: "Devenir praticien partenaire",
    en: "Become a partner practitioner",
    ar: "كن طبيباً شريكاً",
  } as T,
  ctaLogin: {
    fr: "Accéder à mon espace",
    en: "Sign in to my workspace",
    ar: "الدخول إلى حسابي",
  } as T,
} as const;

export const workflow = {
  eyebrow: { fr: "Orthodontie digitale", en: "Digital orthodontics", ar: "تقويم رقمي" } as T,
  title: {
    fr: "Un flux de travail 100 % digital",
    en: "A fully digital workflow",
    ar: "سير عمل رقمي بالكامل",
  } as T,
  steps: [
    {
      icon: ScanFace as LucideIcon,
      title: {
        fr: "Empreinte numérique",
        en: "Digital impression",
        ar: "طبعة رقمية",
      } as T,
      desc: {
        fr: "Scanner intra-oral ou empreintes classiques, photos cliniques et CBCT si nécessaire.",
        en: "Intraoral scanner or conventional impressions, clinical photos and CBCT when needed.",
        ar: "ماسح ضوئي للأسنان أو طبعات تقليدية، مع صور سريرية وأشعة CBCT عند الحاجة.",
      } as T,
    },
    {
      icon: UploadCloud as LucideIcon,
      title: {
        fr: "Dossier en ligne",
        en: "Online case submission",
        ar: "إرسال الملف عبر الإنترنت",
      } as T,
      desc: {
        fr: "Créez la commande sur la plateforme et joignez scans, photos et imagerie en quelques minutes.",
        en: "Create the order on the platform and attach scans, photos and imaging in minutes.",
        ar: "أنشئ الطلب على المنصة وأرفق المسوحات والصور في دقائق.",
      } as T,
    },
    {
      icon: ClipboardCheck as LucideIcon,
      title: {
        fr: "Plan de traitement 3D",
        en: "3D treatment plan",
        ar: "خطة علاج ثلاثية الأبعاد",
      } as T,
      desc: {
        fr: "Notre laboratoire orthodontique propose la planification ; vous validez chaque étape, IPR comprise.",
        en: "Our orthodontic laboratory drafts the planning; you approve every step, IPR included.",
        ar: "يقترح مخبرنا خطة العلاج، وتعتمد أنت كل خطوة بما فيها برد الأسنان.",
      } as T,
    },
    {
      icon: Box as LucideIcon,
      title: {
        fr: "Fabrication & livraison",
        en: "Manufacturing & delivery",
        ar: "التصنيع والتسليم",
      } as T,
      desc: {
        fr: "Fabrication locale des aligneurs et livraison directement à votre cabinet, avec fiche de commande complète.",
        en: "Aligners are manufactured locally and delivered straight to your practice with a complete order sheet.",
        ar: "تُصنع المصففات محلياً وتُسلَّم مباشرة إلى عيادتك مع ملف طلب كامل.",
      } as T,
    },
  ],
} as const;

export const why = {
  eyebrow: { fr: "Le partenaire de votre cabinet", en: "Your practice's partner", ar: "شريك عيادتك" } as T,
  title: {
    fr: "Pourquoi choisir ORALIGN",
    en: "Why choose ORALIGN",
    ar: "لماذا تختار ORALIGN",
  } as T,
  items: [
    {
      icon: Factory as LucideIcon,
      title: {
        fr: "Fabricant local",
        en: "Local manufacturer",
        ar: "مصنع محلي",
      } as T,
      desc: {
        fr: "Laboratoire dentaire en Tunisie, conception allemande : des délais courts sans compromis sur la qualité.",
        en: "A dental laboratory in Tunisia with German-engineered design: short lead times without compromising quality.",
        ar: "مخبر أسنان في تونس بتصميم ألماني: آجال قصيرة دون المساس بالجودة.",
      } as T,
    },
    {
      icon: MapPin as LucideIcon,
      title: {
        fr: "Visibilité locale",
        en: "Local visibility",
        ar: "حضور محلي",
      } as T,
      desc: {
        fr: "Votre cabinet apparaît sur notre carte « Trouver un praticien », consultée par les patients de toute la Tunisie.",
        en: "Your clinic appears on our patient-facing practitioner map, browsed by patients across Tunisia.",
        ar: "تظهر عيادتك على خريطة الأطباء الشركاء التي يتصفحها المرضى في كامل تونس.",
      } as T,
    },
    {
      icon: Wallet as LucideIcon,
      title: {
        fr: "Tarifs transparents",
        en: "Transparent pricing",
        ar: "أسعار واضحة",
      } as T,
      desc: {
        fr: "Des packs clairs par complexité de cas, devis et échéanciers gérés en ligne, factures générées automatiquement.",
        en: "Clear packages per case complexity, online quotations and installments, invoices generated automatically.",
        ar: "باقات واضحة حسب تعقيد الحالة، عروض أسعار وأقساط عبر الإنترنت وفواتير تلقائية.",
      } as T,
    },
    {
      icon: Headset as LucideIcon,
      title: {
        fr: "Support dédié",
        en: "Dedicated support",
        ar: "دعم مخصص",
      } as T,
      desc: {
        fr: "Une équipe clinique et technique qui accompagne vos cas, de la première commande au dernier aligneur.",
        en: "A clinical and technical team supporting your cases from the first order to the last aligner.",
        ar: "فريق سريري وتقني يرافق حالاتك من أول طلب إلى آخر مصفف.",
      } as T,
    },
  ],
} as const;

export const platform = {
  eyebrow: { fr: "La plateforme", en: "The platform", ar: "المنصة" } as T,
  title: {
    fr: "Votre laboratoire, en ligne",
    en: "Your laboratory, online",
    ar: "مخبرك على الإنترنت",
  } as T,
  intro: {
    fr: "Chaque étape du traitement orthodontique numérique de vos patients, centralisée dans un espace sécurisé.",
    en: "Every step of your patients' digital orthodontic treatment, centralised in one secure workspace.",
    ar: "كل خطوات العلاج الرقمي لمرضاك مجمّعة في فضاء آمن واحد.",
  } as T,
  items: [
    {
      icon: LayoutDashboard as LucideIcon,
      text: {
        fr: "Suivi des commandes et des patients en temps réel",
        en: "Real-time order and patient tracking",
        ar: "متابعة الطلبات والمرضى في الوقت الفعلي",
      } as T,
    },
    {
      icon: ClipboardCheck as LucideIcon,
      text: {
        fr: "Validation en ligne des plans de traitement 3D",
        en: "Online approval of 3D treatment plans",
        ar: "اعتماد خطط العلاج ثلاثية الأبعاد عبر الإنترنت",
      } as T,
    },
    {
      icon: ReceiptText as LucideIcon,
      text: {
        fr: "Devis, paiements et factures gérés depuis le cabinet",
        en: "Quotations, payments and invoices handled from your practice",
        ar: "عروض الأسعار والدفوعات والفواتير من عيادتك مباشرة",
      } as T,
    },
  ],
} as const;

export const finalCta = {
  title: {
    fr: "Devenez praticien partenaire ORALIGN",
    en: "Join the ORALIGN partner program",
    ar: "انضم إلى برنامج شركاء ORALIGN",
  } as T,
  desc: {
    fr: "Créez votre compte praticien : l'équipe ORALIGN valide votre profil et vous accompagne dès votre premier cas.",
    en: "Create your practitioner account: the ORALIGN team verifies your profile and supports you from your very first case.",
    ar: "أنشئ حسابك كطبيب: يتحقق فريق ORALIGN من ملفك ويرافقك منذ حالتك الأولى.",
  } as T,
  cta: {
    fr: "Créer mon compte praticien",
    en: "Create my practitioner account",
    ar: "إنشاء حسابي كطبيب",
  } as T,
  contact: {
    fr: "Une question ? Contactez-nous",
    en: "Questions? Contact us",
    ar: "لديك سؤال؟ اتصل بنا",
  } as T,
} as const;

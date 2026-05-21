import type { Lang } from "./i18n/dict";

type Copy = Record<Lang, string>;

export interface ShowcaseCase {
  id: string;
  category: "spacing" | "crowding" | "deep-bite" | "open-bite" | "class-ii" | "teen";
  title: Copy;
  shortTitle: Copy;
  concern: Copy;
  explanation: Copy;
  before: string;
  after: string;
  badge: Copy;
}

export const showcaseCases: ShowcaseCase[] = [
  {
    id: "diastema-closure",
    category: "spacing",
    title: {
      fr: "Espacement dentaire",
      en: "Spacing between teeth",
      ar: "فراغات بين الأسنان",
    },
    shortTitle: { fr: "Espacement", en: "Spacing", ar: "فراغات" },
    concern: {
      fr: "Des espaces visibles entre les dents antérieures.",
      en: "Visible gaps between the front teeth.",
      ar: "فراغات واضحة بين الأسنان الأمامية.",
    },
    explanation: {
      fr: "Les aligneurs rapprochent progressivement les dents pour harmoniser le sourire, selon l'évaluation du praticien.",
      en: "Aligners gradually close spaces to harmonize the smile, based on the practitioner assessment.",
      ar: "تقرّب الأجهزة الشفافة الأسنان تدريجياً لانسجام الابتسامة حسب تقييم الطبيب.",
    },
    before: "/cases/cas de diasteme/cas 1/treatment_edit_69d62d64a4dae.png",
    after: "/cases/cas de diasteme/cas 1/treatment_edit_69d62faf68a09after.png",
    badge: { fr: "Cas adulte", en: "Adult case", ar: "حالة بالغ" },
  },
  {
    id: "crowding-canine",
    category: "crowding",
    title: {
      fr: "Encombrement avec canine déplacée",
      en: "Crowding with displaced canine",
      ar: "ازدحام مع ناب غير مصطف",
    },
    shortTitle: { fr: "Encombrement", en: "Crowding", ar: "ازدحام" },
    concern: {
      fr: "Les dents se chevauchent et une canine manque d'espace.",
      en: "Teeth overlap and one canine lacks space.",
      ar: "تراكب الأسنان مع نقص مساحة للناب.",
    },
    explanation: {
      fr: "Le plan numérique organise l'espace et guide les dents vers une arcade plus lisible.",
      en: "Digital planning creates space and guides teeth toward a cleaner arch form.",
      ar: "تساعد الخطة الرقمية على تنظيم المساحة وتوجيه الأسنان لقوس أوضح.",
    },
    before: "/cases/encombrement et canine/cas1/before.png",
    after: "/cases/encombrement et canine/cas1/treatment_edit_68d1864b7a0ee after.png",
    badge: { fr: "Cas courant", en: "Common case", ar: "حالة شائعة" },
  },
  {
    id: "deep-bite",
    category: "deep-bite",
    title: {
      fr: "Supraclusion, ou recouvrement profond",
      en: "Deep bite, or excessive overbite",
      ar: "عضة عميقة",
    },
    shortTitle: { fr: "Supraclusion", en: "Deep bite", ar: "عضة عميقة" },
    concern: {
      fr: "Les dents du haut recouvrent fortement les dents du bas.",
      en: "Upper teeth cover the lower teeth too much.",
      ar: "الأسنان العلوية تغطي السفلية بشكل زائد.",
    },
    explanation: {
      fr: "Un traitement par aligneurs peut améliorer le recouvrement quand l'indication est confirmée.",
      en: "Aligner treatment can improve the bite when the indication is confirmed.",
      ar: "يمكن للأجهزة الشفافة تحسين الإطباق عندما يؤكد الطبيب ملاءمة الحالة.",
    },
    before: "/cases/supra/cas1/before.png",
    after: "/cases/supra/cas1/treatment_edit_69dce1d1bc7b7 after.png",
    badge: { fr: "Occlusion", en: "Bite", ar: "إطباق" },
  },
  {
    id: "open-bite",
    category: "open-bite",
    title: {
      fr: "Béance antérieure",
      en: "Anterior open bite",
      ar: "عضة مفتوحة أمامية",
    },
    shortTitle: { fr: "Béance", en: "Open bite", ar: "عضة مفتوحة" },
    concern: {
      fr: "Les dents de devant ne se touchent pas à la fermeture.",
      en: "Front teeth do not meet when biting down.",
      ar: "الأسنان الأمامية لا تتلامس عند الإطباق.",
    },
    explanation: {
      fr: "La planification 3D aide à visualiser le mouvement progressif avant le début du traitement.",
      en: "3D planning helps visualize the gradual movement before treatment begins.",
      ar: "تساعد الخطة ثلاثية الأبعاد على رؤية الحركة التدريجية قبل بدء العلاج.",
    },
    before: "/cases/beance/cas2/before.png",
    after: "/cases/beance/cas2/after.png",
    badge: { fr: "Occlusion", en: "Bite", ar: "إطباق" },
  },
  {
    id: "class-ii",
    category: "class-ii",
    title: {
      fr: "Décalage Classe II",
      en: "Class II bite discrepancy",
      ar: "اختلال إطباق من الصنف الثاني",
    },
    shortTitle: { fr: "Classe II", en: "Class II", ar: "الصنف الثاني" },
    concern: {
      fr: "Les dents du haut sont trop en avant par rapport à celles du bas.",
      en: "Upper teeth sit too far forward compared with lower teeth.",
      ar: "الأسنان العلوية متقدمة مقارنة بالسفلية.",
    },
    explanation: {
      fr: "Le praticien évalue la faisabilité selon l'âge, l'occlusion et les objectifs du sourire.",
      en: "The practitioner confirms suitability based on age, bite and smile goals.",
      ar: "يؤكد الطبيب ملاءمة العلاج حسب العمر والإطباق وأهداف الابتسامة.",
    },
    before: "/cases/classeII/cas1/treatment_edit_69c0d86de9449 before.png",
    after: "/cases/classeII/cas1/treatment_edit_69c0d8cb4af9dafter.png",
    badge: { fr: "Validation praticien", en: "Practitioner validation", ar: "موافقة الطبيب" },
  },
  {
    id: "teen-alignment",
    category: "teen",
    title: {
      fr: "Alignement adolescent",
      en: "Teen alignment",
      ar: "تقويم للمراهقين",
    },
    shortTitle: { fr: "Adolescent", en: "Teen", ar: "مراهق" },
    concern: {
      fr: "Un sourire en croissance qui demande un suivi régulier.",
      en: "A growing smile that needs regular supervision.",
      ar: "ابتسامة في مرحلة النمو تحتاج متابعة منتظمة.",
    },
    explanation: {
      fr: "ORALIGN Prime accompagne enfants et adolescents avec un protocole adapté à la croissance.",
      en: "ORALIGN Prime supports children and teens with a protocol adapted to growth.",
      ar: "ORALIGN Prime يرافق الأطفال والمراهقين ببروتوكول مناسب للنمو.",
    },
    before: "/cases/teen/cas1/before.png",
    after: "/cases/teen/cas1/after.png",
    badge: { fr: "ORALIGN Prime", en: "ORALIGN Prime", ar: "ORALIGN Prime" },
  },
];

export const featuredCases = showcaseCases.slice(0, 5);

import {
  Camera,
  Eye,
  HeartHandshake,
  ShieldCheck,
  Smile,
  Sparkles,
  Wind,
} from "lucide-react";

/**
 * Brochure-derived copy. Adult tone = emotional transformation.
 * Parent tone = protective, reassuring, future-looking. Kept beside the
 * brochure sections (not in the shared dict) because each step carries a
 * lucide icon component, which a plain string dictionary can't hold.
 */
export const brochureCopy = {
  adult: {
    eyebrow: { fr: "Pour vous", en: "For you", ar: "لكم البالغين" },
    titleA: { fr: "Le sourire que", en: "The smile", ar: "الابتسامة" },
    titleB: { fr: "vous méritez.", en: "you deserve.", ar: "التي تستحقها." },
    intro: {
      fr: "ORALIGN® révèle votre sourire avec discrétion. Les aligneurs sont quasi invisibles, le parcours s'intègre à votre vie pro et perso. Vous gardez votre routine ; nous nous occupons du reste.",
      en: "ORALIGN® reveals your smile, quietly. The aligners stay practically invisible and the journey blends into your professional and personal life. You keep your routine; we take care of the rest.",
      ar: "يكشف ORALIGN® ابتسامتك بهدوء. الأجهزة خفيّة تقريباً والمسار يندمج في حياتك المهنية والشخصية. تحافظ على روتينك، ونحن نتكفّل بالباقي.",
    },
    proof: {
      fr: "Vous méritez de sourire librement — au travail, en photo, devant ceux que vous aimez.",
      en: "You deserve to smile freely — at work, in photos, in front of the people you love.",
      ar: "تستحق أن تبتسم بحرّية — في العمل، في الصور، أمام من تحبّ.",
    },
    cta: { fr: "Réserver ma consultation", en: "Book my consultation", ar: "احجز استشارتي" },
    imageLabel: { fr: "Portrait adulte ORALIGN", en: "ORALIGN adult portrait", ar: "صورة بالغ ORALIGN" },
    steps: [
      {
        icon: Eye,
        title: { fr: "Discret au quotidien", en: "Discreet, every day", ar: "خفيّ كل يوم" },
        body: {
          fr: "Aligneurs quasi invisibles. Vos collègues, vos amis, votre miroir : personne ne remarquera votre traitement.",
          en: "Practically invisible aligners. Colleagues, friends, your own mirror — no one will notice you're being treated.",
          ar: "أجهزة خفيّة تقريباً. الزملاء والأصدقاء وحتى مرآتك — لن يلاحظ أحد علاجك.",
        },
      },
      {
        icon: Smile,
        title: { fr: "Liberté retrouvée", en: "Freedom restored", ar: "حرية مستعادة" },
        body: {
          fr: "Se retire en quelques secondes pour manger et boire. Votre routine reste simple, libre et naturelle.",
          en: "Comes off in seconds to eat, drink, or kiss. No restrictions, no banned-food list.",
          ar: "تُزال في ثوانٍ للأكل أو الشرب أو التعبير. بدون قيود غذائية.",
        },
      },
      {
        icon: Camera,
        title: { fr: "Confiance en images", en: "Confidence in photos", ar: "ثقة في الصور" },
        body: {
          fr: "Souriez en photo, en réunion, sur un selfie. Sans réfléchir. Sans cacher vos dents derrière votre main.",
          en: "Smile in photos, in meetings, in selfies. Without thinking. Without hiding your teeth behind your hand.",
          ar: "ابتسم في الصور والاجتماعات والسيلفي. بدون تفكير. بدون إخفاء أسنانك.",
        },
      },
      {
        icon: HeartHandshake,
        title: { fr: "Accompagnement humain", en: "Human support", ar: "مرافقة إنسانية" },
        body: {
          fr: "Chaque étape encadrée par un praticien certifié ORALIGN®. Vous n'avancez jamais seul.",
          en: "Every step guided by a certified ORALIGN® practitioner. You never move forward alone.",
          ar: "كل مرحلة بإشراف طبيب معتمد من ORALIGN®. لن تتقدّم وحدك أبداً.",
        },
      },
    ],
    benefits: [
      { fr: "Alignement discret", en: "Discreet alignment", ar: "محاذاة خفية" },
      { fr: "Confort au quotidien", en: "Daily comfort", ar: "راحة يومية" },
      { fr: "Praticien certifié", en: "Certified practitioner", ar: "طبيب معتمد" },
    ],
  },
  parent: {
    eyebrow: { fr: "Pour votre enfant", en: "For your child", ar: "لطفلك" },
    titleA: { fr: "Et si son sourire devenait", en: "What if their smile became", ar: "ماذا لو أصبحت ابتسامته" },
    titleB: { fr: "sa plus grande force ?", en: "their greatest strength?", ar: "أعظم نقاط قوّته؟" },
    intro: {
      fr: "ORALIGN Prime accompagne votre enfant avec un parcours discret, conçu pour s'effacer dans son quotidien. Pas d'appareil visible. Pas de regard qui pèse. Juste un sourire qui se construit, à l'école comme à la maison.",
      en: "ORALIGN Prime walks alongside your child with a discreet journey designed to disappear into daily life. No visible braces. No heavy stares. Just a smile being built — at school, at home.",
      ar: "يرافق ORALIGN Prime طفلك بمسار خفيّ يصمَّم ليندمج في يومه. لا أقواس معدنية مرئية. لا نظرات ثقيلة. فقط ابتسامة تُبنى في المدرسة والمنزل.",
    },
    proof: {
      fr: "Plus la prise en charge est précoce, plus le parcours est simple, confortable et naturel pour votre enfant.",
      en: "The earlier the journey begins, the simpler, more comfortable and more natural it is for your child.",
      ar: "كلما بدأ المسار مبكراً، كان أبسط وأكثر راحة وأكثر طبيعية لطفلك.",
    },
    cta: { fr: "Parler à un praticien", en: "Talk to a practitioner", ar: "تحدّث مع طبيب" },
    imageLabel: { fr: "Famille ORALIGN Prime", en: "ORALIGN Prime family", ar: "عائلة ORALIGN Prime" },
    consultationNote: {
      fr: "Une première consultation permet de savoir si ORALIGN Prime est adapté à l'âge, à la croissance et aux besoins de votre enfant.",
      en: "A first consultation helps confirm whether ORALIGN Prime fits your child's age, growth and clinical needs.",
      ar: "تساعد الاستشارة الأولى على معرفة ما إذا كان ORALIGN Prime مناسباً لعمر طفلك ونموّه واحتياجاته الطبية.",
    },
    steps: [
      {
        icon: ShieldCheck,
        title: { fr: "Protéger sa confiance", en: "Protect their confidence", ar: "احمِ ثقته" },
        body: {
          fr: "Aligneurs transparents qui passent inaperçus en classe, en sport et dans la cour de récré.",
          en: "Clear aligners that go unnoticed in class, in sports and on the playground.",
          ar: "أجهزة شفافة تمرّ دون أن يلاحظها أحد في الفصل والرياضة وساحة المدرسة.",
        },
      },
      {
        icon: Sparkles,
        title: { fr: "Sans appareil métallique", en: "No metal braces", ar: "بدون أقواس معدنية" },
        body: {
          fr: "Pas de bagues, pas de fils, pas de moqueries. Juste un sourire qui se révèle, en douceur.",
          en: "No brackets, no wires, no teasing. Just a smile being gently revealed.",
          ar: "بدون حاصرات أو أسلاك أو تنمّر. مجرد ابتسامة تتكشّف بهدوء.",
        },
      },
      {
        icon: HeartHandshake,
        title: { fr: "Agir tôt, agir mieux", en: "Act early, act better", ar: "تدخّل مبكر، نتيجة أفضل" },
        body: {
          fr: "Une prise en charge précoce simplifie le traitement et accompagne la croissance — plutôt que de la corriger plus tard.",
          en: "An early start simplifies treatment and supports growth — instead of catching up later.",
          ar: "البدء المبكر يبسّط العلاج ويرافق النمو بدل تصحيحه لاحقاً.",
        },
      },
      {
        icon: Wind,
        title: { fr: "Respiration & élocution", en: "Breathing & speech", ar: "تنفّس ونطق" },
        body: {
          fr: "Un sourire bien aligné peut soutenir la respiration nasale, l'élocution et l'équilibre du visage à long terme.",
          en: "A well-aligned smile can support nasal breathing, speech and long-term facial balance.",
          ar: "ابتسامة منسجمة تدعم التنفّس الأنفي والنطق وتوازن الوجه على المدى الطويل.",
        },
      },
    ],
    benefits: [
      { fr: "Sans métal", en: "Metal-free", ar: "بدون معدن" },
      { fr: "Amovible & hygiénique", en: "Removable & hygienic", ar: "قابل للإزالة وصحي" },
      { fr: "Praticien spécialiste", en: "Specialist practitioner", ar: "طبيب اختصاصي" },
    ],
  },
} as const;

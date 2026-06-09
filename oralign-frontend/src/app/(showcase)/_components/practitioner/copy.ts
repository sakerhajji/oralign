import type { Lang } from "../../_lib/i18n/dict";

export type ListItem = { title?: string; body: string };
export type StepItem = { title: string; body: string };
export type PlatformItem = { title: string; body: string };
export type StatItem = { value: string; label: string };

/** Shape of one language's practitioner-page copy. */
export type PractitionerCopy = {
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
};

/**
 * Practitioner-page copy in all three showcase languages. Lifted out of the
 * page components so each section stays presentational and copy edits live in
 * one place — the same separation the patient page keeps in `_lib/i18n/dict`.
 */
export const practitionerCopy: Record<Lang, PractitionerCopy> = {
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

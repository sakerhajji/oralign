export type Lang = "fr" | "en" | "ar";

export const LANGS: readonly Lang[] = ["fr", "en", "ar"] as const;
export const DEFAULT_LANG: Lang = "fr";

type T = Record<Lang, string>;

export const dict = {
  brand: {
    name: { fr: "ORALIGN", en: "ORALIGN", ar: "ORALIGN" } as T,
    company: { fr: "Aura Aligners", en: "Aura Aligners", ar: "Aura Aligners" } as T,
    tagline: {
      fr: "Made to Shine.",
      en: "Made to Shine.",
      ar: "Made to Shine.",
    } as T,
    madeWhere: {
      fr: "Conçu en Allemagne · Fabriqué en Tunisie",
      en: "Designed in Germany · Manufactured in Tunisia",
      ar: "مصمَّم في ألمانيا · صُنع في تونس",
    } as T,
  },
  nav: {
    confidence: { fr: "Confiance", en: "Trust", ar: "الثقة" } as T,
    solution: { fr: "Pourquoi", en: "Why", ar: "لماذا" } as T,
    howItWorks: { fr: "Parcours", en: "Journey", ar: "المسار" } as T,
    adults: { fr: "Adultes", en: "Adults", ar: "الكبار" } as T,
    parents: { fr: "Enfants", en: "Kids", ar: "الأطفال" } as T,
    testimonials: { fr: "Avis", en: "Reviews", ar: "آراء" } as T,
    forDentists: { fr: "Signes", en: "Signs", ar: "الأعراض" } as T,
    platform: { fr: "Indications", en: "Indications", ar: "العلاجات" } as T,
    results: { fr: "Résultats", en: "Results", ar: "النتائج" } as T,
    practitioners: { fr: "Praticiens", en: "Practitioners", ar: "الأطباء" } as T,
    contrast: { fr: "Avant", en: "Before", ar: "قبل" } as T,
    workflow: { fr: "Workflow", en: "Workflow", ar: "المسار" } as T,
    clinical: { fr: "Clinique", en: "Clinical", ar: "سريري" } as T,
    platformB2B: { fr: "Plateforme", en: "Platform", ar: "المنصة" } as T,
    challenge: { fr: "Défi", en: "Challenge", ar: "تحدي" } as T,
    createAccount: { fr: "Compte gratuit", en: "Free account", ar: "حساب مجاني" } as T,
    pricing: { fr: "Devis", en: "Quote", ar: "عرض السعر" } as T,
    forPatients: { fr: "Avis", en: "Reviews", ar: "آراء" } as T,
    about: { fr: "FAQ", en: "FAQ", ar: "الأسئلة" } as T,
    bookDemo: { fr: "Consultation", en: "Consultation", ar: "احجز" } as T,
    login: { fr: "Connexion", en: "Login", ar: "دخول" } as T,

    // ── Patient mega-menu (grouped nav) — short menu labels ──
    whyOralign: { fr: "Découvrir", en: "Discover", ar: "اكتشف" } as T,
    clinicalCases: { fr: "Cas", en: "Cases", ar: "حالات" } as T,
    community: { fr: "Communauté", en: "Community", ar: "المجتمع" } as T,
    guide: { fr: "Guide", en: "Guide", ar: "دليل" } as T,
    shop: { fr: "Shop", en: "Shop", ar: "المتجر" } as T,
    blogs: { fr: "Blog", en: "Blog", ar: "مدوّنة" } as T,
    navOralign: { fr: "Oralign", en: "Oralign", ar: "أورالاين" } as T,
    oralignPrime: { fr: "Oralign Prime", en: "Oralign Prime", ar: "أورالاين برايم" } as T,
    findPractitioner: { fr: "Praticiens", en: "Practitioners", ar: "الأطباء" } as T,
    beforeAfter: { fr: "Avant / Après", en: "Before / After", ar: "قبل / بعد" } as T,
    actEarly: { fr: "Agir tôt", en: "Act early", ar: "التدخّل مبكرًا" } as T,
    temoignages: { fr: "Témoignages", en: "Testimonials", ar: "شهادات" } as T,
    shareExperience: { fr: "Partager", en: "Share", ar: "شارك" } as T,
  },

  // ── Scaffold copy for the empty per-page SEO pages ──
  pages: {
    eyebrow: { fr: "ORALIGN", en: "ORALIGN", ar: "ORALIGN" } as T,
    placeholder: {
      fr: "Cette page est en cours de préparation. Le contenu et les visuels arrivent très bientôt.",
      en: "This page is being prepared. Content and visuals are coming very soon.",
      ar: "هذه الصفحة قيد الإعداد. سيتوفّر المحتوى والصور قريبًا.",
    } as T,
    imageSoon: { fr: "Visuel à venir", en: "Image coming soon", ar: "صورة قريبًا" } as T,
    backHome: { fr: "Retour à l'accueil", en: "Back to home", ar: "العودة إلى الرئيسية" } as T,
  },
  hero: {
    eyebrow: {
      fr: "ORALIGN® by Aura Aligners",
      en: "ORALIGN® by Aura Aligners",
      ar: "ORALIGN® من Aura Aligners",
    } as T,
    headlinePart1: { fr: "ORALIGN", en: "ORALIGN", ar: "ORALIGN" } as T,
    headlineEm: { fr: "aligne votre sourire.", en: "aligns your smile.", ar: "ينسّق ابتسامتك." } as T,
    headlinePart3: { fr: "", en: "", ar: "" } as T,
    sub: {
      fr: "Des aligneurs invisibles, confortables et précis, pensés pour votre quotidien. Conçus en Allemagne, fabriqués en Tunisie et supervisés par un praticien certifié.",
      en: "Invisible, comfortable and precise aligners made for real daily life. Designed in Germany, manufactured in Tunisia and supervised by a certified practitioner.",
      ar: "أجهزة تقويم شفافة ومريحة ودقيقة تناسب حياتك اليومية. مصممة في ألمانيا، مصنوعة في تونس وتحت إشراف طبيب معتمد.",
    } as T,
    ctaPrimary: { fr: "Réserver ma consultation", en: "Book my consultation", ar: "احجز استشارتي" } as T,
    ctaGhost: { fr: "Voir des résultats", en: "See real cases", ar: "شاهد النتائج" } as T,
    scroll: { fr: "Défiler", en: "Scroll", ar: "تمرير" } as T,
    pills: [
      { fr: "Alignement discret", en: "Discreet alignment", ar: "محاذاة خفيّة" },
      { fr: "Confort", en: "Comfort", ar: "راحة" },
      { fr: "Précision", en: "Precision", ar: "دقة" },
    ] as T[],
  },
  ribbon: {
    items: [
      { fr: "Made to Shine.", en: "Made to Shine.", ar: "Made to Shine." },
      { fr: "Conçu en Allemagne", en: "Designed in Germany", ar: "مصمَّم في ألمانيا" },
      { fr: "Fabriqué en Tunisie", en: "Manufactured in Tunisia", ar: "صُنع في تونس" },
      { fr: "Précision à chaque étape", en: "Precision in every step", ar: "دقة في كل خطوة" },
      { fr: "Résine certifiée CE", en: "CE-certified resin", ar: "راتنج معتمد CE" },
      { fr: "Validé par votre praticien", en: "Validated by your practitioner", ar: "بمصادقة طبيبك" },
      { fr: "Discret, confortable, précis", en: "Discreet, comfortable, precise", ar: "خفيّ ومريح ودقيق" },
    ] as T[],
  },
  indicationsDetail: {
    eyebrow: { fr: "Traitement orthodontique", en: "Orthodontic treatment", ar: "علاج تقويم الأسنان" } as T,
    h2Part1: { fr: "Indications des", en: "Aligner", ar: "استطبابات" } as T,
    h2Em: { fr: "aligneurs.", en: "indications.", ar: "أجهزة التقويم." } as T,
    intro: {
      fr: "Des situations très courantes nécessitant un traitement orthodontique par aligneurs.",
      en: "Very common conditions requiring orthodontic treatment with aligners.",
      ar: "حالات شائعة جداً تستدعي علاجاً تقويمياً بأجهزة التقويم.",
    } as T,
    disclaimer: {
      fr: "L'indication dépend de l'âge et de l'examen clinique. Seul votre praticien peut confirmer si ce traitement est adapté.",
      en: "Indication depends on age and clinical assessment. Only your practitioner can confirm if this treatment is suitable.",
      ar: "يعتمد الاستطباب على العمر والتقييم السريري. وحده طبيبك يستطيع تأكيد مدى ملاءمة هذا العلاج.",
    } as T,
    items: [
      {
        slug: "espacement",
        photoFolder: "cas de diasteme/cas 1",
        title: { fr: "Espacement", en: "Spacing", ar: "تباعد" },
        desc: { fr: "Espaces importants entre les dents.", en: "Large gaps between teeth.", ar: "فراغات كبيرة بين الأسنان." },
      },
      {
        slug: "encombrement",
        photoFolder: "encombrement et canine/cas1",
        title: { fr: "Encombrement", en: "Crowding", ar: "ازدحام" },
        desc: { fr: "Les dents se chevauchent.", en: "Teeth overlap.", ar: "الأسنان تتراكب." },
      },
      {
        slug: "supraclusion",
        photoFolder: "supra/cas1",
        title: { fr: "Supraclusion", en: "Overbite", ar: "إطباق علوي" },
        desc: { fr: "Les dents du haut recouvrent presque ou totalement celles du bas.", en: "Upper teeth almost or fully cover the lower ones.", ar: "الأسنان العلوية تغطّي السفلية تقريباً أو كلياً." },
      },
      {
        slug: "beance",
        photoFolder: "beance/cas2",
        title: { fr: "Béance dentaire", en: "Open bite", ar: "إطباق مفتوح" },
        desc: { fr: "Les dents ne se touchent pas à la fermeture.", en: "Teeth don't touch when biting down.", ar: "الأسنان لا تتلامس عند الإطباق." },
      },
      {
        slug: "classe-2",
        photoFolder: "classeII/cas1",
        title: { fr: "Classe 2 / 3 dentaire", en: "Class II / III", ar: "الصنف الثاني / الثالث" },
        desc: { fr: "Décalage entre les dents du haut et du bas à la fermeture.", en: "Misalignment between upper and lower teeth when closing.", ar: "اختلال بين الأسنان العلوية والسفلية عند الإطباق." },
      },
    ],
  },
  confidence: {
    eyebrow: { fr: "Le pouvoir d'un sourire", en: "The power of a smile", ar: "قوّة الابتسامة" } as T,
    h2Part1: { fr: "Un sourire aligné aujourd'hui,", en: "A smile aligned today,", ar: "ابتسامة منسجمة اليوم،" } as T,
    h2Em: { fr: "une confiance durable demain.", en: "lasting confidence tomorrow.", ar: "ثقة دائمة غداً." } as T,
    intro: {
      fr: "Un sourire que l'on ose montrer change tout : la posture, la voix, la façon de regarder les autres. ORALIGN® révèle cette assurance discrètement — sans bouleverser ce qui fait votre quotidien.",
      en: "A smile you finally dare to show changes everything: your posture, your voice, the way you meet others. ORALIGN® reveals that confidence quietly — without disrupting the life you already love.",
      ar: "ابتسامة تجرؤ على إظهارها تغيّر كل شيء: وقفتك، صوتك، طريقة نظرك للآخرين. يكشف ORALIGN® هذه الثقة بهدوء — دون أن يبدّل ما يصنع يومك.",
    } as T,
    pillars: [
      {
        title: { fr: "Souriez librement", en: "Smile freely", ar: "ابتسم بحرّية" },
        body: {
          fr: "Plus besoin de cacher vos dents en photo ou en réunion. Vos aligneurs sont quasi invisibles.",
          en: "No more hiding your teeth in photos or meetings. Your aligners stay practically invisible.",
          ar: "لا حاجة لإخفاء أسنانك في الصور أو الاجتماعات. أجهزتك تبقى خفيّة تقريباً.",
        },
      },
      {
        title: { fr: "Restez vous-même", en: "Stay yourself", ar: "ابقَ على طبيعتك" },
        body: {
          fr: "Mangez, parlez, embrassez sans contrainte. ORALIGN® se retire en quelques secondes.",
          en: "Eat, speak, kiss without holding back. ORALIGN® comes off in seconds.",
          ar: "كُل وتحدّث وعبّر دون قيود. تُزال أجهزة ORALIGN® في ثوانٍ.",
        },
      },
      {
        title: { fr: "Voyez le résultat", en: "Picture the result", ar: "تخيّل النتيجة" },
        body: {
          fr: "Votre praticien vous montre le sourire à venir avant même de commencer.",
          en: "Your practitioner previews the smile to come before treatment even starts.",
          ar: "يعرض لك طبيبك ابتسامتك القادمة قبل أن يبدأ العلاج.",
        },
      },
      {
        title: { fr: "Avancez sereinement", en: "Move forward with ease", ar: "تقدّم بثقة" },
        body: {
          fr: "Chaque étape est encadrée par un praticien certifié ORALIGN®. Jamais seul.",
          en: "Every step is guided by a certified ORALIGN® practitioner. You are never alone.",
          ar: "كل مرحلة بإشراف طبيب معتمد من ORALIGN®. لست وحدك أبداً.",
        },
      },
    ],
    imageLabel: { fr: "Sourire lifestyle ORALIGN", en: "ORALIGN lifestyle smile", ar: "ابتسامة ORALIGN" } as T,
  },
  prime: {
    eyebrow: { fr: "ORALIGN Prime", en: "ORALIGN Prime", ar: "ORALIGN Prime" } as T,
    h2Part1: { fr: "Et si son sourire devenait sa", en: "What if their smile became their", ar: "ماذا لو أصبحت ابتسامته" } as T,
    h2Em: { fr: "plus grande force ?", en: "greatest strength?", ar: "أعظم نقاط قوّته؟" } as T,
    intro: {
      fr: "ORALIGN Prime accompagne les enfants et adolescents avec des aligneurs adaptés à leur croissance — discrets, confortables, sans métal. Plus la prise en charge est précoce, plus le traitement est simple.",
      en: "ORALIGN Prime supports children and teens with aligners adapted to their growth — discreet, comfortable, metal-free. The earlier the treatment, the simpler it is.",
      ar: "ORALIGN Prime يرافق الأطفال والمراهقين بأجهزة تقويم متكيّفة مع نموّهم — خفيّة ومريحة وبدون معدن.",
    } as T,
    benefits: [
      { fr: "Adaptés à la croissance", en: "Adapted to growth", ar: "متكيّفة مع النمو" },
      { fr: "Sans métal, sans bagues", en: "Metal-free, no brackets", ar: "بدون معدن أو حاصرات" },
      { fr: "Amovibles pour le sport et le brossage", en: "Removable for sport and brushing", ar: "قابلة للإزالة للرياضة والتنظيف" },
      { fr: "Suivi par votre orthodontiste", en: "Supervised by your orthodontist", ar: "بإشراف طبيب التقويم" },
    ] as T[],
    cta: { fr: "Découvrir ORALIGN Prime", en: "Discover ORALIGN Prime", ar: "اكتشف ORALIGN Prime" } as T,
  },
  madeWhere: {
    eyebrow: { fr: "Notre héritage", en: "Our heritage", ar: "إرثنا" } as T,
    h2Part1: { fr: "Conçu en Allemagne.", en: "Designed in Germany.", ar: "مصمَّم في ألمانيا." } as T,
    h2Em: { fr: "Fabriqué en Tunisie.", en: "Manufactured in Tunisia.", ar: "صُنع في تونس." } as T,
    body: {
      fr: "ORALIGN® allie l'exigence industrielle allemande à l'agilité locale tunisienne. Résine grade médical certifiée CE, planification numérique avancée, contrôle qualité systématique — chaque aligneur est traité avec la même rigueur.",
      en: "ORALIGN® combines German industrial standards with Tunisian local agility. CE-certified medical-grade resin, advanced digital planning, systematic quality control — every aligner is treated with the same rigor.",
      ar: "ORALIGN® يجمع بين الصرامة الصناعية الألمانية والمرونة المحلية التونسية.",
    } as T,
    stats: [
      {
        num: { fr: "01", en: "01", ar: "01" },
        label: { fr: "Pionnière", en: "Pioneer", ar: "رائدة" },
        desc: { fr: "Première société tunisienne de conception et fabrication d'aligneurs.", en: "First Tunisian company designing and manufacturing aligners.", ar: "أول شركة تونسية لتصميم وتصنيع الأجهزة." },
      },
      {
        num: { fr: "CE", en: "CE", ar: "CE" },
        label: { fr: "Standards européens", en: "European standards", ar: "معايير أوروبية" },
        desc: { fr: "Protocoles et matériaux conformes aux normes européennes.", en: "Protocols and materials meeting European standards.", ar: "بروتوكولات ومواد مطابقة للمعايير الأوروبية." },
      },
      {
        num: { fr: "3D", en: "3D", ar: "3D" },
        label: { fr: "Précision absolue", en: "Absolute precision", ar: "دقة مطلقة" },
        desc: { fr: "Planification numérique OnyxCeph et contrôle qualité systématique.", en: "OnyxCeph digital planning and systematic quality control.", ar: "تخطيط رقمي OnyxCeph ومراقبة جودة منهجية." },
      },
      {
        num: { fr: "★", en: "★", ar: "★" },
        label: { fr: "Réseau certifié", en: "Certified network", ar: "شبكة معتمدة" },
        desc: { fr: "Praticiens rigoureusement sélectionnés et accompagnés.", en: "Rigorously selected and supported practitioners.", ar: "أطباء مختارون بعناية ومدعومون." },
      },
    ],
  },
  solution: {
    eyebrow: { fr: "Conçu avec soin", en: "Crafted With Care", ar: "صُنعت بعناية" } as T,
    h2Part1: { fr: "Un traitement", en: "Personalized care,", ar: "علاج مخصّص،" } as T,
    h2Em: { fr: "personnalisé,", en: "expertly crafted.", ar: "بصناعة الخبراء." } as T,
    h2Part3: { fr: "façonné par des experts.", en: "From first scan to final smile.", ar: "من أوّل فحص إلى الابتسامة الأخيرة." } as T,
    cards: [
      { fr: "Scan 3D du sourire", en: "3D Smile Scan", ar: "مسح ثلاثي الأبعاد للابتسامة" },
      { fr: "Plan de traitement sur mesure", en: "Custom Treatment Plan", ar: "خطّة علاج مخصّصة" },
      { fr: "Aligneurs premium", en: "Premium Aligners", ar: "أجهزة تقويم فاخرة" },
      { fr: "Suivi par votre dentiste", en: "Doctor-Supervised", ar: "بإشراف طبيب" },
    ] as T[],
    cardDescs: [
      {
        fr: "Un scan numérique rapide et sans rayons capture chaque détail de votre sourire.",
        en: "A quick, radiation-free digital scan captures every detail of your smile.",
        ar: "فحص رقمي سريع ومن دون إشعاع يلتقط كل تفصيل من ابتسامتك.",
      },
      {
        fr: "Voyez votre futur sourire avant même de commencer le traitement.",
        en: "See your future smile before treatment even begins.",
        ar: "شاهد ابتسامتك المستقبلية قبل أن يبدأ العلاج.",
      },
      {
        fr: "Plastique de qualité médicale, certifié CE, fabriqué dans nos laboratoires.",
        en: "Medical-grade, CE-certified plastic crafted in our labs.",
        ar: "بلاستيك طبّي معتمد CE يُصنَع في مختبراتنا.",
      },
      {
        fr: "Du premier scan au sourire final, un dentiste qualifié supervise chaque étape.",
        en: "From first scan to final smile, a licensed dentist supervises every step.",
        ar: "من أوّل فحص إلى الابتسامة الأخيرة، يُشرف طبيب مُرخَّص على كل خطوة.",
      },
    ] as T[],
    imageAlt: {
      fr: "Sourire aligné après traitement ORALIGN",
      en: "Aligned smile after ORALIGN treatment",
      ar: "ابتسامة مصطفة بعد علاج ORALIGN",
    } as T,
    imageCaption: {
      fr: "Un plan numérique, des aligneurs fabriqués sur mesure, un suivi régulier.",
      en: "Digital planning, custom-made aligners and regular follow-up.",
      ar: "تخطيط رقمي، أجهزة مخصصة ومتابعة منتظمة.",
    } as T,
  },
  how: {
    eyebrow: { fr: "Votre parcours", en: "Your Journey", ar: "رحلتك" } as T,
    h2Part1: { fr: "Du premier rendez-vous au", en: "From first visit to", ar: "من أوّل زيارة إلى" } as T,
    h2Em: { fr: "sourire final.", en: "final smile.", ar: "الابتسامة النهائية." } as T,
    steps: [
      { fr: "Consultation sourire", en: "Smile Consultation", ar: "استشارة الابتسامة" },
      { fr: "Scan numérique 3D", en: "3D Digital Scan", ar: "مسح رقمي ثلاثي الأبعاد" },
      { fr: "Aperçu de votre futur sourire", en: "See Your Future Smile", ar: "شاهد ابتسامتك المستقبلية" },
      { fr: "Portez vos aligneurs", en: "Wear Your Aligners", ar: "ارتدِ أجهزة التقويم" },
      { fr: "Sourire & contention", en: "Reveal & Retain", ar: "الابتسامة والمحافظة عليها" },
    ] as T[],
    stepDescs: [
      {
        fr: "Un dentiste évalue votre sourire et écoute vos objectifs.",
        en: "A dentist evaluates your smile and listens to your goals.",
        ar: "يقيّم الطبيب ابتسامتك ويستمع إلى أهدافك.",
      },
      {
        fr: "Un scan rapide et précis remplace les empreintes physiques.",
        en: "A quick, precise scan replaces messy physical impressions.",
        ar: "فحص سريع ودقيق يحلّ محلّ الطبعات التقليدية.",
      },
      {
        fr: "Une simulation 3D vous montre le résultat avant de commencer.",
        en: "A 3D preview shows your result before you begin.",
        ar: "محاكاة ثلاثية الأبعاد تُظهر نتيجتك قبل أن تبدأ.",
      },
      {
        fr: "22 heures par jour, changement toutes les 1–2 semaines.",
        en: "22 hours a day, swap to a new set every 1–2 weeks.",
        ar: "22 ساعة يومياً، تبديل كل أسبوع أو اثنين.",
      },
      {
        fr: "Profitez de votre nouveau sourire et conservez-le avec un retainer.",
        en: "Enjoy your new smile and keep it with a custom retainer.",
        ar: "استمتع بابتسامتك الجديدة واحتفظ بها بمثبّت مخصّص.",
      },
    ] as T[],
  },
  features: {
    eyebrow: { fr: "Ce que nous traitons", en: "What We Treat", ar: "ما نعالجه" } as T,
    h2Part1: { fr: "Une solution pour", en: "Solutions for", ar: "حلول لـ" } as T,
    h2Em: { fr: "chaque sourire.", en: "every smile.", ar: "كل ابتسامة." } as T,
    h2Part3: { fr: "", en: "", ar: "" } as T,
    cards: [
      { fr: "Encombrement dentaire", en: "Crowded teeth", ar: "ازدحام الأسنان" },
      { fr: "Espacement", en: "Spacing & gaps", ar: "تباعد الأسنان" },
      { fr: "Supraclusion", en: "Overbite", ar: "إطباق علوي" },
      { fr: "Béance dentaire", en: "Open bite", ar: "إطباق مفتوح" },
      { fr: "Classe 2 dentaire", en: "Class II", ar: "الصنف الثاني" },
      { fr: "Classe 3 dentaire", en: "Class III", ar: "الصنف الثالث" },
    ] as T[],
  },
  oldVsNew: {
    eyebrow: { fr: "Aligneurs vs bagues", en: "Aligners vs. Braces", ar: "أجهزة التقويم مقابل الأقواس" } as T,
    h2Part1: { fr: "Des fils métalliques", en: "From metal wires", ar: "من الأسلاك المعدنية" } as T,
    h2Em: { fr: "à un sourire invisible.", en: "to an invisible smile.", ar: "إلى ابتسامة خفيّة." } as T,
    oldTitle: { fr: "Bagues traditionnelles", en: "Traditional braces", ar: "الأقواس التقليدية" } as T,
    newTitle: { fr: "Aligneurs transparents", en: "Clear aligners", ar: "أجهزة التقويم الشفافة" } as T,
    oldItems: [
      { fr: "Métal visible sur les dents", en: "Metal brackets visible", ar: "حاصرات معدنية مرئية" },
      { fr: "Restrictions alimentaires", en: "Diet restrictions", ar: "قيود غذائية" },
      { fr: "Brossage difficile", en: "Difficult cleaning", ar: "تنظيف صعب" },
      { fr: "Ajustements fréquents", en: "Frequent tightening", ar: "شدّ متكرّر" },
      { fr: "Irritations buccales", en: "Mouth irritation", ar: "تهيّج الفم" },
    ] as T[],
    newItems: [
      { fr: "Quasi invisibles", en: "Practically invisible", ar: "خفيّة تقريباً" },
      { fr: "Mangez tout ce que vous aimez", en: "Eat anything you love", ar: "كُل ما تحبّ" },
      { fr: "Brossage normal", en: "Brush & floss normally", ar: "نظافة عادية" },
      { fr: "Moins de visites au cabinet", en: "Fewer office visits", ar: "زيارات أقلّ للعيادة" },
      { fr: "Doux et confortables", en: "Smooth and comfortable", ar: "ناعمة ومريحة" },
    ] as T[],
  },
  dentists: {
    eyebrow: { fr: "Patients & praticiens", en: "Patients & practitioners", ar: "المرضى والأطباء" } as T,
    h2Part1: { fr: "Un même standard,", en: "One standard,", ar: "معيار واحد،" } as T,
    h2Em: { fr: "deux expériences claires.", en: "two clear journeys.", ar: "ومساران واضحان." } as T,
    items: [
      { fr: "Mangez tout ce que vous aimez", en: "Eat anything you love", ar: "كُل ما تحبّ" },
      { fr: "Brossez et flossez normalement", en: "Brush and floss normally", ar: "نظّف بالفرشاة والخيط بشكل طبيعي" },
      { fr: "Parlez avec assurance", en: "Speak with confidence", ar: "تحدّث بثقة" },
      { fr: "Sport et activités sans souci", en: "Sports and activities welcome", ar: "الرياضة والأنشطة مسموحة" },
      { fr: "Photos qui vous ressemblent vraiment", en: "Photos that capture the real you", ar: "صور تعبّر عنك حقاً" },
    ] as T[],
  },
  patients: {
    eyebrow: { fr: "Entre des mains expertes", en: "In Expert Hands", ar: "بين أيدٍ خبيرة" } as T,
    h2Part1: { fr: "Des soins par des", en: "Care from", ar: "رعاية من" } as T,
    h2Em: { fr: "dentistes certifiés.", en: "certified dentists.", ar: "أطباء أسنان معتمدين." } as T,
    callout: {
      fr: "Chaque traitement Oralign est planifié et supervisé par un dentiste qualifié. Vos aligneurs sont fabriqués spécialement pour vous — jamais en taille unique.",
      en: "Every Oralign treatment is planned and supervised by a licensed dentist. Your aligners are made specifically for you — never one-size-fits-all.",
      ar: "كل علاج أورالاين يُخطَّط ويُشرف عليه طبيب أسنان مرخَّص. أجهزتك مصنوعة خصيصاً لك — وليست مقاساً موحَّداً.",
    } as T,
  },
  security: {
    eyebrow: { fr: "Une qualité de confiance", en: "Quality You Can Trust", ar: "جودة جديرة بثقتك" } as T,
    h2Part1: { fr: "Conçu selon des", en: "Built on", ar: "مبنيّ على" } as T,
    h2Em: { fr: "normes médicales.", en: "medical-grade standards.", ar: "معايير طبيّة." } as T,
    items: [
      { fr: "Plastique sans BPA, qualité médicale", en: "BPA-free medical-grade plastic", ar: "بلاستيك طبّي خالٍ من BPA" },
      { fr: "Matériaux certifiés CE", en: "CE-certified materials", ar: "مواد معتمدة CE" },
      { fr: "Fabrication stérile", en: "Sterile manufacturing", ar: "تصنيع معقَّم" },
      { fr: "Supervision d'un dentiste qualifié", en: "Licensed doctor oversight", ar: "إشراف طبيب مرخَّص" },
      { fr: "Confidentialité de vos données", en: "Patient data privacy", ar: "خصوصية بيانات المريض" },
      { fr: "Chaque lot testé qualité", en: "Quality-tested every batch", ar: "اختبار جودة لكل دفعة" },
      { fr: "Protocole orienté patient", en: "Patient-first protocol", ar: "بروتوكول يضع المريض أوّلاً" },
    ] as T[],
  },
  preview: {
    eyebrow: { fr: "Aperçu de votre sourire", en: "Smile Preview", ar: "معاينة ابتسامتك" } as T,
    h2Part1: { fr: "Voyez votre", en: "See your", ar: "شاهد" } as T,
    h2Em: { fr: "futur sourire,", en: "future smile,", ar: "ابتسامتك المستقبلية،" } as T,
    tabs: {
      dentist: { fr: "Encombrement", en: "Crowding", ar: "ازدحام" } as T,
      admin: { fr: "Espaces", en: "Spacing", ar: "تباعد" } as T,
      designer: { fr: "Articulé", en: "Bite", ar: "إطباق" } as T,
    },
    before: { fr: "Avant", en: "Before", ar: "قبل" } as T,
    after: { fr: "Après", en: "After", ar: "بعد" } as T,
    placeholderBefore: { fr: "Photo avant traitement", en: "Before-treatment photo", ar: "صورة قبل العلاج" } as T,
    placeholderAfter: { fr: "Photo après traitement", en: "After-treatment photo", ar: "صورة بعد العلاج" } as T,
  },
  lifecycle: {
    eyebrow: { fr: "Votre calendrier", en: "Treatment Timeline", ar: "الجدول الزمني" } as T,
    h2Part1: { fr: "Votre sourire,", en: "Your smile,", ar: "ابتسامتك،" } as T,
    h2Em: { fr: "étape par étape.", en: "step by step.", ar: "خطوة بخطوة." } as T,
    stages: [
      { fr: "Consultation", en: "Consultation", ar: "استشارة" },
      { fr: "Scan 3D", en: "3D scan", ar: "مسح ثلاثي الأبعاد" },
      { fr: "Plan de traitement", en: "Treatment plan", ar: "خطّة العلاج" },
      { fr: "Validation", en: "Approval", ar: "اعتماد" },
      { fr: "Aligneurs livrés", en: "Aligners delivered", ar: "تسليم الأجهزة" },
      { fr: "Semaines 1–4", en: "Weeks 1–4", ar: "الأسابيع 1–4" },
      { fr: "Contrôle de mi-parcours", en: "Mid-treatment check", ar: "فحص منتصف العلاج" },
      { fr: "Affinements", en: "Refinements", ar: "تعديلات دقيقة" },
      { fr: "Dernier aligneur", en: "Final aligner", ar: "آخر جهاز" },
      { fr: "Contention & sourire", en: "Retainers & glow", ar: "المثبّتات والابتسامة" },
    ] as T[],
  },
  manifesto: {
    quotePart1: {
      fr: "« La précision ne se voit pas.",
      en: "« Precision isn't seen.",
      ar: "« الدقة لا تُرى.",
    } as T,
    quoteEm: {
      fr: "Elle se ressent. »",
      en: "It is felt. »",
      ar: "بل تُحَسّ. »",
    } as T,
    sig: { fr: "— ORALIGN® · Made to Shine.", en: "— ORALIGN® · Made to Shine.", ar: "— ORALIGN® · Made to Shine." } as T,
  },
  testimonials: {
    eyebrow: { fr: "Vrais sourires", en: "Real Smiles", ar: "ابتسامات حقيقية" } as T,
    h2Part1: { fr: "Histoires de", en: "Stories from", ar: "قصص من" } as T,
    h2Em: { fr: "nos patients.", en: "our patients.", ar: "مرضانا." } as T,
    items: [
      {
        quote: {
          fr: "Je les ai à peine remarqués au quotidien. Au quatrième mois, mon sourire ressemblait au mien — en mieux.",
          en: "I barely noticed them day-to-day. By month four, my smile felt like mine — only better.",
          ar: "بالكاد لاحظتها في حياتي اليومية. وفي الشهر الرابع، شعرت أنّ ابتسامتي عادت لي — لكن أجمل.",
        } as T,
        name: { fr: "Sara M.", en: "Sara M.", ar: "سارة م." } as T,
        role: { fr: "Tunis · Traitement 6 mois", en: "Tunis · 6-month treatment", ar: "تونس · علاج 6 أشهر" } as T,
      },
      {
        quote: {
          fr: "L'aperçu 3D m'a convaincu. Voir le résultat avant de commencer a tout changé.",
          en: "The 3D preview convinced me. Seeing the final result before starting made all the difference.",
          ar: "المعاينة ثلاثية الأبعاد أقنعتني. رؤية النتيجة قبل البدء صنعت فرقاً كبيراً.",
        } as T,
        name: { fr: "Karim B.", en: "Karim B.", ar: "كريم ب." } as T,
        role: { fr: "Sfax · Traitement 9 mois", en: "Sfax · 9-month treatment", ar: "صفاقس · علاج 9 أشهر" } as T,
      },
      {
        quote: {
          fr: "Mon dentiste m'a expliqué chaque étape. Je ne me suis jamais sentie perdue — juste accompagnée.",
          en: "My dentist explained every step. I never felt lost — just supported.",
          ar: "شرح لي طبيبي كل خطوة. لم أشعر بالضياع أبداً — بل بالدعم.",
        } as T,
        name: { fr: "Lina H.", en: "Lina H.", ar: "لينا ه." } as T,
        role: { fr: "Sousse · Traitement 12 mois", en: "Sousse · 12-month treatment", ar: "سوسة · علاج 12 شهراً" } as T,
      },
    ],
  },
  pricing: {
    eyebrow: { fr: "Devis personnalisé", en: "Personalized quote", ar: "عرض سعر مخصص" } as T,
    h2Part1: { fr: "Un prix clair,", en: "A clear price,", ar: "سعر واضح،" } as T,
    h2Em: { fr: "après consultation.", en: "after consultation.", ar: "بعد الاستشارة." } as T,
    requestPricing: { fr: "Parler à un praticien", en: "Talk to a practitioner", ar: "تواصل مع طبيب" } as T,
    tiers: [
      {
        name: { fr: "Consultation sourire", en: "Smile consultation", ar: "استشارة الابتسامة" } as T,
        desc: {
          fr: "Le point de départ pour comprendre votre sourire, vos objectifs et l'indication orthodontique.",
          en: "The first step to understand your smile, your goals and the orthodontic indication.",
          ar: "الخطوة الأولى لفهم ابتسامتك وأهدافك ومدى ملاءمة العلاج.",
        } as T,
        features: [
          { fr: "Évaluation par un praticien certifié", en: "Assessment by a certified practitioner", ar: "تقييم لدى طبيب معتمد" },
          { fr: "Scan ou empreintes selon le cabinet", en: "Scan or impressions depending on the clinic", ar: "مسح رقمي أو طبعات حسب العيادة" },
          { fr: "Explication claire des étapes possibles", en: "Clear explanation of possible next steps", ar: "شرح واضح للمراحل الممكنة" },
        ] as T[],
      },
      {
        name: { fr: "ORALIGN Adulte", en: "ORALIGN Adult", ar: "ORALIGN للبالغين" } as T,
        desc: {
          fr: "Un traitement par aligneurs transparents, personnalisé selon votre examen clinique et votre quotidien.",
          en: "A clear aligner treatment personalized to your clinical assessment and everyday life.",
          ar: "علاج بأجهزة شفافة مخصص حسب تقييمك السريري وحياتك اليومية.",
        } as T,
        features: [
          { fr: "Planification numérique du sourire", en: "Digital smile planning", ar: "تخطيط رقمي للابتسامة" },
          { fr: "Aligneurs transparents sur mesure", en: "Custom clear aligners", ar: "أجهزة شفافة مصممة خصيصاً" },
          { fr: "Suivi régulier avec votre praticien", en: "Regular follow-up with your practitioner", ar: "متابعة منتظمة مع طبيبك" },
          { fr: "Devis remis avant le démarrage", en: "Quote shared before treatment starts", ar: "عرض السعر قبل بدء العلاج" },
        ] as T[],
        highlighted: true,
      },
      {
        name: { fr: "ORALIGN Prime", en: "ORALIGN Prime", ar: "ORALIGN Prime" } as T,
        desc: {
          fr: "Une prise en charge dédiée aux enfants et adolescents, adaptée à la croissance.",
          en: "A pathway for children and teenagers, adapted to growth.",
          ar: "مسار مخصص للأطفال والمراهقين ومناسب للنمو.",
        } as T,
        features: [
          { fr: "Évaluation précoce par le praticien", en: "Early assessment by the practitioner", ar: "تقييم مبكر لدى الطبيب" },
          { fr: "Aligneurs sans métal, plus discrets", en: "Metal-free, discreet aligners", ar: "أجهزة شفافة بدون معدن" },
          { fr: "Parcours expliqué aux parents", en: "Journey explained clearly to parents", ar: "مسار واضح للأهل" },
          { fr: "Suivi adapté au rythme de croissance", en: "Follow-up adapted to growth", ar: "متابعة مناسبة للنمو" },
        ] as T[],
      },
    ],
  },
  faq: {
    eyebrow: { fr: "Questions fréquentes", en: "Common Questions", ar: "أسئلة شائعة" } as T,
    h2Part1: { fr: "Tout ce que vous voulez", en: "Everything you", ar: "كل ما تودّ" } as T,
    h2Em: { fr: "savoir.", en: "want to know.", ar: "معرفته." } as T,
    tabPatient: { fr: "Patient", en: "Patient", ar: "المريض" } as T,
    tabPractitioner: { fr: "Praticien", en: "Practitioner", ar: "الطبيب" } as T,
    items: [
      {
        q: {
          fr: "Les aligneurs sont-ils vraiment invisibles ?",
          en: "Are clear aligners really invisible?",
          ar: "هل أجهزة التقويم الشفافة خفيّة حقاً؟",
        } as T,
        a: {
          fr: "Oui. Les aligneurs Oralign sont en plastique transparent qualité médicale et s'ajustent parfaitement à vos dents. Dans une conversation normale, on ne les remarque pas.",
          en: "Yes. Oralign aligners are made of clear medical-grade plastic that fits snugly over your teeth. In everyday conversation, most people won't notice them.",
          ar: "نعم. أجهزة أورالاين مصنوعة من بلاستيك طبّي شفاف ينطبق تماماً على أسنانك. في المحادثة العادية لا يلاحظها الآخرون.",
        } as T,
      },
      {
        q: {
          fr: "Combien de temps dure le traitement ?",
          en: "How long does treatment take?",
          ar: "كم تستغرق مدّة العلاج؟",
        } as T,
        a: {
          fr: "La plupart des traitements durent entre 6 et 18 mois selon vos objectifs. Votre dentiste vous donnera une estimation précise lors de la consultation.",
          en: "Most treatments take between 6 and 18 months, depending on your goals. Your dentist will share an estimated timeline at your first consultation.",
          ar: "تتراوح معظم العلاجات بين 6 و18 شهراً حسب أهدافك. سيقدّم طبيبك جدولاً تقديرياً في أوّل استشارة.",
        } as T,
      },
      {
        q: { fr: "Est-ce que ça fait mal ?", en: "Will it hurt?", ar: "هل سيكون الأمر مؤلماً؟" } as T,
        a: {
          fr: "Les aligneurs déplacent vos dents progressivement et en douceur. Vous pouvez ressentir une légère pression au changement d'aligneur — c'est le signe qu'ils fonctionnent — mais pas d'irritations ni de fils métalliques.",
          en: "Aligners move your teeth gradually and gently. You may feel mild pressure when switching to a new set — a sign they're working — but no sharp wires and no irritation.",
          ar: "تحرّك الأجهزة أسنانك تدريجياً وبلطف. قد تشعر بضغط بسيط عند الانتقال إلى طقم جديد — وهذه إشارة على نجاح العلاج — دون أسلاك حادّة أو تهيّج.",
        } as T,
      },
      {
        q: { fr: "Puis-je manger normalement ?", en: "Can I eat normally?", ar: "هل يمكنني الأكل بشكل طبيعي؟" } as T,
        a: {
          fr: "Oui. Vous retirez les aligneurs pour manger ou boire autre chose que de l'eau, puis vous brossez et les remettez.",
          en: "Yes. You remove your aligners to eat or drink anything other than water, then brush and put them back on.",
          ar: "نعم. تُزيل الأجهزة عند الأكل أو الشرب (ما عدا الماء)، ثم تنظّف أسنانك وتعيدها.",
        } as T,
      },
      {
        q: { fr: "Est-ce sûr ?", en: "Are aligners safe?", ar: "هل الأجهزة آمنة؟" } as T,
        a: {
          fr: "Oui. Les aligneurs Oralign sont fabriqués en plastique médical certifié CE et sans BPA. Votre traitement est supervisé par un dentiste qualifié de A à Z.",
          en: "Yes. Oralign aligners are made from CE-certified, BPA-free medical plastic, and your treatment is supervised by a licensed dentist from first scan to final smile.",
          ar: "نعم. الأجهزة مصنوعة من بلاستيك طبّي معتمد CE وخالٍ من BPA، ويشرف طبيب أسنان مرخَّص على علاجك من البداية حتى النهاية.",
        } as T,
      },
      {
        q: {
          fr: "Et si mon traitement a besoin d'ajustements ?",
          en: "What if my treatment needs adjustments?",
          ar: "ماذا إن احتاج علاجي إلى تعديلات؟",
        } as T,
        a: {
          fr: "Si vos dents ne suivent pas exactement le plan, votre dentiste peut commander des aligneurs supplémentaires (affinements) — inclus dans la plupart de nos plans.",
          en: "If your teeth aren't tracking exactly with the plan, your dentist can order extra aligners (refinements) to fine-tune your result — included in most plans.",
          ar: "إذا لم تتقدّم أسنانك تماماً وفق الخطّة، يمكن لطبيبك طلب أجهزة إضافية (تعديلات دقيقة) — مشمولة في معظم خططنا.",
        } as T,
      },
    ],
    practitionerItems: [
      {
        q: {
          fr: "Pourquoi intégrer ORALIGN® dans mon cabinet ?",
          en: "Why bring ORALIGN® into my practice?",
          ar: "لماذا أستخدم ORALIGN® في عيادتي؟",
        } as T,
        a: {
          fr: "ORALIGN® vous apporte un parcours structuré pour proposer des aligneurs transparents avec planification numérique, fabrication locale et accompagnement clinique.",
          en: "ORALIGN® gives your practice a structured clear-aligner workflow with digital planning, local manufacturing and clinical support.",
          ar: "يوفر ORALIGN® مساراً منظماً للأجهزة الشفافة مع تخطيط رقمي وتصنيع محلي ودعم سريري.",
        } as T,
      },
      {
        q: {
          fr: "ORALIGN® remplace-t-il la décision du praticien ?",
          en: "Does ORALIGN® replace practitioner judgment?",
          ar: "هل يستبدل ORALIGN® قرار الطبيب؟",
        } as T,
        a: {
          fr: "Non. Le praticien garde la décision clinique, valide le plan et suit le patient. ORALIGN® soutient le flux de travail, sans remplacer votre expertise.",
          en: "No. The practitioner keeps clinical decision-making, validates the plan and follows the patient. ORALIGN® supports the workflow without replacing your expertise.",
          ar: "لا. يبقى القرار السريري وموافقة الخطة ومتابعة المريض لدى الطبيب. ORALIGN® يدعم سير العمل ولا يستبدل خبرتك.",
        } as T,
      },
      {
        q: {
          fr: "Comment se déroule un cas ORALIGN® ?",
          en: "How does an ORALIGN® case work?",
          ar: "كيف تتم حالة ORALIGN®؟",
        } as T,
        a: {
          fr: "Vous soumettez les données du cas, le plan numérique est préparé, puis vous validez les étapes avant fabrication et suivi.",
          en: "You submit the case records, the digital plan is prepared, then you validate the stages before manufacturing and follow-up.",
          ar: "ترسل معطيات الحالة، يتم إعداد الخطة الرقمية، ثم تراجع المراحل قبل التصنيع والمتابعة.",
        } as T,
      },
      {
        q: {
          fr: "Les aligneurs sont-ils fabriqués en Tunisie ?",
          en: "Are the aligners manufactured in Tunisia?",
          ar: "هل تُصنع الأجهزة في تونس؟",
        } as T,
        a: {
          fr: "Oui. ORALIGN® est conçu selon une exigence technique allemande et fabriqué en Tunisie par Aura Aligners, avec contrôle qualité.",
          en: "Yes. ORALIGN® follows German technical standards and is manufactured in Tunisia by Aura Aligners with quality control.",
          ar: "نعم. يعتمد ORALIGN® معايير تقنية ألمانية ويُصنع في تونس لدى Aura Aligners مع مراقبة جودة.",
        } as T,
      },
    ],
  },
  finalCta: {
    h2Part1: { fr: "Prêt(e) à retrouver", en: "Ready to find", ar: "هل أنت مستعد لاستعادة" } as T,
    h2Em: { fr: "le sourire que vous méritez ?", en: "the smile you deserve?", ar: "الابتسامة التي تستحقّها؟" } as T,
    sub: {
      fr: "Réservez une première consultation chez un praticien certifié ORALIGN®. Nous évaluons votre sourire et vous montrons ce qui est possible — sans engagement.",
      en: "Book a first consultation with a certified ORALIGN® practitioner. We assess your smile and show you what's possible — no commitment.",
      ar: "احجز استشارة أولى لدى طبيب معتمد من ORALIGN®. نقيّم ابتسامتك ونريك ما هو ممكن — دون التزام.",
    } as T,
    primary: { fr: "Réserver ma consultation", en: "Book my consultation", ar: "احجز استشارتي" } as T,
    secondary: { fr: "Trouver un praticien", en: "Find a practitioner", ar: "ابحث عن طبيب" } as T,
  },
  footer: {
    desc: {
      fr: "ORALIGN® by Aura Aligners — aligneurs orthodontiques de précision. Conçus en Allemagne, fabriqués en Tunisie. Distribués par un réseau de praticiens certifiés.",
      en: "ORALIGN® by Aura Aligners — precision orthodontic aligners. Designed in Germany, manufactured in Tunisia. Distributed through a network of certified practitioners.",
      ar: "ORALIGN® من Aura Aligners — أجهزة تقويم دقيقة. مصمَّمة في ألمانيا، مصنوعة في تونس.",
    } as T,
    product: { fr: "Découvrir", en: "Discover", ar: "اكتشف" } as T,
    company: { fr: "Société", en: "Company", ar: "الشركة" } as T,
    legal: { fr: "Mentions légales", en: "Legal", ar: "قانوني" } as T,
    productLinks: [
      { fr: "Pourquoi les aligneurs", en: "Why aligners", ar: "لماذا الأجهزة" },
      { fr: "Parcours de traitement", en: "Treatment journey", ar: "رحلة العلاج" },
      { fr: "Ce que nous traitons", en: "What we treat", ar: "ما نعالجه" },
      { fr: "Tarifs", en: "Pricing", ar: "التسعير" },
    ] as T[],
    companyLinks: [
      { fr: "À propos", en: "About Oralign", ar: "من نحن" },
      { fr: "Nos dentistes", en: "Our doctors", ar: "أطبّاؤنا" },
      { fr: "Contact", en: "Contact", ar: "اتصل بنا" },
    ] as T[],
    legalLinks: [
      { fr: "Politique de confidentialité", en: "Privacy policy", ar: "سياسة الخصوصية" },
      { fr: "Conditions d'utilisation", en: "Terms of use", ar: "شروط الاستخدام" },
      { fr: "Avertissement médical", en: "Medical disclaimer", ar: "تنويه طبّي" },
    ] as T[],
    rights: { fr: "© 2026 Aura Aligners SARL — Tous droits réservés.", en: "© 2026 Aura Aligners SARL — All rights reserved.", ar: "© 2026 Aura Aligners SARL — جميع الحقوق محفوظة." } as T,
    sub: { fr: "Conçu en Allemagne · Fabriqué en Tunisie", en: "Designed in Germany · Manufactured in Tunisia", ar: "مصمَّم في ألمانيا · صُنع في تونس" } as T,
  },
  blog: {
    eyebrow: { fr: "Le journal ORALIGN", en: "The ORALIGN journal", ar: "مدوّنة ORALIGN" } as T,
    indexTitle: {
      fr: "Ressources & actualités praticiens",
      en: "Practitioner resources & insights",
      ar: "موارد وأخبار للأطباء",
    } as T,
    indexSubtitle: {
      fr: "Guides cliniques, protocoles d'aligneurs et actualités ORALIGN® pour faire grandir votre pratique.",
      en: "Clinical guides, aligner protocols and ORALIGN® news to grow your practice.",
      ar: "أدلّة سريرية وبروتوكولات الأجهزة وأخبار ORALIGN® لتطوير عيادتك.",
    } as T,
    // ── Patient-surface index header (the practitioner keys above keep
    //    their clinical wording; the patient blog uses these) ──
    eyebrowPatient: { fr: "Le journal ORALIGN", en: "The ORALIGN journal", ar: "مدوّنة ORALIGN" } as T,
    indexTitlePatient: {
      fr: "Conseils sourire & orthodontie",
      en: "Smile tips & orthodontics",
      ar: "نصائح الابتسامة وتقويم الأسنان",
    } as T,
    indexSubtitlePatient: {
      fr: "Conseils, actualités et guides sur les aligneurs invisibles et le sourire, par ORALIGN®.",
      en: "Tips, news and guides on invisible aligners and your smile, by ORALIGN®.",
      ar: "نصائح وأخبار وأدلّة حول الأجهزة الشفافة والابتسامة، من ORALIGN®.",
    } as T,
    searchPlaceholder: {
      fr: "Rechercher un article…",
      en: "Search articles…",
      ar: "ابحث عن مقال…",
    } as T,
    allCategories: { fr: "Toutes les catégories", en: "All categories", ar: "كل التصنيفات" } as T,
    // Fallback "type" shown on a card whose post has no category set, so
    // every card always displays a type badge.
    defaultCategory: { fr: "Article", en: "Article", ar: "مقال" } as T,
    readMore: { fr: "Lire l'article", en: "Read more", ar: "اقرأ المزيد" } as T,
    readingTime: { fr: "{n} min de lecture", en: "{n} min read", ar: "{n} دقيقة قراءة" } as T,
    minRead: { fr: "{n} min", en: "{n} min", ar: "{n} دقيقة" } as T,
    byAuthor: { fr: "Par {name}", en: "By {name}", ar: "بقلم {name}" } as T,
    publishedOn: { fr: "Publié le {date}", en: "Published {date}", ar: "نُشر في {date}" } as T,
    relatedTitle: { fr: "À lire également", en: "Keep reading", ar: "اقرأ أيضاً" } as T,
    shareLabel: { fr: "Partager", en: "Share", ar: "مشاركة" } as T,
    shareCopied: { fr: "Lien copié", en: "Link copied", ar: "تم نسخ الرابط" } as T,
    emptyTitle: { fr: "Aucun article pour le moment", en: "No articles yet", ar: "لا توجد مقالات بعد" } as T,
    emptyBody: {
      fr: "Revenez bientôt : de nouveaux articles arrivent régulièrement.",
      en: "Check back soon — new articles are published regularly.",
      ar: "عُد قريباً — تُنشر مقالات جديدة بانتظام.",
    } as T,
    loadMore: { fr: "Voir plus d'articles", en: "Load more", ar: "عرض المزيد" } as T,
    backToBlog: { fr: "Retour au blog", en: "Back to blog", ar: "العودة إلى المدوّنة" } as T,
  },

  common: {
    skipToContent: { fr: "Aller au contenu", en: "Skip to content", ar: "تخطّي إلى المحتوى" } as T,
    imagePlaceholder: { fr: "Image à venir", en: "Image coming soon", ar: "صورة قريباً" } as T,
  },
} as const;

export function pickLang<V extends Record<Lang, string>>(value: V, lang: Lang): string {
  return value[lang];
}

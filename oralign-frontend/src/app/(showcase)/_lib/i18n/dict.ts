export type Lang = "fr" | "en" | "ar";

export const LANGS: readonly Lang[] = ["fr", "en", "ar"] as const;
export const DEFAULT_LANG: Lang = "fr";

type T = Record<Lang, string>;

export const dict = {
  brand: {
    name: { fr: "Oralign", en: "Oralign", ar: "أورالاين" } as T,
    tagline: {
      fr: "Aligneurs transparents sur mesure",
      en: "Custom Clear Aligners",
      ar: "أجهزة تقويم شفافة مخصّصة",
    } as T,
  },
  nav: {
    forDentists: { fr: "Bénéfices", en: "Why Aligners", ar: "المزايا" } as T,
    howItWorks: { fr: "Parcours", en: "How It Works", ar: "المسار" } as T,
    platform: { fr: "Traitements", en: "What We Treat", ar: "العلاجات" } as T,
    pricing: { fr: "Tarifs", en: "Pricing", ar: "التسعير" } as T,
    forPatients: { fr: "Avis", en: "Reviews", ar: "آراء" } as T,
    about: { fr: "FAQ", en: "FAQ", ar: "الأسئلة" } as T,
    bookDemo: { fr: "Consultation", en: "Consultation", ar: "احجز" } as T,
    login: { fr: "Connexion", en: "Login", ar: "دخول" } as T,
  },
  hero: {
    eyebrow: {
      fr: "Aligneurs transparents",
      en: "Clear Aligner Treatment",
      ar: "علاج بأجهزة التقويم الشفافة",
    } as T,
    headlinePart1: { fr: "Un sourire", en: "A more confident", ar: "ابتسامة أكثر" } as T,
    headlineEm: { fr: "plus confiant,", en: "smile,", ar: "ثقة،" } as T,
    headlinePart3: { fr: "aligné en douceur.", en: "gently aligned.", ar: "مُحاذاة بلطف." } as T,
    sub: {
      fr: "Des aligneurs transparents conçus sur mesure par des dentistes certifiés. Discrets, confortables, amovibles — pensés pour s'adapter à votre vie.",
      en: "Custom-made clear aligners crafted by certified dentists. Discreet, comfortable, removable — designed to fit your life.",
      ar: "أجهزة تقويم شفافة مصمَّمة خصيصاً لك من قبل أطباء معتمدين. خفيّة، مريحة، قابلة للإزالة — مصمَّمة لتناسب حياتك.",
    } as T,
    ctaPrimary: { fr: "Commencer mon parcours", en: "Start Your Journey", ar: "ابدأ رحلتك" } as T,
    ctaGhost: { fr: "Voir le déroulement", en: "See how it works", ar: "اطّلع على آلية العمل" } as T,
    scroll: { fr: "Défiler", en: "Scroll", ar: "تمرير" } as T,
  },
  ribbon: {
    items: [
      { fr: "Quasi invisibles", en: "Practically Invisible", ar: "خفيّة تقريباً" },
      { fr: "Suivi par dentiste", en: "Doctor-Supervised", ar: "بإشراف طبيب" },
      { fr: "Scan 3D", en: "3D Smile Scan", ar: "مسح ثلاثي الأبعاد" },
      { fr: "Certifiés CE", en: "CE-Certified", ar: "معتمدة CE" },
      { fr: "Confortables", en: "Comfortable", ar: "مريحة" },
      { fr: "Sur mesure", en: "Personalized", ar: "مخصّصة لك" },
      { fr: "Sourire prévisible", en: "Predictable Results", ar: "نتائج متوقَّعة" },
    ] as T[],
  },
  problem: {
    eyebrow: { fr: "Pourquoi les aligneurs", en: "Why Clear Aligners", ar: "لماذا أجهزة التقويم الشفافة" } as T,
    h2Part1: { fr: "La façon moderne d'", en: "The modern way to", ar: "الطريقة الحديثة لـ" } as T,
    h2Em: { fr: "aligner votre sourire.", en: "straighten your smile.", ar: "تحسين ابتسامتك." } as T,
    items: [
      { fr: "Quasi invisibles", en: "Practically invisible", ar: "خفيّة تقريباً" },
      { fr: "Confortables à porter", en: "Comfortable to wear", ar: "مريحة الارتداء" },
      { fr: "Amovibles pour manger", en: "Removable for meals", ar: "قابلة للإزالة عند الأكل" },
      { fr: "Résultats prévisibles", en: "Predictable results", ar: "نتائج موثوقة" },
      { fr: "Conçus rien que pour vous", en: "Custom-made for you", ar: "مصمَّمة لك وحدك" },
      { fr: "Plus rapides que les bagues", en: "Faster than braces", ar: "أسرع من الأقواس المعدنية" },
    ] as T[],
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
      { fr: "Espaces & écarts", en: "Gaps & spacing", ar: "فجوات وتباعد" },
      { fr: "Surplomb supérieur", en: "Overbite", ar: "بروز علوي" },
      { fr: "Surplomb inférieur", en: "Underbite", ar: "بروز سفلي" },
      { fr: "Articulé croisé", en: "Crossbite", ar: "إطباق متصالب" },
      { fr: "Béance dentaire", en: "Open bite", ar: "إطباق مفتوح" },
      { fr: "Légères rotations", en: "Mild rotations", ar: "دورانات بسيطة" },
      { fr: "Récidive post-bagues", en: "Post-braces relapse", ar: "انتكاسة بعد الأقواس" },
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
    eyebrow: { fr: "Vie quotidienne", en: "Daily Life with Aligners", ar: "الحياة اليومية" } as T,
    h2Part1: { fr: "Votre routine,", en: "Your routine,", ar: "روتينك،" } as T,
    h2Em: { fr: "intacte.", en: "uninterrupted.", ar: "كما هو." } as T,
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
      fr: "« Un beau sourire n'est pas un luxe.",
      en: "« A great smile isn't a luxury.",
      ar: "« الابتسامة الجميلة ليست رفاهية.",
    } as T,
    quoteEm: {
      fr: "C'est la confiance que vous portez chaque jour. »",
      en: "It's the quiet confidence you wear every day. »",
      ar: "بل هي ثقة هادئة ترافقك كلّ يوم. »",
    } as T,
    sig: { fr: "— Oralign · Sourires sur mesure", en: "— Oralign · Crafted Smiles", ar: "— أورالاين · ابتسامات مصمَّمة" } as T,
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
    eyebrow: { fr: "Plans de traitement", en: "Treatment Plans", ar: "خطط العلاج" } as T,
    h2Part1: { fr: "Une option pour", en: "Treatment options for", ar: "خيارات لـ" } as T,
    h2Em: { fr: "chaque sourire.", en: "every smile.", ar: "كل ابتسامة." } as T,
    requestPricing: { fr: "Demander un devis", en: "Request a Quote", ar: "اطلب عرض سعر" } as T,
    tiers: [
      {
        name: { fr: "Léger", en: "Light", ar: "خفيف" } as T,
        desc: {
          fr: "Pour un encombrement ou un espacement léger — généralement quelques mois.",
          en: "For minor crowding or spacing — typically a few months.",
          ar: "لازدحام أو تباعد بسيط — عادةً بضعة أشهر.",
        } as T,
        features: [
          { fr: "Jusqu'à 14 jeux d'aligneurs", en: "Up to 14 aligner sets", ar: "حتى 14 طقم تقويم" },
          { fr: "1 contrôle d'avancement", en: "1 progress check-in", ar: "فحص تقدّم واحد" },
          { fr: "Retainer final inclus", en: "Final retainer included", ar: "مثبّت نهائي مشمول" },
        ] as T[],
      },
      {
        name: { fr: "Essentiel", en: "Essential", ar: "أساسي" } as T,
        desc: {
          fr: "Notre plan le plus populaire — couvre la plupart des objectifs sourire.",
          en: "Our most popular plan — covers most smile goals.",
          ar: "خطّتنا الأكثر طلباً — تغطّي معظم أهداف الابتسامة.",
        } as T,
        features: [
          { fr: "Jusqu'à 28 jeux d'aligneurs", en: "Up to 28 aligner sets", ar: "حتى 28 طقم تقويم" },
          { fr: "3 contrôles d'avancement", en: "3 progress check-ins", ar: "ثلاثة فحوص تقدّم" },
          { fr: "Affinement de mi-parcours", en: "Mid-treatment refinement", ar: "تعديل منتصف العلاج" },
          { fr: "Retainers inclus", en: "Retainers included", ar: "مثبّتات مشمولة" },
        ] as T[],
        highlighted: true,
      },
      {
        name: { fr: "Complet", en: "Comprehensive", ar: "شامل" } as T,
        desc: {
          fr: "Correction complète avec suivi étendu et affinements.",
          en: "Full-mouth correction with extended care and refinements.",
          ar: "تصحيح شامل مع متابعة موسَّعة وتعديلات.",
        } as T,
        features: [
          { fr: "Aligneurs illimités", en: "Unlimited aligner sets", ar: "أجهزة غير محدودة" },
          { fr: "Contrôles trimestriels", en: "Quarterly check-ins", ar: "فحوص فصليّة" },
          { fr: "Deux affinements", en: "Two refinements included", ar: "تعديلان مشمولان" },
          { fr: "Garantie retainer à vie", en: "Lifetime retainer warranty", ar: "ضمان مثبّت مدى الحياة" },
        ] as T[],
      },
    ],
  },
  faq: {
    eyebrow: { fr: "Questions fréquentes", en: "Common Questions", ar: "أسئلة شائعة" } as T,
    h2Part1: { fr: "Tout ce que vous voulez", en: "Everything you", ar: "كل ما تودّ" } as T,
    h2Em: { fr: "savoir.", en: "want to know.", ar: "معرفته." } as T,
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
          fr: "Absolument. Vous retirez les aligneurs pour manger ou boire (sauf eau), puis vous brossez et les remettez. Aucune restriction alimentaire.",
          en: "Absolutely. You remove your aligners to eat or drink anything other than water, then brush and put them back on. No food restrictions.",
          ar: "بالطبع. تُزيل الأجهزة عند الأكل أو الشرب (ما عدا الماء)، ثم تنظّف أسنانك وتعيدها. لا قيود غذائية.",
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
  },
  finalCta: {
    h2Part1: { fr: "Prêt à commencer", en: "Ready to begin", ar: "هل أنت جاهز لتبدأ" } as T,
    h2Em: { fr: "votre voyage sourire ?", en: "your smile journey?", ar: "رحلة ابتسامتك؟" } as T,
    sub: {
      fr: "Réservez une première consultation gratuite. Nous évaluons votre sourire et vous montrons ce qui est possible — sans engagement.",
      en: "Book a free first consultation. We'll assess your smile and show you what's possible — no commitment.",
      ar: "احجز استشارة أولى مجانية. سنقيّم ابتسامتك ونريك ما هو ممكن — دون أيّ التزام.",
    } as T,
    primary: { fr: "Réserver ma consultation", en: "Book Your Consultation", ar: "احجز استشارتك" } as T,
    secondary: { fr: "Parler à un expert", en: "Talk to an Expert", ar: "تحدّث مع خبير" } as T,
  },
  footer: {
    desc: {
      fr: "Aligneurs transparents sur mesure, façonnés par des dentistes certifiés. Un sourire confiant, aligné en douceur.",
      en: "Custom clear aligners crafted by certified dentists. A confident smile, gently aligned.",
      ar: "أجهزة تقويم شفافة مخصّصة بصناعة أطباء معتمدين. ابتسامة واثقة، مُحاذاة بلطف.",
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
    rights: { fr: "© 2026 Oralign — Tous droits réservés.", en: "© 2026 Oralign — All rights reserved.", ar: "© 2026 أورالاين — جميع الحقوق محفوظة." } as T,
    sub: { fr: "Sourires conçus avec soin", en: "Smiles designed with care", ar: "ابتسامات مصمَّمة بعناية" } as T,
  },
  common: {
    skipToContent: { fr: "Aller au contenu", en: "Skip to content", ar: "تخطّي إلى المحتوى" } as T,
    imagePlaceholder: { fr: "Image à venir", en: "Image coming soon", ar: "صورة قريباً" } as T,
  },
} as const;

export function pickLang<V extends Record<Lang, string>>(value: V, lang: Lang): string {
  return value[lang];
}

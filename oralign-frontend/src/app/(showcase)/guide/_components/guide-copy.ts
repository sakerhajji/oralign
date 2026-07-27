import type { Lang } from "../../_lib/i18n/dict";

export type GuideTone = "light" | "soft";

export type GuideStep = {
  marker: string;
  title: string;
  subtitle: string;
  contentTitle: string;
  bullets: string[];
  noteTitle: string;
  note: string;
  duration: string;
};

export type GuideSection = {
  id: string;
  number: string;
  eyebrow: string;
  title: string;
  emphasis: string;
  tone: GuideTone;
  steps: GuideStep[];
};

export type GuideTip = {
  icon: "hydration" | "travel" | "sport" | "night";
  title: string;
  body: string;
};

export type GuideFaq = {
  question: string;
  answer: string;
};

export type GuideCopy = {
  hero: {
    badge: string;
    title: string;
    emphasis: string;
    intro: string;
    nav: { href: string; label: string }[];
  };
  progress: {
    label: string;
    helper: string;
  };
  video: {
    watch: string;
    placeholder: string;
    close: string;
  };
  sections: GuideSection[];
  tips: {
    id: string;
    number: string;
    eyebrow: string;
    title: string;
    emphasis: string;
    cards: GuideTip[];
  };
  emergency: {
    title: string;
    body: string;
    phone: string;
    email: string;
  };
  faq: {
    id: string;
    eyebrow: string;
    title: string;
    emphasis: string;
    items: GuideFaq[];
  };
  manifesto: {
    line1: string;
    line2: string;
    emphasis: string;
    signature: string;
  };
};

export const guideCopy: Record<Lang, GuideCopy> = {
  fr: {
    hero: {
      badge: "Bienvenue dans l'expérience ORALIGN",
      title: "Votre guide",
      emphasis: "d'utilisation.",
      intro:
        "Félicitations pour votre choix ORALIGN. Retrouvez ici toutes les étapes, conseils et vidéos pour accompagner votre traitement du premier jour au dernier aligneur.",
      nav: [
        { href: "#step-first", label: "Premier port" },
        { href: "#step-daily", label: "Routine" },
        { href: "#step-change", label: "Changement" },
        { href: "#step-clean", label: "Nettoyage" },
        { href: "#step-tips", label: "Conseils" },
        { href: "#faq", label: "FAQ" },
      ],
    },
    progress: {
      label: "Votre progression",
      helper: "Faites défiler pour découvrir chaque étape",
    },
    video: {
      watch: "Regarder la vidéo",
      placeholder:
        "Ajoutez le lien YouTube de cette étape pour afficher la vidéo.",
      close: "Fermer la vidéo",
    },
    sections: [
      {
        id: "step-first",
        number: "1",
        eyebrow: "Étape 01 — Premier port",
        title: "Votre premier aligneur,",
        emphasis: "pas à pas.",
        tone: "light",
        steps: [
          {
            marker: "1",
            title: "Ouvrir le coffret",
            subtitle: "Préparation et vérification du contenu",
            contentTitle: "Contenu du coffret",
            bullets: [
              "Vos sachets d'aligneurs numérotés",
              "Votre boîtier de rangement ORALIGN",
              "Ce QR code, bravo, vous y êtes !",
            ],
            noteTitle: "Important",
            note:
              "Vérifiez que tous les sachets sont présents et numérotés dans l'ordre. En cas de doute, contactez immédiatement votre praticien.",
            duration: "0:45",
          },
          {
            marker: "2",
            title: "Mettre l'aligneur",
            subtitle: "Comment l'insérer correctement",
            contentTitle: "Insertion",
            bullets: [
              "Lavez-vous les mains avant toute manipulation",
              "Placez l'aligneur sur les dents de devant, puis appuyez doucement vers les molaires",
              "N'utilisez jamais vos dents pour clipser l'aligneur",
            ],
            noteTitle: "Astuce",
            note:
              "Une légère pression est normale les premières heures. C'est le signe que l'aligneur travaille.",
            duration: "1:10",
          },
          {
            marker: "3",
            title: "Retirer l'aligneur",
            subtitle: "La bonne technique pour ne pas l'abîmer",
            contentTitle: "Retrait",
            bullets: [
              "Commencez par l'arrière, côté molaires",
              "Soulevez délicatement des deux côtés",
              "Rangez immédiatement dans le boîtier ORALIGN",
            ],
            noteTitle: "Attention",
            note:
              "Ne jamais poser l'aligneur dans une serviette. C'est la cause numéro 1 de perte.",
            duration: "0:55",
          },
        ],
      },
      {
        id: "step-daily",
        number: "2",
        eyebrow: "Étape 02 — Routine quotidienne",
        title: "Portez-le 22 heures",
        emphasis: "par jour, minimum.",
        tone: "soft",
        steps: [
          {
            marker: "☀",
            title: "Quand le retirer ?",
            subtitle: "Les seuls moments autorisés",
            contentTitle: "Retirez uniquement pour",
            bullets: [
              "Manger et boire, sauf eau claire",
              "Brossage des dents et fil dentaire",
              "Nettoyage de l'aligneur",
            ],
            noteTitle: "Règle d'or",
            note:
              "Vous pouvez boire de l'eau avec l'aligneur. Évitez le café, le thé et les boissons sucrées, qui tachent et endommagent la résine.",
            duration: "1:30",
          },
        ],
      },
      {
        id: "step-change",
        number: "3",
        eyebrow: "Étape 03 — Changement de sachet",
        title: "Chaque sachet compte.",
        emphasis: "Respectez le rythme.",
        tone: "light",
        steps: [
          {
            marker: "↻",
            title: "Fréquence de changement",
            subtitle: "Quand et comment passer au sachet suivant",
            contentTitle: "Protocole de changement",
            bullets: [
              "Changez de sachet tous les 10 à 14 jours selon votre plan de traitement",
              "Passez au sachet suivant le soir au coucher, idéal pour l'adaptation",
              "Conservez toujours le sachet précédent en secours, au moins 48h",
              "Respectez strictement la numérotation inscrite sur chaque sachet",
            ],
            noteTitle: "Ne sautez jamais un sachet",
            note:
              "Chaque aligneur prépare les dents pour le suivant. Sauter une étape peut compromettre le résultat.",
            duration: "1:45",
          },
        ],
      },
      {
        id: "step-clean",
        number: "4",
        eyebrow: "Étape 04 — Nettoyage",
        title: "Un aligneur propre,",
        emphasis: "un sourire sain.",
        tone: "soft",
        steps: [
          {
            marker: "✧",
            title: "Nettoyage quotidien",
            subtitle: "Garder votre aligneur transparent et hygiénique",
            contentTitle: "Méthode recommandée",
            bullets: [
              "Rincez à l'eau tiède, jamais chaude, après chaque retrait",
              "Brossez avec une brosse à dents souple et un savon neutre",
              "Évitez le dentifrice, ses particules abrasives peuvent rayer",
              "Nettoyage profond une fois par semaine avec un comprimé effervescent dédié",
            ],
            noteTitle: "Interdit",
            note:
              "Eau chaude, bain de bouche coloré, lave-vaisselle. Ces méthodes déforment ou tachent irréversiblement l'aligneur.",
            duration: "1:20",
          },
        ],
      },
    ],
    tips: {
      id: "step-tips",
      number: "5",
      eyebrow: "Étape 05 — Conseils essentiels",
      title: "Les bons réflexes",
      emphasis: "au quotidien.",
      cards: [
        {
          icon: "hydration",
          title: "Hydratation",
          body:
            "Buvez beaucoup d'eau tout au long de la journée. L'eau aide à maintenir l'aligneur propre et votre bouche hydratée.",
        },
        {
          icon: "travel",
          title: "En déplacement",
          body:
            "Emportez toujours votre boîtier ORALIGN et une brosse de voyage. Ne posez jamais l'aligneur sur une table ou dans une serviette.",
        },
        {
          icon: "sport",
          title: "Sport & activité",
          body:
            "L'aligneur peut être porté pendant la plupart des activités sportives. Pour les sports de contact, demandez un protège-dents compatible.",
        },
        {
          icon: "night",
          title: "La nuit",
          body:
            "Portez toujours l'aligneur la nuit. Les heures de sommeil comptent dans vos 22h. Brossez vos dents avant de le remettre.",
        },
      ],
    },
    emergency: {
      title: "Un problème ? Une urgence ?",
      body:
        "Aligneur cassé, perdu ou inconfort persistant : contactez votre praticien ORALIGN immédiatement.",
      phone: "+216 98 760 728",
      email: "contact@auraaligners.com",
    },
    faq: {
      id: "faq",
      eyebrow: "Questions fréquentes",
      title: "Vos questions,",
      emphasis: "nos réponses.",
      items: [
        {
          question: "Est-ce que ça fait mal ?",
          answer:
            "Les premières heures avec un nouvel aligneur peuvent provoquer une légère pression ou un inconfort. C'est normal et temporaire. Si la douleur est forte ou persistante, contactez votre praticien.",
        },
        {
          question: "Puis-je manger avec l'aligneur ?",
          answer:
            "Non. Retirez toujours l'aligneur avant de manger ou boire, sauf eau claire. Mangez normalement, brossez-vous les dents, puis remettez l'aligneur.",
        },
        {
          question: "Que faire si je perds un aligneur ?",
          answer:
            "Remettez l'aligneur précédent, gardez-le toujours en secours, et contactez votre praticien ORALIGN immédiatement pour évaluer la marche à suivre.",
        },
        {
          question: "Combien de temps dure le traitement ?",
          answer:
            "La durée varie selon votre plan personnalisé, généralement entre 6 et 18 mois. Votre praticien vous communique une estimation lors de votre consultation.",
        },
        {
          question: "L'aligneur est-il vraiment invisible ?",
          answer:
            "La résine ORALIGN est quasi transparente et indétectable à distance. La plupart des personnes de votre entourage ne remarqueront rien.",
        },
      ],
    },
    manifesto: {
      line1: "Chaque sachet vous rapproche",
      line2: "d'un sourire",
      emphasis: "parfait.",
      signature: "ORALIGN BY AURA ALIGNERS",
    },
  },
  en: {
    hero: {
      badge: "Welcome to the ORALIGN experience",
      title: "Your user",
      emphasis: "guide.",
      intro:
        "Congratulations on choosing ORALIGN. Find every step, tip and video here to guide your treatment from day one to your last aligner.",
      nav: [
        { href: "#step-first", label: "First wear" },
        { href: "#step-daily", label: "Routine" },
        { href: "#step-change", label: "Change" },
        { href: "#step-clean", label: "Cleaning" },
        { href: "#step-tips", label: "Tips" },
        { href: "#faq", label: "FAQ" },
      ],
    },
    progress: {
      label: "Your progress",
      helper: "Scroll to discover each step",
    },
    video: {
      watch: "Watch the video",
      placeholder: "Add this step's YouTube link to display the video.",
      close: "Close video",
    },
    sections: [
      {
        id: "step-first",
        number: "1",
        eyebrow: "Step 01 — First wear",
        title: "Your first aligner,",
        emphasis: "step by step.",
        tone: "light",
        steps: [
          {
            marker: "1",
            title: "Open the box",
            subtitle: "Preparation and content check",
            contentTitle: "Box contents",
            bullets: [
              "Your numbered aligner bags",
              "Your ORALIGN storage case",
              "This QR code, well done, you are here.",
            ],
            noteTitle: "Important",
            note:
              "Check that all bags are present and numbered in order. If in doubt, contact your practitioner immediately.",
            duration: "0:45",
          },
          {
            marker: "2",
            title: "Put on the aligner",
            subtitle: "How to insert it correctly",
            contentTitle: "Insertion",
            bullets: [
              "Wash your hands before handling",
              "Place the aligner on the front teeth, then gently press toward the molars",
              "Never use your teeth to snap the aligner in",
            ],
            noteTitle: "Tip",
            note:
              "A slight pressure is normal in the first hours. It is a sign the aligner is working.",
            duration: "1:10",
          },
          {
            marker: "3",
            title: "Remove the aligner",
            subtitle: "The right technique to avoid damage",
            contentTitle: "Removal",
            bullets: [
              "Start from the back, on the molar side",
              "Gently lift from both sides",
              "Immediately store it in the ORALIGN case",
            ],
            noteTitle: "Warning",
            note:
              "Never place the aligner in a napkin. This is the number one cause of loss.",
            duration: "0:55",
          },
        ],
      },
      {
        id: "step-daily",
        number: "2",
        eyebrow: "Step 02 — Daily routine",
        title: "Wear it 22 hours",
        emphasis: "a day, minimum.",
        tone: "soft",
        steps: [
          {
            marker: "☀",
            title: "When to remove it?",
            subtitle: "The only allowed moments",
            contentTitle: "Only remove for",
            bullets: [
              "Eating and drinking, except clear water",
              "Brushing teeth and flossing",
              "Cleaning the aligner",
            ],
            noteTitle: "Golden rule",
            note:
              "You can drink water with the aligner. Avoid coffee, tea and sugary drinks, which stain and damage the resin.",
            duration: "1:30",
          },
        ],
      },
      {
        id: "step-change",
        number: "3",
        eyebrow: "Step 03 — Changing aligners",
        title: "Every bag counts.",
        emphasis: "Follow the rhythm.",
        tone: "light",
        steps: [
          {
            marker: "↻",
            title: "Changing frequency",
            subtitle: "When and how to move to the next bag",
            contentTitle: "Changing protocol",
            bullets: [
              "Change bags every 10 to 14 days according to your treatment plan",
              "Switch to the next bag at bedtime, ideal for adaptation",
              "Always keep the previous bag as backup for at least 48 hours",
              "Strictly follow the numbering on each bag",
            ],
            noteTitle: "Never skip a bag",
            note:
              "Each aligner prepares the teeth for the next one. Skipping a step can compromise results.",
            duration: "1:45",
          },
        ],
      },
      {
        id: "step-clean",
        number: "4",
        eyebrow: "Step 04 — Cleaning",
        title: "A clean aligner,",
        emphasis: "a healthy smile.",
        tone: "soft",
        steps: [
          {
            marker: "✧",
            title: "Daily cleaning",
            subtitle: "Keep your aligner clear and hygienic",
            contentTitle: "Recommended method",
            bullets: [
              "Rinse with lukewarm water, never hot, after each removal",
              "Brush with a soft toothbrush and neutral soap",
              "Avoid toothpaste, abrasive particles can scratch it",
              "Deep clean once a week with a dedicated effervescent tablet",
            ],
            noteTitle: "Forbidden",
            note:
              "Hot water, colored mouthwash and dishwasher. These methods permanently warp or stain the aligner.",
            duration: "1:20",
          },
        ],
      },
    ],
    tips: {
      id: "step-tips",
      number: "5",
      eyebrow: "Step 05 — Essential tips",
      title: "Good habits",
      emphasis: "every day.",
      cards: [
        {
          icon: "hydration",
          title: "Hydration",
          body:
            "Drink plenty of water throughout the day. Water helps keep the aligner clean and your mouth hydrated.",
        },
        {
          icon: "travel",
          title: "On the go",
          body:
            "Always carry your ORALIGN case and a travel brush. Never put the aligner on a table or in a napkin.",
        },
        {
          icon: "sport",
          title: "Sports & activity",
          body:
            "The aligner can be worn during most sports. For contact sports, ask your practitioner about a compatible mouthguard.",
        },
        {
          icon: "night",
          title: "At night",
          body:
            "Always wear the aligner at night. Sleep hours count toward your 22 hours. Brush your teeth before putting it back in.",
        },
      ],
    },
    emergency: {
      title: "A problem? An emergency?",
      body:
        "Broken or lost aligner, or persistent discomfort: contact your ORALIGN practitioner immediately.",
      phone: "+216 98 760 728",
      email: "contact@auraaligners.com",
    },
    faq: {
      id: "faq",
      eyebrow: "FAQ",
      title: "Your questions,",
      emphasis: "our answers.",
      items: [
        {
          question: "Does it hurt?",
          answer:
            "The first hours with a new aligner may cause slight pressure or discomfort. This is normal and temporary. If pain is strong or persistent, contact your practitioner.",
        },
        {
          question: "Can I eat with the aligner?",
          answer:
            "No. Always remove the aligner before eating or drinking, except clear water. Eat normally, brush your teeth, then put the aligner back in.",
        },
        {
          question: "What if I lose an aligner?",
          answer:
            "Put the previous aligner back on, always keep it as backup, and contact your ORALIGN practitioner immediately to determine next steps.",
        },
        {
          question: "How long does treatment last?",
          answer:
            "Duration varies according to your personalized plan, generally between 6 and 18 months. Your practitioner provides an estimate during consultation.",
        },
        {
          question: "Is the aligner really invisible?",
          answer:
            "ORALIGN resin is nearly transparent and undetectable from a distance. Most people around you will not notice it.",
        },
      ],
    },
    manifesto: {
      line1: "Each bag brings you closer",
      line2: "to a",
      emphasis: "perfect smile.",
      signature: "ORALIGN BY AURA ALIGNERS",
    },
  },
  ar: {
    hero: {
      badge: "مرحباً بك في تجربة أورالاين",
      title: "دليل",
      emphasis: "الاستخدام.",
      intro:
        "تهانينا لاختيارك أورالاين. ستجد هنا كل الخطوات والنصائح والفيديوهات لمرافقتك من اليوم الأول إلى آخر مثبّت.",
      nav: [
        { href: "#step-first", label: "أول ارتداء" },
        { href: "#step-daily", label: "الروتين" },
        { href: "#step-change", label: "التغيير" },
        { href: "#step-clean", label: "التنظيف" },
        { href: "#step-tips", label: "نصائح" },
        { href: "#faq", label: "FAQ" },
      ],
    },
    progress: {
      label: "تقدمك",
      helper: "مرر لاكتشاف كل خطوة",
    },
    video: {
      watch: "شاهد الفيديو",
      placeholder: "أضف رابط يوتيوب لهذه الخطوة لعرض الفيديو.",
      close: "إغلاق الفيديو",
    },
    sections: [
      {
        id: "step-first",
        number: "1",
        eyebrow: "الخطوة 01 — أول ارتداء",
        title: "مثبّتك الأول،",
        emphasis: "خطوة بخطوة.",
        tone: "light",
        steps: [
          {
            marker: "1",
            title: "افتح العلبة",
            subtitle: "التحضير والتحقق من المحتوى",
            contentTitle: "محتوى العلبة",
            bullets: [
              "أكياس المثبتات المرقمة",
              "علبة التخزين ORALIGN",
              "رمز QR هذا، أحسنت أنت هنا.",
            ],
            noteTitle: "مهم",
            note:
              "تحقق من وجود جميع الأكياس وترقيمها بالترتيب. في حال الشك، اتصل بطبيبك فوراً.",
            duration: "0:45",
          },
          {
            marker: "2",
            title: "ضع المثبّت",
            subtitle: "كيفية وضعه بشكل صحيح",
            contentTitle: "الإدراج",
            bullets: [
              "اغسل يديك قبل أي تعامل",
              "ضع المثبّت على الأسنان الأمامية ثم اضغط برفق نحو الأضراس",
              "لا تستخدم أسنانك أبداً لتثبيت المثبّت",
            ],
            noteTitle: "نصيحة",
            note:
              "الضغط الخفيف طبيعي في الساعات الأولى. هذه علامة على أن المثبّت يعمل.",
            duration: "1:10",
          },
          {
            marker: "3",
            title: "إزالة المثبّت",
            subtitle: "التقنية الصحيحة لتجنب الضرر",
            contentTitle: "الإزالة",
            bullets: [
              "ابدأ من الخلف، جهة الأضراس",
              "ارفع بلطف من الجانبين",
              "خزّنه فوراً في علبة ORALIGN",
            ],
            noteTitle: "تنبيه",
            note:
              "لا تضع المثبّت أبداً في منديل. هذا هو السبب الأول لفقدانه.",
            duration: "0:55",
          },
        ],
      },
      {
        id: "step-daily",
        number: "2",
        eyebrow: "الخطوة 02 — الروتين اليومي",
        title: "ارتده 22 ساعة",
        emphasis: "يومياً كحد أدنى.",
        tone: "soft",
        steps: [
          {
            marker: "☀",
            title: "متى تزيله؟",
            subtitle: "اللحظات المسموح بها فقط",
            contentTitle: "أزله فقط من أجل",
            bullets: [
              "الأكل والشرب، باستثناء الماء",
              "تنظيف الأسنان بالفرشاة والخيط",
              "تنظيف المثبّت",
            ],
            noteTitle: "القاعدة الذهبية",
            note:
              "يمكنك شرب الماء مع المثبّت. تجنب القهوة والشاي والمشروبات السكرية لأنها تلوّن الراتنج وتضر به.",
            duration: "1:30",
          },
        ],
      },
      {
        id: "step-change",
        number: "3",
        eyebrow: "الخطوة 03 — تغيير المثبّت",
        title: "كل كيس مهم.",
        emphasis: "التزم بالإيقاع.",
        tone: "light",
        steps: [
          {
            marker: "↻",
            title: "وتيرة التغيير",
            subtitle: "متى وكيف تنتقل إلى الكيس التالي",
            contentTitle: "بروتوكول التغيير",
            bullets: [
              "غيّر الكيس كل 10 إلى 14 يوماً حسب خطة علاجك",
              "انتقل إلى الكيس التالي مساءً عند النوم، فهو أفضل للتكيّف",
              "احتفظ دائماً بالكيس السابق كاحتياط لمدة 48 ساعة على الأقل",
              "التزم بدقة بالترقيم المكتوب على كل كيس",
            ],
            noteTitle: "لا تتخطَّ أي كيس",
            note:
              "كل مثبّت يحضّر الأسنان للذي يليه. تخطي مرحلة قد يؤثر على النتيجة.",
            duration: "1:45",
          },
        ],
      },
      {
        id: "step-clean",
        number: "4",
        eyebrow: "الخطوة 04 — التنظيف",
        title: "مثبّت نظيف،",
        emphasis: "ابتسامة صحية.",
        tone: "soft",
        steps: [
          {
            marker: "✧",
            title: "التنظيف اليومي",
            subtitle: "حافظ على شفافية ونظافة المثبّت",
            contentTitle: "الطريقة الموصى بها",
            bullets: [
              "اشطفه بماء فاتر، وليس ساخناً أبداً، بعد كل إزالة",
              "نظّفه بفرشاة أسنان ناعمة وصابون محايد",
              "تجنب معجون الأسنان لأن جزيئاته قد تخدش المثبّت",
              "تنظيف عميق مرة في الأسبوع بقرص فوّار مخصص",
            ],
            noteTitle: "ممنوع",
            note:
              "الماء الساخن، غسول الفم الملوّن وغسالة الأطباق. هذه الطرق تشوّه المثبّت أو تلوّنه بشكل دائم.",
            duration: "1:20",
          },
        ],
      },
    ],
    tips: {
      id: "step-tips",
      number: "5",
      eyebrow: "الخطوة 05 — نصائح أساسية",
      title: "عادات جيدة",
      emphasis: "كل يوم.",
      cards: [
        {
          icon: "hydration",
          title: "الترطيب",
          body:
            "اشرب كثيراً من الماء طوال اليوم. الماء يساعد في إبقاء المثبّت نظيفاً وفمك رطباً.",
        },
        {
          icon: "travel",
          title: "أثناء التنقل",
          body:
            "احمل دائماً علبة ORALIGN وفرشاة سفر. لا تضع المثبّت أبداً على طاولة أو داخل منديل.",
        },
        {
          icon: "sport",
          title: "الرياضة والنشاط",
          body:
            "يمكن ارتداء المثبّت أثناء معظم الأنشطة الرياضية. لرياضات الاحتكاك، اسأل طبيبك عن واقي أسنان متوافق.",
        },
        {
          icon: "night",
          title: "في الليل",
          body:
            "ارتدِ المثبّت دائماً في الليل. ساعات النوم تُحتسب ضمن 22 ساعة. نظّف أسنانك قبل إعادته.",
        },
      ],
    },
    emergency: {
      title: "مشكلة؟ حالة طارئة؟",
      body:
        "مثبّت مكسور أو مفقود أو عدم راحة مستمر: اتصل بطبيب ORALIGN فوراً.",
      phone: "+216 98 760 728",
      email: "contact@auraaligners.com",
    },
    faq: {
      id: "faq",
      eyebrow: "أسئلة شائعة",
      title: "أسئلتكم،",
      emphasis: "إجاباتنا.",
      items: [
        {
          question: "هل يسبب ألماً؟",
          answer:
            "قد تشعر بضغط خفيف أو عدم راحة في الساعات الأولى مع مثبّت جديد. هذا طبيعي ومؤقت. إذا كان الألم شديداً أو مستمراً، اتصل بطبيبك.",
        },
        {
          question: "هل يمكنني الأكل مع المثبّت؟",
          answer:
            "لا. أزل المثبّت دائماً قبل الأكل أو الشرب، باستثناء الماء. كُل بشكل طبيعي، نظّف أسنانك ثم أعد المثبّت.",
        },
        {
          question: "ماذا أفعل إذا فقدت مثبّتاً؟",
          answer:
            "أعد المثبّت السابق، واحتفظ به دائماً كاحتياط، واتصل بطبيب ORALIGN فوراً لتحديد الخطوات التالية.",
        },
        {
          question: "كم يدوم العلاج؟",
          answer:
            "تختلف المدة حسب خطتك الشخصية، عادةً بين 6 و18 شهراً. طبيبك يعطيك تقديراً خلال الاستشارة.",
        },
        {
          question: "هل المثبّت غير مرئي فعلاً؟",
          answer:
            "راتنج ORALIGN شبه شفاف ولا يمكن اكتشافه عن بُعد. معظم الأشخاص من حولك لن يلاحظوا شيئاً.",
        },
      ],
    },
    manifesto: {
      line1: "كل كيس يقرّبك",
      line2: "من ابتسامة",
      emphasis: "مثالية.",
      signature: "ORALIGN BY AURA ALIGNERS",
    },
  },
};

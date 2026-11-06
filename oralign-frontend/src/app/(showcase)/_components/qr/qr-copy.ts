import type { Lang } from "../../_lib/i18n/dict";

/**
 * The words of the QR welcome (/qr), French first like the rest of the
 * site, with the English and Arabic of its in-place language switch. The
 * card titles, sentences and actions are the owner's brief, word for word.
 * The film's own title, steps and labels are the home section's
 * (wear-guide-copy.ts): one text for one film.
 *
 * "ORALIGN" is written without ® next to Arabic words: between a Latin
 * word and Arabic text the ® takes the sentence's direction and prints
 * before the name.
 */
export type QrCopy = {
  langGroup: string;
  homeAria: string;
  title: string;
  intro: string;
  patients: string;
  professionals: string;
  guide: {
    meta: string;
    /** Read out after the meta line: the film's length ({m} minutes, {s} seconds). */
    length: string;
    title: string;
    body: string;
    cta: string;
  };
  contact: { title: string; body: string; cta: string };
  finder: { title: string; body: string; cta: string };
  pro: { title: string; body: string; cta: string };
  sheet: {
    title: string;
    tagline: string;
    phone: string;
    email: string;
    save: string;
    saveHint: string;
    close: string;
    unavailable: string;
  };
  film: { close: string; unavailable: string; retry: string };
};

/**
 * A no-break space: Arabic "لـ" (to, of) is attached to the word after it,
 * so a line never ends on it. Built from its code point so no editor or
 * tool can flatten it into a plain space.
 */
const NBSP = String.fromCharCode(0xa0);

export const QR_COPY: Record<Lang, QrCopy> = {
  fr: {
    langGroup: "Langue",
    homeAria: "ORALIGN, accueil du site",
    title: "Bienvenue dans l’univers ORALIGN",
    intro: "Comment pouvons-nous vous accompagner aujourd’hui ?",
    patients: "Pour les patients",
    professionals: "Espace professionnels",
    guide: {
      meta: "Vidéo · 10 gestes",
      length: "durée {m} min {s}",
      title: "Votre guide ORALIGN",
      body: "Découvrez comment utiliser et entretenir vos aligneurs en toute simplicité.",
      cta: "Voir le guide vidéo",
    },
    contact: {
      title: "Gardons le contact",
      body: "Retrouvez facilement les coordonnées officielles d’ORALIGN.",
      cta: "Enregistrer le contact",
    },
    finder: {
      title: "Trouver votre praticien",
      body: "Trouvez un dentiste ou orthodontiste partenaire ORALIGN près de chez vous.",
      cta: "Trouver un praticien",
    },
    pro: {
      title: "Vous êtes praticien ?",
      body: "Découvrez ORALIGN et rejoignez notre réseau de praticiens partenaires.",
      cta: "Découvrir l’espace praticiens",
    },
    sheet: {
      title: "Coordonnées officielles",
      tagline: "Aligneurs dentaires invisibles",
      phone: "Téléphone",
      email: "E-mail",
      save: "Enregistrer dans mes contacts",
      saveHint: "Le fichier s’ouvre dans l’app Contacts de votre téléphone.",
      close: "Fermer",
      unavailable:
        "Nos coordonnées sont momentanément indisponibles. Réessayez dans quelques minutes, ou adressez-vous à votre praticien.",
    },
    film: {
      close: "Fermer le guide",
      unavailable: "Le guide n’a pas pu se charger. Vérifiez votre connexion, puis réessayez.",
      retry: "Réessayer",
    },
  },
  en: {
    langGroup: "Language",
    homeAria: "ORALIGN, site home",
    title: "Welcome to the world of ORALIGN",
    intro: "How can we help you today?",
    patients: "For patients",
    professionals: "For professionals",
    guide: {
      meta: "Video · 10 steps",
      length: "length {m} min {s}",
      title: "Your ORALIGN guide",
      body: "Learn how to wear and care for your aligners, step by step.",
      cta: "Watch the video guide",
    },
    contact: {
      title: "Let’s stay in touch",
      body: "Find ORALIGN’s official contact details in one place.",
      cta: "Save the contact",
    },
    finder: {
      title: "Find your practitioner",
      body: "Find an ORALIGN partner dentist or orthodontist near you.",
      cta: "Find a practitioner",
    },
    pro: {
      title: "Are you a practitioner?",
      body: "Discover ORALIGN and join our network of partner practitioners.",
      cta: "Explore the practitioner space",
    },
    sheet: {
      title: "Official contact details",
      tagline: "Invisible dental aligners",
      phone: "Phone",
      email: "Email",
      save: "Save to my contacts",
      saveHint: "The file opens in your phone’s Contacts app.",
      close: "Close",
      unavailable:
        "Our contact details are unavailable right now. Please try again in a few minutes, or ask your practitioner.",
    },
    film: {
      close: "Close the guide",
      unavailable: "The guide could not load. Check your connection, then try again.",
      retry: "Try again",
    },
  },
  ar: {
    langGroup: "اللغة",
    homeAria: "ORALIGN، الصفحة الرئيسية",
    title: "مرحباً بكم في عالم ORALIGN",
    intro: "كيف يمكننا مرافقتكم اليوم؟",
    patients: "للمرضى",
    professionals: "فضاء المهنيين",
    guide: {
      meta: "فيديو · 10 خطوات",
      length: "المدة {m}:{s} دقيقة",
      title: "دليلك من ORALIGN",
      body: "تعرّف ببساطة على طريقة استعمال القوالب والعناية بها.",
      cta: "مشاهدة دليل الفيديو",
    },
    contact: {
      title: "لنبقَ على تواصل",
      body: `تجد بسهولة بيانات الاتصال الرسمية لـ${NBSP}ORALIGN.`,
      cta: "حفظ جهة الاتصال",
    },
    finder: {
      title: "ابحث عن طبيبك",
      body: `ابحث عن طبيب أسنان أو أخصائي تقويم شريك لـ${NBSP}ORALIGN بالقرب منك.`,
      cta: "ابحث عن طبيب",
    },
    pro: {
      title: "هل أنت طبيب أسنان؟",
      body: "اكتشف ORALIGN وانضمّ إلى شبكة الأطباء الشركاء.",
      cta: "اكتشف فضاء الأطباء",
    },
    sheet: {
      title: "بيانات الاتصال الرسمية",
      tagline: "مصففات أسنان شفافة",
      phone: "الهاتف",
      email: "البريد الإلكتروني",
      save: "حفظ في جهات الاتصال",
      saveHint: "يُفتح الملف في تطبيق جهات الاتصال بهاتفك.",
      close: "إغلاق",
      unavailable:
        "بيانات الاتصال غير متوفرة حالياً. يُرجى المحاولة بعد بضع دقائق، أو التوجّه إلى طبيبك.",
    },
    film: {
      close: "إغلاق الدليل",
      unavailable: "تعذّر تحميل الدليل. تحقّق من اتصالك ثم أعد المحاولة.",
      retry: "إعادة المحاولة",
    },
  },
};

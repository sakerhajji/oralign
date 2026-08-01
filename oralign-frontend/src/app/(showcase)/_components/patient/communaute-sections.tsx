"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ImageIcon,
  PenLine,
  ShieldCheck,
  Sparkles,
  Star,
  UploadCloud,
} from "lucide-react";
import { showcaseCases } from "../../_lib/case-gallery";
import type { Lang } from "../../_lib/i18n/dict";
import { useShowcaseLang } from "../../_lib/i18n/lang-context";
import { Reveal } from "../shared/reveal";
import { SectionHeading } from "../shared/section-heading";
import { useApprovedCommunitySubmissions, useCreateCommunitySubmission } from "@/lib/hooks";
import {
  CommunitySubmissionFormat,
  CommunitySubmissionRole,
  CommunitySubmissionTreatmentStatus,
} from "@/lib/types";
import { getAvatarUrl } from "@/lib/utils";

type Copy = Record<Lang, string>;
type Filter = "all" | "adult" | "parent" | "teen" | "done" | "ongoing";
type Format = "photo" | "text";

const copy = (fr: string, en: string, ar: string): Copy => ({ fr, en, ar });

const pageCopy = {
  hero: {
    eyebrow: copy("Communauté ORALIGN", "The ORALIGN community", "مجتمع ORALIGN"),
    title: copy("Ils sourient grâce à ORALIGN.", "They smile with ORALIGN.", "يبتسمون بفضل ORALIGN."),
    subtitle: copy(
      "Découvrez les témoignages de patients et de parents qui ont choisi les aligneurs ORALIGN. Leur expérience peut vous inspirer — et la vôtre peut rassurer d'autres familles.",
      "Discover the stories of patients and parents who chose ORALIGN clear aligners. Their experience may inspire you — and yours may reassure another family.",
      "اكتشف قصص المرضى والأهل الذين اختاروا أجهزة ORALIGN الشفافة. قد تلهمك تجربتهم وتطمئن عائلة أخرى.",
    ),
    primary: copy("Lire les témoignages", "Read the stories", "اقرأ الشهادات"),
    secondary: copy("Partager le mien", "Share my story", "شارك قصتي"),
  },
  stats: [
    { value: "∞", label: copy("Des parcours uniques", "Unique journeys", "تجارب فريدة") },
    { value: "6–18", label: copy("Mois de traitement", "Months of treatment", "أشهر العلاج") },
    { value: "100%", label: copy("Suivis par un praticien", "Practitioner-supervised", "بإشراف الطبيب") },
  ],
  testimonials: {
    eyebrow: copy("Témoignages", "Testimonials", "شهادات"),
    title: copy("Des sourires, des histoires,", "Smiles, stories,", "ابتسامات وقصص،"),
    emphasis: copy("des résultats.", "real results.", "ونتائج."),
    subtitle: copy(
      "Adultes, adolescents, parents — chaque parcours est unique. Voici ceux qui ont choisi ORALIGN et qui témoignent.",
      "Adults, teenagers and parents — every journey is unique. Here are the people who chose ORALIGN and shared theirs.",
      "بالغون ومراهقون وأهل — كل تجربة فريدة. هذه قصص من اختاروا ORALIGN وشاركوا تجربتهم.",
    ),
    featuredQuote: copy(
      "J'ai longtemps hésité à me lancer dans un traitement d'alignement dentaire à 42 ans. Les gouttières sont vraiment discrètes, je les porte au travail sans que personne ne remarque quoi que ce soit. En 8 mois, mes dents se sont alignées progressivement — exactement comme prévu sur la simulation 3D. Aujourd'hui, je souris sans retenue.",
      "I hesitated for a long time before starting aligner treatment at 42. The trays are genuinely discreet, and I wore them at work without anyone noticing. In eight months, my teeth aligned gradually — exactly as shown in the 3D simulation. Today, I smile without holding back.",
      "ترددت طويلاً قبل بدء علاج تقويم الأسنان في سن الثانية والأربعين. الأجهزة شفافة فعلاً وارتديتها في العمل دون أن يلاحظها أحد. خلال ثمانية أشهر انتظمت أسناني تدريجياً كما ظهر في المحاكاة ثلاثية الأبعاد. اليوم أبتسم دون تردد.",
    ),
    featuredName: copy("Sonia K.", "Sonia K.", "سونيا ك."),
    featuredMeta: copy("42 ans · Tunis · 8 mois", "42 · Tunis · 8 months", "42 سنة · تونس · 8 أشهر"),
  },
  filters: {
    all: copy("Tous", "All", "الكل"),
    adult: copy("Adultes", "Adults", "البالغون"),
    parent: copy("Parents", "Parents", "الأهل"),
    teen: copy("Adolescents", "Teenagers", "المراهقون"),
    done: copy("Terminés", "Completed", "مكتملة"),
    ongoing: copy("En cours", "In progress", "جارية"),
  } satisfies Record<Filter, Copy>,
  share: {
    eyebrow: copy("Votre histoire", "Your story", "قصتك"),
    title: copy("À votre tour de", "Now it is your turn to", "حان دورك لـ"),
    emphasis: copy("faire sourire.", "make someone smile.", "تجعل شخصاً يبتسم."),
    subtitle: copy(
      "Votre expérience peut aider une autre personne à franchir le pas. Choisissez le format qui vous ressemble le plus.",
      "Your experience can help someone else take the first step. Choose the format that feels most like you.",
      "قد تساعد تجربتك شخصاً آخر على اتخاذ الخطوة الأولى. اختر الصيغة الأقرب إليك.",
    ),
    formats: {
      photo: {
        label: copy("Témoignage photo", "Photo story", "شهادة مع صورة"),
        description: copy("Racontez votre parcours avec une ou plusieurs photos.", "Tell your journey with one or more photos.", "احكِ تجربتك مع صورة أو أكثر."),
        badge: copy("Avant / après", "Before / after", "قبل / بعد"),
      },
      text: {
        label: copy("Témoignage écrit", "Written story", "شهادة مكتوبة"),
        description: copy("Quelques lignes suffisent pour partager votre avis.", "A few lines are enough to share your experience.", "تكفي بضعة أسطر لمشاركة تجربتك."),
        badge: copy("Publication relue", "Reviewed before publishing", "مراجعة قبل النشر"),
      },
    } satisfies Record<Format, { label: Copy; description: Copy; badge: Copy }>,
    identityTitle: copy("À propos de vous", "About you", "معلومات عنك"),
    experienceTitle: copy("Votre expérience", "Your experience", "تجربتك"),
    firstName: copy("Prénom", "First name", "الاسم الأول"),
    initial: copy("Initiale du nom", "Last-name initial", "الحرف الأول من اللقب"),
    phone: copy("Téléphone", "Phone", "الهاتف"),
    email: copy("E-mail", "Email", "البريد الإلكتروني"),
    city: copy("Ville", "City", "المدينة"),
    role: copy("Vous témoignez en tant que", "You are sharing as", "أنت تشارك بصفتك"),
    choose: copy("Choisir", "Choose", "اختر"),
    adult: copy("Patient adulte", "Adult patient", "مريض بالغ"),
    parent: copy("Parent d'un enfant / adolescent", "Parent of a child / teenager", "ولي طفل أو مراهق"),
    teen: copy("Adolescent", "Teenager", "مراهق"),
    childTitle: copy("Informations sur l'enfant", "About your child", "معلومات عن الطفل"),
    childName: copy("Prénom de l'enfant", "Child's first name", "اسم الطفل"),
    childAge: copy("Âge de l'enfant", "Child's age", "عمر الطفل"),
    status: copy("Statut du traitement", "Treatment status", "حالة العلاج"),
    inProgress: copy("En cours", "In progress", "جارٍ"),
    completed: copy("Terminé", "Completed", "مكتمل"),
    why: copy("Pourquoi avez-vous choisi ORALIGN ?", "Why did you choose ORALIGN?", "لماذا اخترت ORALIGN؟"),
    journey: copy("Comment s'est déroulée l'expérience ?", "How was your experience?", "كيف كانت تجربتك؟"),
    satisfied: copy("Qu'est-ce qui vous a le plus satisfait ?", "What did you enjoy most?", "ما أكثر ما أعجبك؟"),
    message: copy("Un message pour ceux qui hésitent ?", "A message for someone still deciding?", "ماذا تقول لمن لا يزال متردداً؟"),
    photoLabel: copy("Vos photos", "Your photos", "صورك"),
    mediaLabel: copy("Votre média", "Your media", "ملفك"),
    upload: copy("Ajoutez vos photos", "Add your photos", "أضف صورك"),
    uploadHint: copy("JPG ou PNG · 10 Mo maximum par photo", "JPG or PNG · 10 MB maximum per photo", "JPG أو PNG · 10 ميغابايت كحد أقصى للصورة"),
    uploadProgress: copy("Téléversement", "Uploading", "جارٍ الرفع"),
    uploadProcessing: copy("Traitement sécurisé…", "Secure processing…", "جارٍ المعالجة الآمنة…"),
    selectedFiles: copy("fichier(s) sélectionné(s)", "file(s) selected", "ملف محدد"),
    previous: copy("Témoignage précédent", "Previous testimonial", "الشهادة السابقة"),
    next: copy("Témoignage suivant", "Next testimonial", "الشهادة التالية"),
    consent: copy("J'autorise ORALIGN à publier mon témoignage avec mon prénom et l'initiale de mon nom uniquement.", "I allow ORALIGN to publish my story using only my first name and last-name initial.", "أسمح لـ ORALIGN بنشر شهادتي باستخدام اسمي الأول والحرف الأول من لقبي فقط."),
    privacy: copy("Votre témoignage est relu par notre équipe. Aucune donnée n'est partagée avec des tiers.", "Your story is reviewed by our team. No data is shared with third parties.", "تتم مراجعة شهادتك من فريقنا ولا تتم مشاركة بياناتك مع أي طرف ثالث."),
    submit: copy("Je partage mon expérience", "Share my experience", "أشارك تجربتي"),
    success: copy("Merci pour votre témoignage !", "Thank you for sharing your story!", "شكراً لمشاركة شهادتك!"),
    successBody: copy("Notre équipe va relire votre message et vous recontactera si nécessaire.", "Our team will review your message and contact you if needed.", "سيراجع فريقنا رسالتك وسيتواصل معك عند الحاجة."),
  },
  cta: {
    eyebrow: copy("Prêt à commencer ?", "Ready to begin?", "هل أنت مستعد للبدء؟"),
    title: copy("Votre sourire pourrait être", "Your smile could be", "قد تكون ابتسامتك"),
    emphasis: copy("le prochain témoignage.", "the next story.", "الشهادة التالية."),
    body: copy(
      "Consultez votre dentiste ou orthodontiste pour savoir si ORALIGN est adapté à votre cas.",
      "Speak with your dentist or orthodontist to find out whether ORALIGN is right for you.",
      "استشر طبيب أسنانك أو أخصائي تقويم الأسنان لمعرفة ما إذا كان ORALIGN مناسباً لحالتك.",
    ),
    action: copy("Trouver un praticien ORALIGN", "Find an ORALIGN practitioner", "ابحث عن طبيب ORALIGN"),
  },
} as const;

type Story = {
  quote: Copy;
  name: Copy;
  meta: Copy;
  tags: Filter[];
  avatarClass: string;
};

type FeaturedSlide = {
  quote: Copy;
  name: Copy;
  meta: Copy;
};

const stories: Story[] = [
  {
    quote: copy(
      "Je travaille en relation client, impossible de porter un appareil visible. Avec ORALIGN, personne n'a rien remarqué pendant 10 mois. Résultat impeccable, confort au quotidien.",
      "I work with clients, so a visible appliance was not an option. With ORALIGN, nobody noticed for ten months. The result is excellent and everyday life stayed comfortable.",
      "أعمل في مجال يتطلب التواصل مع العملاء، لذلك لم يكن جهاز ظاهر خياراً مناسباً. مع ORALIGN لم يلاحظ أحد شيئاً خلال عشرة أشهر. النتيجة ممتازة والراحة يومية.",
    ),
    name: copy("Ahmed M.", "Ahmed M.", "أحمد م."),
    meta: copy("35 ans · Sfax · 18 gouttières", "35 · Sfax · 18 aligners", "35 سنة · صفاقس · 18 جهازاً"),
    tags: ["adult", "done"],
    avatarClass: "bg-emerald-500/10 text-emerald-700",
  },
  {
    quote: copy(
      "Ma fille de 14 ans refusait catégoriquement les bagues. Avec ORALIGN, elle porte ses gouttières sans complexe au lycée. Le lien en ligne nous permet de suivre ensemble sa progression.",
      "My 14-year-old daughter refused braces. With ORALIGN, she wears her aligners confidently at school. The online link lets us follow her progress together.",
      "كانت ابنتي ذات الأربعة عشر عاماً ترفض تقويماً ظاهراً. مع ORALIGN ترتدي أجهزتها بثقة في المدرسة، ونتمكن من متابعة تقدمها معاً عبر الرابط الرقمي.",
    ),
    name: copy("Nadia B.", "Nadia B.", "نادية ب."),
    meta: copy("Maman de Yasmine, 14 ans · Tunis", "Mother of Yasmine, 14 · Tunis", "والدة ياسمين، 14 سنة · تونس"),
    tags: ["parent", "teen", "ongoing"],
    avatarClass: "bg-fuchsia-500/10 text-fuchsia-700",
  },
  {
    quote: copy(
      "J'avais un diastème qui me gênait depuis toujours. En quelques mois, j'ai vu l'espace se fermer progressivement. Le résultat est naturel et je souris beaucoup plus sur les photos.",
      "I had a gap between my teeth that had bothered me for years. Within a few months, I watched it close gradually. The result looks natural and I smile much more in photos.",
      "كان الفراغ بين أسناني يزعجني منذ سنوات. خلال بضعة أشهر رأيت المسافة تضيق تدريجياً. النتيجة طبيعية وأبتسم أكثر في الصور.",
    ),
    name: copy("Lina H.", "Lina H.", "لينا ح."),
    meta: copy("29 ans · Sousse · 6 mois", "29 · Sousse · 6 months", "29 سنة · سوسة · 6 أشهر"),
    tags: ["adult", "done"],
    avatarClass: "bg-sky-500/10 text-sky-700",
  },
  {
    quote: copy(
      "Le plus rassurant a été de voir les étapes avant de commencer. Mon praticien a répondu à chaque question et le suivi m'a gardé motivé jusqu'au bout.",
      "Seeing the steps before starting was reassuring. My practitioner answered every question and the follow-up kept me motivated all the way through.",
      "كان من المطمئن رؤية المراحل قبل البدء. أجاب طبيبي عن كل أسئلتي وساعدتني المتابعة على الحفاظ على حماسي حتى النهاية.",
    ),
    name: copy("Youssef R.", "Youssef R.", "يوسف ر."),
    meta: copy("31 ans · Ariana · 9 mois", "31 · Ariana · 9 months", "31 سنة · أريانة · 9 أشهر"),
    tags: ["adult", "ongoing"],
    avatarClass: "bg-indigo-500/10 text-indigo-700",
  },
  {
    quote: copy(
      "Ma consultation a été simple et très claire. J'ai compris ce qui était possible pour mon sourire avant de prendre une décision.",
      "The consultation was simple and clear. I understood what was possible for my smile before making a decision.",
      "كانت الاستشارة بسيطة وواضحة جداً. فهمت ما يمكن تحقيقه لابتسامتي قبل اتخاذ القرار.",
    ),
    name: copy("Amel T.", "Amel T.", "أمل ت."),
    meta: copy("38 ans · Monastir · Consultation", "38 · Monastir · Consultation", "38 سنة · المنستير · استشارة"),
    tags: ["adult", "ongoing"],
    avatarClass: "bg-violet-500/10 text-violet-700",
  },
  {
    quote: copy(
      "Nous avons choisi ORALIGN Prime parce que le parcours était expliqué simplement. Notre fils est impliqué et nous savons toujours où nous en sommes.",
      "We chose ORALIGN Prime because the journey was explained clearly. Our son is involved and we always know where we stand.",
      "اخترنا ORALIGN Prime لأن المسار شُرح لنا ببساطة. ابننا مشارك ونعرف دائماً أين وصلنا.",
    ),
    name: copy("Meriem K.", "Meriem K.", "مريم ك."),
    meta: copy("Maman de Adam, 12 ans · Nabeul", "Mother of Adam, 12 · Nabeul", "والدة آدم، 12 سنة · نابل"),
    tags: ["parent", "teen", "done"],
    avatarClass: "bg-pink-500/10 text-pink-700",
  },
];

const filterOrder: Filter[] = ["all", "adult", "parent", "teen", "done", "ongoing"];
const caseImages = showcaseCases.slice(0, stories.length);

function text(value: Copy, lang: Lang) {
  return value[lang];
}

function Stars() {
  return (
    <div className="flex gap-1 text-[var(--sc-sun)]" aria-label="5/5">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star key={index} className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
      ))}
    </div>
  );
}

function Tag({ value, tone }: { value: string; tone?: string }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[0.58rem] font-medium uppercase tracking-[0.14em] ${tone ?? "border-[var(--sc-grey)] bg-[rgba(25,25,25,0.035)] text-[var(--sc-text-mid)]"}`}>
      {value}
    </span>
  );
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-2 ${className}`}>
      <span className="text-[0.62rem] font-medium uppercase tracking-[0.16em] text-[var(--sc-text-mid)]">{label}</span>
      {children}
    </label>
  );
}

const inputClass = "min-h-11 w-full rounded-sm border border-[var(--sc-grey)] bg-[var(--sc-white)] px-3.5 text-sm text-[var(--sc-black)] outline-none transition-colors placeholder:text-[var(--sc-text-mid)]/60 focus:border-[var(--sc-sun-deep)] focus:ring-2 focus:ring-[var(--sc-sun-3)]";

export function TemoignagesSection() {
  const { lang } = useShowcaseLang();
  const [activeFilter, setActiveFilter] = useState<Filter>("all");
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const approvedSubmissions = useApprovedCommunitySubmissions();
  const featuredSlides: FeaturedSlide[] = useMemo(() => [
    {
      quote: pageCopy.testimonials.featuredQuote,
      name: pageCopy.testimonials.featuredName,
      meta: pageCopy.testimonials.featuredMeta,
    },
    ...stories.slice(0, 3).map((story) => ({
      quote: story.quote,
      name: story.name,
      meta: story.meta,
    })),
  ], []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setFeaturedIndex((current) => (current + 1) % featuredSlides.length);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [featuredSlides.length]);

  const featuredSlide = featuredSlides[featuredIndex];
  const featuredInitials = text(featuredSlide.name, lang).split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  const visibleStories = useMemo(
    () => stories.filter((story) => activeFilter === "all" || story.tags.includes(activeFilter)),
    [activeFilter],
  );
  const visibleApprovedSubmissions = useMemo(
    () => (approvedSubmissions.data ?? []).filter((story) => {
      if (activeFilter === "all") return true;
      if (activeFilter === "adult") return story.role === CommunitySubmissionRole.ADULT;
      if (activeFilter === "parent") return story.role === CommunitySubmissionRole.PARENT;
      if (activeFilter === "teen") return story.role === CommunitySubmissionRole.TEEN;
      if (activeFilter === "done") return story.treatmentStatus === CommunitySubmissionTreatmentStatus.COMPLETED;
      return story.treatmentStatus === CommunitySubmissionTreatmentStatus.IN_PROGRESS;
    }),
    [activeFilter, approvedSubmissions.data],
  );

  return (
    <>
      <section
        id="communaute-hero"
        data-section-tone="dark"
        className="relative isolate flex min-h-[min(720px,calc(100svh-5rem))] items-center justify-center overflow-hidden bg-[var(--sc-black)] px-5 pb-28 pt-24 text-center text-[var(--sc-white)] sm:px-8 lg:px-12"
      >
        <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[min(82vw,620px)] w-[min(82vw,620px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(254,202,22,0.1)] opacity-70 [box-shadow:0_0_0_70px_rgba(254,202,22,0.018),0_0_0_140px_rgba(254,202,22,0.012)]" aria-hidden="true" />
        <div className="mx-auto max-w-3xl">
          <Reveal className="flex flex-col items-center">
            <div className="mb-6 flex items-center gap-3 text-[0.6rem] uppercase tracking-[0.4em] text-[var(--sc-sun)]">
              <span className="h-px w-7 bg-[var(--sc-sun)]" aria-hidden="true" />
              <span>{text(pageCopy.hero.eyebrow, lang)}</span>
              <span className="h-px w-7 bg-[var(--sc-sun)]" aria-hidden="true" />
            </div>
            <h1 className="sc-serif max-w-2xl text-[clamp(2.65rem,7vw,5.6rem)] font-normal leading-[0.98] tracking-[-0.03em]">
              {text(pageCopy.hero.title, lang).split("ORALIGN")[0]}
              <em className="text-[var(--sc-sun)]">ORALIGN.</em>
            </h1>
            <p className="mt-7 max-w-xl text-sm leading-7 text-[var(--sc-text-mid-on-dark)] sm:text-base">
              {text(pageCopy.hero.subtitle, lang)}
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <a href="#temoignages" className="inline-flex min-h-11 items-center justify-center gap-2 bg-[var(--sc-sun)] px-5 py-3 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--sc-black)] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--sc-sun)]">
                {text(pageCopy.hero.primary, lang)}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
              <a href="#partager" className="inline-flex min-h-11 items-center justify-center border border-[rgba(242,245,239,0.22)] px-5 py-3 text-[0.68rem] font-medium uppercase tracking-[0.16em] text-[var(--sc-white)] transition-colors hover:border-[var(--sc-sun)] hover:text-[var(--sc-sun)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--sc-sun)]">
                {text(pageCopy.hero.secondary, lang)}
              </a>
            </div>
          </Reveal>
        </div>
        <div className="absolute inset-x-0 bottom-0 grid grid-cols-1 border-t border-[rgba(242,245,239,0.08)] sm:grid-cols-3">
          {pageCopy.stats.map((stat) => (
            <div key={stat.label.en} className="flex items-center justify-center gap-3 border-b border-[rgba(242,245,239,0.08)] px-4 py-4 last:border-0 sm:border-b-0 sm:border-r sm:last:border-0">
              <span className="sc-serif text-2xl text-[var(--sc-sun)]">{stat.value}</span>
              <span className="text-[0.58rem] uppercase tracking-[0.15em] text-[var(--sc-text-mid-on-dark)]">{text(stat.label, lang)}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="temoignages" data-section-tone="light" className="bg-[var(--sc-white)] px-5 py-20 text-[var(--sc-black)] sm:px-8 sm:py-28 lg:px-12">
        <div className="mx-auto max-w-[1120px]">
          <Reveal>
            <SectionHeading eyebrow={text(pageCopy.testimonials.eyebrow, lang)} align="center" id="temoignages-title">
              {text(pageCopy.testimonials.title, lang)} <em className="font-normal italic text-[var(--sc-sun-deep)]">{text(pageCopy.testimonials.emphasis, lang)}</em>
            </SectionHeading>
            <p className="mx-auto mt-5 max-w-xl text-center text-sm leading-7 text-[var(--sc-text-mid)]">{text(pageCopy.testimonials.subtitle, lang)}</p>
          </Reveal>

          <Reveal delay>
            <article className="relative mt-14 overflow-hidden bg-[var(--sc-black)] p-6 text-[var(--sc-white)] sm:p-9 lg:p-12" aria-live="polite">
              <div className="pointer-events-none absolute right-5 top-0 font-serif text-[9rem] leading-none text-[rgba(254,202,22,0.08)]" aria-hidden="true">“</div>
              <Stars />
              <p className="relative mt-5 min-h-[8.5rem] max-w-4xl text-lg italic leading-8 text-[var(--sc-white)] sm:min-h-36 sm:text-xl sm:leading-9">“{text(featuredSlide.quote, lang)}”</p>
              <div className="mt-8 flex items-center gap-3 border-t border-[rgba(242,245,239,0.12)] pt-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(254,202,22,0.12)] text-xs font-bold text-[var(--sc-sun)]">{featuredInitials}</div>
                <div>
                  <p className="text-sm font-medium">{text(featuredSlide.name, lang)}</p>
                  <p className="text-xs text-[var(--sc-text-mid-on-dark)]">{text(featuredSlide.meta, lang)}</p>
                </div>
                <div className="ml-auto flex items-center gap-1.5" aria-label={text(pageCopy.testimonials.eyebrow, lang)}>
                  <button type="button" aria-label={text(pageCopy.share.previous, lang)} onClick={() => setFeaturedIndex((current) => (current - 1 + featuredSlides.length) % featuredSlides.length)} className="grid h-9 w-9 place-items-center border border-[rgba(242,245,239,0.2)] text-lg transition-colors hover:border-[var(--sc-sun)] hover:text-[var(--sc-sun)] focus-visible:outline-2 focus-visible:outline-[var(--sc-sun)]">‹</button>
                  <div className="hidden gap-1.5 sm:flex" role="tablist">
                    {featuredSlides.map((slide, index) => <button key={slide.name.en} type="button" role="tab" aria-selected={featuredIndex === index} aria-label={`Testimonial ${index + 1}`} onClick={() => setFeaturedIndex(index)} className={`h-1.5 rounded-full transition-all ${featuredIndex === index ? "w-7 bg-[var(--sc-sun)]" : "w-1.5 bg-[rgba(242,245,239,0.35)]"}`} />)}
                  </div>
                  <button type="button" aria-label={text(pageCopy.share.next, lang)} onClick={() => setFeaturedIndex((current) => (current + 1) % featuredSlides.length)} className="grid h-9 w-9 place-items-center border border-[rgba(242,245,239,0.2)] text-lg transition-colors hover:border-[var(--sc-sun)] hover:text-[var(--sc-sun)] focus-visible:outline-2 focus-visible:outline-[var(--sc-sun)]">›</button>
                </div>
              </div>
            </article>
          </Reveal>

          <div className="mt-10 flex flex-wrap justify-center gap-2" role="tablist" aria-label={text(pageCopy.testimonials.eyebrow, lang)}>
            {filterOrder.map((filter) => {
              const selected = activeFilter === filter;
              return (
                <button
                  key={filter}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveFilter(filter)}
                  className={`min-h-10 rounded-sm border px-4 py-2 text-[0.62rem] font-medium uppercase tracking-[0.16em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-sun-deep)] ${selected ? "border-[var(--sc-black)] bg-[var(--sc-black)] text-[var(--sc-white)]" : "border-[var(--sc-grey)] bg-transparent text-[var(--sc-text-mid)] hover:border-[var(--sc-black)] hover:text-[var(--sc-black)]"}`}
                >
                  {text(pageCopy.filters[filter], lang)}
                </button>
              );
            })}
          </div>

          <div className="mt-7 grid gap-4 md:grid-cols-2" aria-live="polite">
            {visibleStories.map((story) => {
              const item = caseImages[stories.indexOf(story)] ?? showcaseCases[0];
              return (
                <article key={story.name.en} className="group flex flex-col overflow-hidden border border-[var(--sc-grey)] bg-[var(--sc-white)] transition-colors hover:border-[var(--sc-sun-deep)]">
                  <div className="relative aspect-[16/8] overflow-hidden border-b border-[var(--sc-grey)] bg-[var(--sc-grey)]">
                    <Image src={item.after} alt={`${item.shortTitle[lang]} — ORALIGN`} fill quality={85} sizes="(min-width: 768px) 50vw, 100vw" className="object-cover object-center transition-transform duration-500 group-hover:scale-[1.02]" />
                    <span className="absolute left-4 top-4 bg-[var(--sc-white)]/90 px-2.5 py-1 text-[0.56rem] font-medium uppercase tracking-[0.14em] text-[var(--sc-black)]">{item.shortTitle[lang]}</span>
                  </div>
                  <div className="flex flex-1 flex-col p-6 sm:p-7">
                    <Stars />
                    <p className="mt-4 flex-1 text-[0.94rem] italic leading-7 text-[var(--sc-black)]">“{text(story.quote, lang)}”</p>
                    <div className="mt-6 flex flex-wrap gap-2">
                      {story.tags.map((tag) => (
                        <Tag key={tag} value={text(pageCopy.filters[tag], lang)} tone={tag === "done" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : tag === "ongoing" ? "border-[var(--sc-sun)]/25 bg-[var(--sc-sun-3)] text-[var(--sc-sun-deep)]" : "border-[var(--sc-grey)] bg-[rgba(25,25,25,0.035)] text-[var(--sc-text-mid)]"} />
                      ))}
                    </div>
                    <div className="mt-6 flex items-center gap-3 border-t border-[var(--sc-grey)] pt-4">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${story.avatarClass}`}>{text(story.name, lang).slice(0, 2).toUpperCase()}</div>
                      <div>
                        <p className="text-sm font-medium">{text(story.name, lang)}</p>
                        <p className="text-xs text-[var(--sc-text-mid)]">{text(story.meta, lang)}</p>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
            {visibleApprovedSubmissions.map((story) => {
              const media = story.media[0];
              const mediaUrl = media ? getAvatarUrl(media.relativePath) : null;
              const statusLabel = story.treatmentStatus === CommunitySubmissionTreatmentStatus.COMPLETED
                ? text(pageCopy.filters.done, lang)
                : text(pageCopy.filters.ongoing, lang);
              return (
                <article key={story.id} className="group flex flex-col overflow-hidden border border-[var(--sc-grey)] bg-[var(--sc-white)] transition-colors hover:border-[var(--sc-sun-deep)]">
                  {mediaUrl ? (
                    <div className="relative aspect-[16/8] overflow-hidden border-b border-[var(--sc-grey)] bg-[var(--sc-grey)]">
                      {media.mimeType.startsWith("video/") ? (
                        <video src={mediaUrl} controls preload="metadata" className="h-full w-full object-cover" aria-label={`${story.firstName} — ORALIGN`} />
                      ) : (
                        <img src={mediaUrl} alt={`${story.firstName} — ORALIGN`} loading="lazy" className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.02]" />
                      )}
                      <span className="absolute left-4 top-4 bg-[var(--sc-white)]/90 px-2.5 py-1 text-[0.56rem] font-medium uppercase tracking-[0.14em] text-[var(--sc-black)]">ORALIGN</span>
                    </div>
                  ) : null}
                  <div className="flex flex-1 flex-col p-6 sm:p-7">
                    <Stars />
                    <p className="mt-4 flex-1 text-[0.94rem] italic leading-7 text-[var(--sc-black)]">“{story.message || story.journey}”</p>
                    <div className="mt-6 flex flex-wrap gap-2">
                      <Tag value={statusLabel} tone={story.treatmentStatus === CommunitySubmissionTreatmentStatus.COMPLETED ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[var(--sc-sun)]/25 bg-[var(--sc-sun-3)] text-[var(--sc-sun-deep)]"} />
                      {story.city ? <Tag value={story.city} /> : null}
                    </div>
                    <div className="mt-6 flex items-center gap-3 border-t border-[var(--sc-grey)] pt-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--sc-sun-3)] text-xs font-bold text-[var(--sc-sun-deep)]">{`${story.firstName}${story.lastNameInitial}`.slice(0, 2).toUpperCase()}</div>
                      <div>
                        <p className="text-sm font-medium">{story.firstName} {story.lastNameInitial}</p>
                        <p className="text-xs text-[var(--sc-text-mid)]">{story.city || "ORALIGN"}</p>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}

export function PartagerSection() {
  const { lang } = useShowcaseLang();
  const [format, setFormat] = useState<Format>("photo");
  const [role, setRole] = useState("");
  const [photoName, setPhotoName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const createSubmission = useCreateCommunitySubmission();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const value = (name: string) => String(values.get(name) ?? "").trim();
    const childAge = value("childAge");
    setUploadProgress(mediaFiles.length ? 0 : null);
    createSubmission.mutate({ input: {
        format: format as CommunitySubmissionFormat,
        firstName: value("firstName"),
        lastNameInitial: value("lastNameInitial"),
        phone: value("phone"),
        email: value("email"),
        city: value("city") || undefined,
        role: value("role") as CommunitySubmissionRole,
        childName: value("childName") || undefined,
        childAge: childAge ? Number(childAge) : undefined,
        treatmentStatus: value("treatmentStatus") as CommunitySubmissionTreatmentStatus,
        why: value("why"),
        journey: value("journey"),
        satisfied: value("satisfied") || undefined,
        message: value("message") || undefined,
        consent: values.get("consent") === "on",
        contactConsent: values.get("contactConsent") === "on",
        media: mediaFiles,
      }, onProgress: setUploadProgress }, {
      onSuccess: () => {
        setSubmitted(true);
        setMediaFiles([]);
        setPhotoName("");
        setUploadProgress(null);
        form.reset();
        setRole("");
        setFormat("photo");
      },
      onError: () => setUploadProgress(null),
    });
  };

  const formatIcons: Record<Format, ComponentType<{ className?: string }>> = {
    photo: ImageIcon,
    text: PenLine,
  };
  const FormatIcon = formatIcons[format];

  return (
    <section id="partager" data-section-tone="light" className="bg-[rgba(25,25,25,0.025)] px-5 py-20 text-[var(--sc-black)] sm:px-8 sm:py-28 lg:px-12">
      <div className="mx-auto max-w-[920px]">
        <Reveal>
          <SectionHeading eyebrow={text(pageCopy.share.eyebrow, lang)} align="center" id="partager-title">
            {text(pageCopy.share.title, lang)} <em className="font-normal italic text-[var(--sc-sun-deep)]">{text(pageCopy.share.emphasis, lang)}</em>
          </SectionHeading>
          <p className="mx-auto mt-5 max-w-xl text-center text-sm leading-7 text-[var(--sc-text-mid)]">{text(pageCopy.share.subtitle, lang)}</p>
        </Reveal>

        <Reveal delay>
          <form onSubmit={handleSubmit} className="mt-12 border border-[var(--sc-grey)] bg-[var(--sc-white)] p-5 sm:p-8 lg:p-10">
            <div className="mb-10 grid gap-3 md:grid-cols-2">
              {(Object.keys(pageCopy.share.formats) as Format[]).map((item) => {
                const selected = format === item;
                const Icon = formatIcons[item];
                return (
                  <button key={item} type="button" onClick={() => { setFormat(item); setSubmitted(false); setMediaFiles([]); setPhotoName(""); }} className={`relative flex min-h-36 flex-col items-center justify-center border-2 p-5 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-sun-deep)] ${selected ? "border-[var(--sc-sun)] bg-[var(--sc-sun-3)]" : "border-[var(--sc-grey)] hover:border-[var(--sc-sun-deep)]"}`} aria-pressed={selected}>
                    {selected ? <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--sc-sun)] text-[var(--sc-black)]"><Check className="h-3.5 w-3.5" /></span> : null}
                    <Icon className="h-7 w-7 text-[var(--sc-sun-deep)]" aria-hidden="true" />
                    <span className="mt-3 text-sm font-medium">{text(pageCopy.share.formats[item].label, lang)}</span>
                    <span className="mt-1 text-xs leading-5 text-[var(--sc-text-mid)]">{text(pageCopy.share.formats[item].description, lang)}</span>
                    <span className="mt-3 rounded-full bg-[var(--sc-sun-3)] px-2.5 py-1 text-[0.56rem] uppercase tracking-[0.12em] text-[var(--sc-sun-deep)]">{text(pageCopy.share.formats[item].badge, lang)}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3 border-b border-[var(--sc-grey)] pb-3">
              <Sparkles className="h-4 w-4 text-[var(--sc-sun-deep)]" aria-hidden="true" />
              <h3 className="sc-serif text-xl">{text(pageCopy.share.identityTitle, lang)}</h3>
            </div>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Field label={`${text(pageCopy.share.firstName, lang)} *`}><input name="firstName" className={inputClass} required placeholder={text(pageCopy.share.firstName, lang)} /></Field>
              <Field label={`${text(pageCopy.share.initial, lang)} *`}><input name="lastNameInitial" className={inputClass} required maxLength={2} placeholder="B." /></Field>
              <Field label={`${text(pageCopy.share.phone, lang)} *`}><input name="phone" className={inputClass} required type="tel" placeholder="+216 98 000 000" /></Field>
              <Field label={`${text(pageCopy.share.email, lang)} *`}><input name="email" className={inputClass} required type="email" placeholder="vous@email.com" /></Field>
              <Field label={text(pageCopy.share.city, lang)}><input name="city" className={inputClass} placeholder={text(pageCopy.share.city, lang)} /></Field>
              <Field label={`${text(pageCopy.share.role, lang)} *`}><select name="role" className={inputClass} required value={role} onChange={(event) => setRole(event.target.value)}><option value="">{text(pageCopy.share.choose, lang)}</option><option value="adult">{text(pageCopy.share.adult, lang)}</option><option value="parent">{text(pageCopy.share.parent, lang)}</option><option value="teen">{text(pageCopy.share.teen, lang)}</option></select></Field>
            </div>

            {role === "parent" ? (
              <div className="mt-7 border-l-2 border-[var(--sc-sun)] pl-4">
                <h4 className="sc-serif text-base">{text(pageCopy.share.childTitle, lang)}</h4>
                <div className="mt-4 grid gap-5 sm:grid-cols-2">
                  <Field label={`${text(pageCopy.share.childName, lang)} *`}><input name="childName" className={inputClass} required={role === "parent"} /></Field>
                  <Field label={text(pageCopy.share.childAge, lang)}><input name="childAge" className={inputClass} type="number" min={1} max={21} /></Field>
                </div>
              </div>
            ) : null}

            <div className="mt-9 flex items-center gap-3 border-b border-[var(--sc-grey)] pb-3">
              <PenLine className="h-4 w-4 text-[var(--sc-sun-deep)]" aria-hidden="true" />
              <h3 className="sc-serif text-xl">{text(pageCopy.share.experienceTitle, lang)}</h3>
            </div>
            <div className="mt-5 space-y-5">
              <Field label={text(pageCopy.share.message, lang)}>
                <textarea name="message" className={`${inputClass} min-h-36 resize-y py-3`} placeholder={text(pageCopy.testimonials.featuredQuote, lang)} />
              </Field>
              <Field label={`${text(pageCopy.share.status, lang)} *`}>
                <div className="flex flex-wrap gap-5 pt-1">
                  {["inProgress", "completed"].map((value) => (
                    <label key={value} className="inline-flex min-h-11 items-center gap-2 text-sm">
                      <input type="radio" name="treatmentStatus" value={value === "inProgress" ? "in_progress" : "completed"} required className="h-4 w-4 accent-[var(--sc-sun-deep)]" />
                      {text(pageCopy.share[value as "inProgress" | "completed"], lang)}
                    </label>
                  ))}
                </div>
              </Field>
              <Field label={`${text(pageCopy.share.why, lang)} *`}><textarea name="why" className={`${inputClass} min-h-28 resize-y py-3`} required placeholder={text(pageCopy.share.why, lang)} /></Field>
              <Field label={`${text(pageCopy.share.journey, lang)} *`}><textarea name="journey" className={`${inputClass} min-h-28 resize-y py-3`} required placeholder={text(pageCopy.share.journey, lang)} /></Field>
              <Field label={text(pageCopy.share.satisfied, lang)}><textarea name="satisfied" className={`${inputClass} min-h-20 resize-y py-3`} placeholder={text(pageCopy.share.satisfied, lang)} /></Field>
              {format === "photo" ? (
                <div className="border-t border-[var(--sc-grey)] pt-6">
                  <div className="mb-4 flex items-center gap-3">
                    <UploadCloud className="h-4 w-4 text-[var(--sc-sun-deep)]" aria-hidden="true" />
                    <h4 className="sc-serif text-xl">{text(pageCopy.share.mediaLabel, lang)}</h4>
                  </div>
                  <Field label={text(pageCopy.share.photoLabel, lang)}>
                    <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-sm border-2 border-dashed border-[var(--sc-grey)] px-5 text-center transition-colors hover:border-[var(--sc-sun-deep)]">
                    <UploadCloud className="h-7 w-7 text-[var(--sc-sun-deep)]" aria-hidden="true" />
                    <span className="mt-3 text-sm font-medium">{photoName || text(pageCopy.share.upload, lang)}</span>
                    <span className="mt-1 text-xs text-[var(--sc-text-mid)]">{text(pageCopy.share.uploadHint, lang)}</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(event) => { const files = Array.from(event.target.files ?? []); setMediaFiles(files); setUploadProgress(null); setPhotoName(files.length > 1 ? `${files.length} ${text(pageCopy.share.selectedFiles, lang)}` : files[0]?.name ?? ""); }} />
                    </label>
                  </Field>
                  {uploadProgress !== null ? <div className="mt-4" role="status" aria-live="polite">
                    <div className="mb-2 flex items-center justify-between text-xs text-[var(--sc-text-mid)]"><span>{uploadProgress >= 100 ? text(pageCopy.share.uploadProcessing, lang) : text(pageCopy.share.uploadProgress, lang)}</span><span>{uploadProgress}%</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--sc-grey)]"><div className="h-full rounded-full bg-[var(--sc-sun-deep)] transition-[width] duration-200" style={{ width: `${Math.max(uploadProgress, 2)}%` }} /></div>
                  </div> : null}
                </div>
              ) : null}
            </div>

            <div className="mt-8 space-y-4 border-t border-[var(--sc-grey)] pt-6">
              <label className="flex items-start gap-3 text-sm leading-6 text-[var(--sc-text-mid)]"><input name="consent" type="checkbox" required className="mt-1 h-4 w-4 shrink-0 accent-[var(--sc-sun-deep)]" />{text(pageCopy.share.consent, lang)}</label>
              <div className="flex items-start gap-3 text-xs leading-5 text-[var(--sc-text-mid)]"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--sc-sun-deep)]" aria-hidden="true" />{text(pageCopy.share.privacy, lang)}</div>
            </div>

            <button type="submit" disabled={createSubmission.isPending} className="mt-8 inline-flex min-h-11 items-center gap-2 bg-[var(--sc-sun)] px-5 py-3 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--sc-black)] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--sc-sun-deep)] disabled:cursor-wait disabled:opacity-60">
              {submitted ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <FormatIcon className="h-4 w-4" aria-hidden="true" />}
              {createSubmission.isPending ? "…" : submitted ? text(pageCopy.share.success, lang) : text(pageCopy.share.submit, lang)}
            </button>
            {submitted ? <div className="mt-4 border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800"><p className="font-medium">{text(pageCopy.share.success, lang)}</p><p className="mt-1 text-xs leading-5">{text(pageCopy.share.successBody, lang)}</p></div> : null}
          </form>
        </Reveal>
      </div>
    </section>
  );
}

export function CommunauteCta() {
  const { lang } = useShowcaseLang();
  return (
    <section data-section-tone="light" className="relative overflow-hidden bg-[var(--sc-white)] px-5 py-20 text-center text-[var(--sc-black)] sm:px-8 sm:py-28 lg:px-12">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--sc-sun-3)] blur-3xl" aria-hidden="true" />
      <Reveal className="relative mx-auto max-w-2xl">
        <div className="mb-5 flex items-center justify-center gap-3 text-[0.6rem] uppercase tracking-[0.4em] text-[var(--sc-text-mid)]"><span className="h-px w-7 bg-[var(--sc-text-mid)]" aria-hidden="true" />{text(pageCopy.cta.eyebrow, lang)}<span className="h-px w-7 bg-[var(--sc-text-mid)]" aria-hidden="true" /></div>
        <h2 className="sc-serif text-[clamp(2rem,4.5vw,3.8rem)] font-normal leading-[1.05]">{text(pageCopy.cta.title, lang)}<br /><em className="font-normal italic">{text(pageCopy.cta.emphasis, lang)}</em></h2>
        <p className="mx-auto mt-5 max-w-lg text-sm leading-7 text-[var(--sc-text-mid)]">{text(pageCopy.cta.body, lang)}</p>
        <a href="/trouver-un-praticien" className="mt-8 inline-flex min-h-11 items-center gap-2 bg-[var(--sc-black)] px-5 py-3 text-[0.68rem] font-medium uppercase tracking-[0.16em] text-[var(--sc-white)] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--sc-black)]">{text(pageCopy.cta.action, lang)}<ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
      </Reveal>
    </section>
  );
}

"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Lang } from "../../_lib/i18n/dict";
import { useShowcaseLang } from "../../_lib/i18n/lang-context";
import { Reveal } from "../shared/reveal";

/**
 * Sections of the "Oralign ou Invisalign" comparison page
 * (/oralign-ou-invisalign). Text only — no imagery, no figures, and no
 * claim about another brand beyond what is publicly verifiable. The page
 * exists to send the visitor to a practitioner with the right questions,
 * not to win a comparison on a website.
 */

type Item = { title: string; body: string };

const comparatifCopy: Record<
  Lang,
  {
    hero: { eyebrow: string; title: string; lede: string; note: string };
    common: { eyebrow: string; title: string; intro: string; items: Item[] };
    oralign: { eyebrow: string; title: string; intro: string; items: Item[] };
    decides: { eyebrow: string; title: string; intro: string; items: Item[] };
    questions: {
      eyebrow: string;
      title: string;
      intro: string;
      items: string[];
      closing: string;
    };
    cta: { eyebrow: string; title: string; body: string; action: string };
  }
> = {
  fr: {
    hero: {
      eyebrow: "COMPARER SANS SE TROMPER",
      title: "Oralign ou Invisalign : quelles différences ?",
      lede: "Ce sont deux systèmes d’aligneurs transparents amovibles, prescrits et suivis par un professionnel dentaire. Cette page explique ce qu’ils ont en commun, ce qui est propre à Oralign, et surtout ce qui détermine réellement le déroulement d’un traitement. La comparaison utile pour votre cas, elle, se fait en consultation — pas sur un site web.",
      note: "Invisalign® est une marque déposée d’Align Technology, Inc. Oralign n’est ni affilié à cette société ni partenaire de celle-ci. Nous ne décrivons ici que ce qui est publiquement connu et ne portons aucun jugement sur les produits d’un tiers.",
    },
    common: {
      eyebrow: "LE SOCLE COMMUN",
      title: "Ce que tout système d’aligneurs sérieux a en commun.",
      intro:
        "Avant de comparer des marques, il est utile de savoir ce qui ne change pas d’un système à l’autre. Ces éléments-là ne dépendent pas du nom inscrit sur la boîte, et ce sont eux qui structurent un traitement.",
      items: [
        {
          title: "Une prescription dentaire",
          body: "Un aligneur n’est pas un article que l’on commande seul. Un examen clinique, des empreintes ou un scan et, si le praticien le juge nécessaire, une imagerie précèdent tout plan de traitement. C’est lui qui pose l’indication, et lui seul.",
        },
        {
          title: "Un plan de traitement numérique",
          body: "Les mouvements dentaires sont planifiés étape par étape sur un modèle en trois dimensions, puis traduits en une série de gouttières. La planification reste un outil : le praticien la valide, l’ajuste et la corrige en cours de route.",
        },
        {
          title: "Une discipline de port",
          body: "Les gouttières ne travaillent que lorsqu’elles sont en bouche. Le temps de port quotidien indiqué par votre praticien est le facteur que vous maîtrisez le plus directement — et l’un des plus déterminants pour que les étapes s’enchaînent comme prévu.",
        },
        {
          title: "Une contention après le traitement",
          body: "Les dents conservent une tendance naturelle à revenir vers leur position d’origine. Quel que soit le système utilisé, une contention est nécessaire pour stabiliser le résultat, selon les modalités et la durée que votre praticien détermine.",
        },
      ],
    },
    oralign: {
      eyebrow: "CE QUI NOUS EST PROPRE",
      title: "Ce qu’Oralign peut dire de lui-même, et rien de plus.",
      intro:
        "Nous ne commentons pas les produits des autres : nous n’avons pas accès à leurs dossiers cliniques et il serait malhonnête de faire semblant. En revanche, voici ce qui est factuellement vérifiable chez nous, et que vous pouvez confronter à ce que votre praticien vous propose.",
      items: [
        {
          title: "Conçu en Allemagne, fabriqué en Tunisie",
          body: "La conception du système est allemande ; la production des gouttières est réalisée en Tunisie. Le laboratoire se trouve donc dans le même pays que le patient et que le cabinet qui le suit.",
        },
        {
          title: "Une chaîne courte entre le cabinet et le laboratoire",
          body: "Produire localement raccourcit les échanges entre votre praticien et le laboratoire. Les questions sur un plan de traitement, un ajustement ou une reprise se traitent dans le même pays, dans le même fuseau horaire, entre interlocuteurs joignables.",
        },
        {
          title: "Prescrit et supervisé par un praticien",
          body: "Oralign ne vend pas d’aligneurs directement au public. Un traitement Oralign passe obligatoirement par un dentiste ou un orthodontiste, qui établit le diagnostic, valide le plan et assure le suivi jusqu’à la contention.",
        },
        {
          title: "Un accompagnement en arabe, en français et en anglais",
          body: "Les documents remis, l’assistance et l’interface de suivi existent dans les trois langues, pour que le patient comme le cabinet puissent parler du traitement dans la langue qui leur est naturelle.",
        },
      ],
    },
    decides: {
      eyebrow: "L’ESSENTIEL",
      title: "La marque compte moins que la personne qui vous suit.",
      intro:
        "C’est la phrase que la plupart des comparatifs en ligne évitent d’écrire, parce qu’elle ne vend rien. Elle reste pourtant la plus vraie : à système équivalent, ce sont le diagnostic, la qualité du suivi et votre régularité qui font la différence entre un traitement qui se déroule bien et un traitement qui dérive.",
      items: [
        {
          title: "Le diagnostic",
          body: "Une même gêne peut relever de plusieurs approches. Certaines situations se traitent bien par aligneurs, d’autres appellent une autre solution, un soin préalable ou un avis spécialisé. Ce tri se fait à l’examen, jamais au catalogue.",
        },
        {
          title: "La régularité du suivi",
          body: "Les contrôles servent à vérifier que les dents suivent effectivement le plan et à réagir tôt lorsque ce n’est pas le cas. Demandez qui vous reverra, à quelle fréquence, et ce qui est prévu si une étape ne se passe pas comme annoncé.",
        },
        {
          title: "Votre part du travail",
          body: "Porter les gouttières le temps demandé, respecter l’ordre des étapes, signaler rapidement ce qui gêne, tenir l’hygiène quotidienne : cette part-là ne s’achète avec aucune marque, et aucun système ne peut la faire à votre place.",
        },
      ],
    },
    questions: {
      eyebrow: "EN CONSULTATION",
      title: "Les questions qui font une vraie comparaison.",
      intro:
        "Emportez-les chez votre praticien. Elles sont plus utiles qu’un comparatif en ligne, parce que les réponses porteront sur votre bouche et non sur une moyenne.",
      items: [
        "Mon cas relève-t-il des aligneurs transparents, et pour quelles raisons cliniques ?",
        "Quels systèmes proposez-vous, et lequel vous paraît le plus adapté à ma situation ?",
        "Qui établit le plan de traitement, et qui le valide avant que la fabrication ne commence ?",
        "Que comprend exactement le devis : les gouttières, les contrôles, les éventuelles reprises, la contention ?",
        "À quelle fréquence serai-je revu, et que se passe-t-il si une étape ne se déroule pas comme prévu ?",
        "Quelle contention est prévue à la fin du traitement, et pendant combien de temps devrai-je la porter ?",
      ],
      closing:
        "Si une réponse reste floue, demandez qu’on vous l’écrive. Un praticien qui prend le temps de vous expliquer ce qu’il ne peut pas promettre est généralement celui à qui l’on peut faire confiance.",
    },
    cta: {
      eyebrow: "PROCHAINE ÉTAPE",
      title: "La bonne comparaison se fait en cabinet.",
      body: "Un praticien formé regarde vos dents, écoute ce qui vous gêne, et vous dit ce qui est envisageable — avec Oralign ou autrement. C’est la seule comparaison qui tienne compte de votre bouche.",
      action: "Trouver un praticien",
    },
  },
  en: {
    hero: {
      eyebrow: "COMPARE WITH CLEAR EYES",
      title: "Oralign or Invisalign: what are the differences?",
      lede: "Both are removable clear aligner systems, prescribed and supervised by a dental professional. This page sets out what they have in common, what is specific to Oralign, and above all what actually shapes how a treatment unfolds. The comparison that matters for your case is made in the practice — not on a website.",
      note: "Invisalign® is a registered trademark of Align Technology, Inc. Oralign is neither affiliated with nor a partner of that company. We describe here only what is publicly known, and we pass no judgement on another company's products.",
    },
    common: {
      eyebrow: "COMMON GROUND",
      title: "What every serious aligner system has in common.",
      intro:
        "Before comparing brands, it helps to know what does not change from one system to another. These points do not depend on the name printed on the box, and they are what actually structures a treatment.",
      items: [
        {
          title: "A dental prescription",
          body: "An aligner is not something you order on your own. A clinical examination, impressions or a scan and, where the practitioner judges it necessary, imaging come before any treatment plan. The practitioner establishes the indication, and no one else.",
        },
        {
          title: "A digital treatment plan",
          body: "Tooth movements are planned step by step on a three-dimensional model, then translated into a series of trays. The plan remains a tool: the practitioner approves it, adjusts it and corrects it along the way.",
        },
        {
          title: "Wearing discipline",
          body: "Aligners only work while they are in the mouth. The daily wear time your practitioner sets is the factor you control most directly — and one of the most decisive in keeping the steps running as planned.",
        },
        {
          title: "Retention after treatment",
          body: "Teeth keep a natural tendency to drift back toward their original position. Whatever system is used, retention is needed to stabilise the result, in the form and for the period your practitioner determines.",
        },
      ],
    },
    oralign: {
      eyebrow: "WHAT IS SPECIFIC TO ORALIGN",
      title: "What Oralign can say about itself, and nothing more.",
      intro:
        "We do not comment on other companies' products: we have no access to their clinical records and it would be dishonest to pretend otherwise. What follows is what is factually verifiable about us, so you can weigh it against what your practitioner proposes.",
      items: [
        {
          title: "Designed in Germany, manufactured in Tunisia",
          body: "The system is designed in Germany; the aligners are produced in Tunisia. The lab therefore sits in the same country as the patient and as the practice following them.",
        },
        {
          title: "A short chain between practice and lab",
          body: "Producing locally shortens the exchanges between your practitioner and the lab. Questions about a treatment plan, an adjustment or a refinement are handled in the same country, in the same time zone, between people who can be reached.",
        },
        {
          title: "Prescribed and supervised by a practitioner",
          body: "Oralign does not sell aligners directly to the public. An Oralign treatment always goes through a dentist or an orthodontist, who makes the diagnosis, approves the plan and follows the case through to retention.",
        },
        {
          title: "Support in Arabic, French and English",
          body: "The documents you are given, the support and the follow-up interface all exist in the three languages, so that patient and practice alike can discuss the treatment in the language that comes naturally to them.",
        },
      ],
    },
    decides: {
      eyebrow: "WHAT ACTUALLY MATTERS",
      title: "The brand matters less than the person following your case.",
      intro:
        "It is the sentence most online comparisons avoid writing, because it sells nothing. It remains the truest one: with comparable systems, it is the diagnosis, the quality of the follow-up and your own consistency that separate a treatment that runs well from one that drifts.",
      items: [
        {
          title: "The diagnosis",
          body: "The same complaint can call for several approaches. Some situations are well suited to aligners, others call for a different solution, prior care or a specialist opinion. That sorting happens at the examination, never from a catalogue.",
        },
        {
          title: "Consistent follow-up",
          body: "Check-ups exist to verify that the teeth are actually tracking the plan and to react early when they are not. Ask who will see you again, how often, and what happens if a step does not go as announced.",
        },
        {
          title: "Your own share of the work",
          body: "Wearing the trays for the time asked, respecting the order of the steps, reporting discomfort quickly, keeping up daily hygiene: that share cannot be bought with any brand, and no system can do it for you.",
        },
      ],
    },
    questions: {
      eyebrow: "AT YOUR APPOINTMENT",
      title: "The questions that make a real comparison.",
      intro:
        "Take them with you to your practitioner. They are more useful than any online comparison, because the answers will be about your mouth rather than about an average.",
      items: [
        "Is my case suited to clear aligners, and for what clinical reasons?",
        "Which systems do you offer, and which one seems best suited to my situation?",
        "Who builds the treatment plan, and who approves it before manufacturing begins?",
        "What exactly does the quote include: the aligners, the check-ups, any refinements, the retainers?",
        "How often will I be seen again, and what happens if a step does not go as planned?",
        "What retention is planned at the end of treatment, and how long will I need to wear it?",
      ],
      closing:
        "If an answer stays vague, ask for it in writing. A practitioner who takes the time to explain what they cannot promise is usually the one worth trusting.",
    },
    cta: {
      eyebrow: "NEXT STEP",
      title: "The right comparison happens in the practice.",
      body: "A trained practitioner looks at your teeth, listens to what bothers you, and tells you what is realistic — with Oralign or otherwise. It is the only comparison that takes your mouth into account.",
      action: "Find a practitioner",
    },
  },
  ar: {
    hero: {
      eyebrow: "مقارنة بعين واضحة",
      title: "ORALIGN أم Invisalign: ما الفرق؟",
      lede: "كلاهما نظام تقويم شفاف قابل للنزع، يصفه طبيب أسنان ويشرف عليه. توضّح هذه الصفحة ما يشترك فيه النظامان، وما يخصّ ORALIGN تحديداً، وقبل كل شيء ما يحدّد فعلياً سير العلاج. أما المقارنة المفيدة لحالتك فتتمّ في العيادة، لا على موقع إلكتروني.",
      note: "Invisalign® علامة تجارية مسجّلة لشركة Align Technology, Inc. وORALIGN ليست تابعة لهذه الشركة ولا شريكة لها. لا نذكر هنا سوى ما هو معروف علناً، ولا نصدر أي حكم على منتجات طرف آخر.",
    },
    common: {
      eyebrow: "الأساس المشترك",
      title: "ما تشترك فيه جميع أنظمة التقويم الشفاف الجادّة.",
      intro:
        "قبل مقارنة العلامات التجارية، من المفيد معرفة ما لا يتغيّر من نظام إلى آخر. هذه العناصر لا تتعلّق بالاسم المكتوب على العلبة، وهي التي تُبنى عليها خطة العلاج.",
      items: [
        {
          title: "وصفة طبية من طبيب أسنان",
          body: "التقويم الشفاف ليس منتجاً يُطلب بمفردك. يسبق أي خطة علاجية فحصٌ سريري وطبعات أو مسح رقمي، وتصويرٌ شعاعي إذا رأى الطبيب ذلك ضرورياً. الطبيب وحده هو من يحدّد ما إذا كانت الحالة مناسبة.",
        },
        {
          title: "خطة علاج رقمية",
          body: "تُخطَّط حركة الأسنان خطوةً بخطوة على نموذج ثلاثي الأبعاد، ثم تُترجم إلى سلسلة من الأجهزة الشفافة. تبقى الخطة أداةً بيد الطبيب: هو من يعتمدها ويعدّلها ويصحّحها أثناء العلاج.",
        },
        {
          title: "الانضباط في مدة الارتداء",
          body: "لا تعمل الأجهزة إلا وهي داخل الفم. مدة الارتداء اليومية التي يحدّدها طبيبك هي العامل الذي تتحكّم فيه مباشرةً أكثر من غيره، وأحد أهم العوامل في أن تسير المراحل كما هو مخطَّط لها.",
        },
        {
          title: "التثبيت بعد انتهاء العلاج",
          body: "تحتفظ الأسنان بميل طبيعي للعودة نحو وضعها السابق. ومهما كان النظام المستخدم، يبقى التثبيت ضرورياً للحفاظ على النتيجة، بالشكل والمدة اللذين يحدّدهما طبيبك.",
        },
      ],
    },
    oralign: {
      eyebrow: "ما يخصّ ORALIGN",
      title: "ما يمكن لـ ORALIGN أن يقوله عن نفسه، لا أكثر.",
      intro:
        "نحن لا نعلّق على منتجات الآخرين: لا نملك اطّلاعاً على ملفاتهم السريرية، ومن غير النزيه أن ندّعي ذلك. أما ما يلي فهو ما يمكن التحقق منه بشأننا، ويمكنك مقارنته بما يعرضه عليك طبيبك.",
      items: [
        {
          title: "مصمَّم في ألمانيا، مصنوع في تونس",
          body: "تصميم النظام ألماني، وإنتاج الأجهزة الشفافة يتمّ في تونس. أي أنّ المخبر يوجد في البلد نفسه الذي يوجد فيه المريض والعيادة التي تتابعه.",
        },
        {
          title: "سلسلة قصيرة بين العيادة والمخبر",
          body: "الإنتاج المحلي يختصر التواصل بين طبيبك والمخبر. فالأسئلة المتعلقة بخطة العلاج أو بتعديل أو بإعادة مرحلة تُعالَج داخل البلد نفسه وفي التوقيت نفسه، بين أشخاص يمكن الوصول إليهم.",
        },
        {
          title: "بوصفة طبية وبإشراف الطبيب",
          body: "لا تبيع ORALIGN الأجهزة الشفافة مباشرةً للعموم. يمرّ أي علاج بـ ORALIGN وجوباً عبر طبيب أسنان أو أخصائي تقويم، هو من يضع التشخيص ويعتمد الخطة ويتابع الحالة حتى مرحلة التثبيت.",
        },
        {
          title: "مرافقة بالعربية والفرنسية والإنجليزية",
          body: "الوثائق المسلَّمة والدعم وواجهة المتابعة متوفرة باللغات الثلاث، حتى يتمكّن المريض والعيادة على حدّ سواء من الحديث عن العلاج باللغة الأقرب إليهما.",
        },
      ],
    },
    decides: {
      eyebrow: "الأهمّ",
      title: "العلامة التجارية أقل أهمية من الشخص الذي يتابعك.",
      intro:
        "هذه هي الجملة التي تتجنّب معظم المقارنات على الإنترنت كتابتها، لأنها لا تبيع شيئاً. ومع ذلك تبقى الأصدق: بين أنظمة متكافئة، التشخيص وجودة المتابعة وانتظامك أنت هي ما يفرّق بين علاج يسير كما ينبغي وعلاج ينحرف عن مساره.",
      items: [
        {
          title: "التشخيص",
          body: "الشكوى نفسها قد تستدعي أكثر من مقاربة. بعض الحالات تناسبها الأجهزة الشفافة، وأخرى تستدعي حلاً مختلفاً أو علاجاً سابقاً أو رأي أخصائي. هذا الفرز يتمّ أثناء الفحص، لا من خلال كتالوج.",
        },
        {
          title: "انتظام المتابعة",
          body: "الغاية من المواعيد الدورية هي التأكد من أنّ الأسنان تتحرّك فعلاً وفق الخطة، والتدخّل مبكراً إن لم يحدث ذلك. اسأل من سيعاينك ومتى، وماذا يحدث إذا لم تسر مرحلة كما أُعلن.",
        },
        {
          title: "دورك أنت",
          body: "ارتداء الأجهزة المدة المطلوبة، واحترام ترتيب المراحل، والإبلاغ سريعاً عمّا يزعجك، والمحافظة على النظافة اليومية: هذا الجزء لا يُشترى بأي علامة تجارية، ولا يمكن لأي نظام أن يقوم به نيابةً عنك.",
        },
      ],
    },
    questions: {
      eyebrow: "في العيادة",
      title: "الأسئلة التي تصنع مقارنة حقيقية.",
      intro:
        "خذها معك إلى طبيبك. إنها أنفع من أي مقارنة على الإنترنت، لأنّ الإجابات ستتعلّق بفمك أنت لا بمعدّل عام.",
      items: [
        "هل حالتي مناسبة للتقويم الشفاف، ولأي أسباب سريرية؟",
        "ما الأنظمة التي توفّرها، وأيّها تراه الأنسب لحالتي؟",
        "من يضع خطة العلاج، ومن يعتمدها قبل بدء التصنيع؟",
        "ماذا يشمل عرض السعر بالضبط: الأجهزة، المواعيد الدورية، إعادة المراحل عند الحاجة، والتثبيت؟",
        "كم مرة سأُعاين، وماذا يحدث إذا لم تسر إحدى المراحل كما هو مخطّط؟",
        "ما نوع التثبيت المقرّر بعد نهاية العلاج، وكم من الوقت سأحتاج إلى ارتدائه؟",
      ],
      closing:
        "إذا بقيت إجابة غامضة، اطلب أن تُكتب لك. الطبيب الذي يأخذ وقته ليشرح ما لا يستطيع أن يعد به هو عادةً من يستحق الثقة.",
    },
    cta: {
      eyebrow: "الخطوة التالية",
      title: "المقارنة الصحيحة تتمّ في العيادة.",
      body: "الطبيب المؤهَّل يفحص أسنانك، ويستمع إلى ما يزعجك، ويخبرك بما هو ممكن — مع ORALIGN أو بغيره. إنها المقارنة الوحيدة التي تأخذ فمك بعين الاعتبار.",
      action: "ابحث عن طبيب",
    },
  },
};

export function ComparatifPage() {
  const { lang } = useShowcaseLang();
  const copy = comparatifCopy[lang];

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section
        id="comparatif"
        data-section-tone="light"
        aria-labelledby="comparatif-title"
        className="px-5 py-20 text-[var(--sc-black)] sm:px-8 sm:py-24 lg:px-12 lg:py-28"
      >
        <div className="mx-auto w-full max-w-[1240px]">
          <Reveal>
            <div className="max-w-[820px]">
              <div className="mb-5 flex items-center gap-3 text-[0.58rem] uppercase tracking-[0.42em] text-[var(--sc-sun-deep)]">
                <span className="h-px w-8 bg-[var(--sc-sun-deep)]" aria-hidden="true" />
                <span>{copy.hero.eyebrow}</span>
              </div>
              <h1
                id="comparatif-title"
                className="sc-serif text-[clamp(1.9rem,3.8vw,3.3rem)] font-normal leading-[1.07]"
              >
                {copy.hero.title}
              </h1>
              <p className="mt-5 text-[0.98rem] leading-8 text-[var(--sc-text-mid)]">
                {copy.hero.lede}
              </p>
            </div>
          </Reveal>

          <Reveal delay>
            <p className="mt-10 max-w-[820px] border border-[var(--sc-grey)] px-6 py-5 text-[0.82rem] leading-7 text-[var(--sc-text-mid)]">
              {copy.hero.note}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── What both systems share ──────────────────────────────────── */}
      <section
        id="socle-commun"
        data-section-tone="light"
        aria-labelledby="socle-commun-title"
        className="bg-[rgba(25,25,25,0.025)] px-5 py-20 text-[var(--sc-black)] sm:px-8 sm:py-24 lg:px-12 lg:py-28"
      >
        <div className="mx-auto w-full max-w-[1240px]">
          <Reveal>
            <div className="max-w-[680px]">
              <div className="mb-5 flex items-center gap-3 text-[0.58rem] uppercase tracking-[0.42em] text-[var(--sc-sun-deep)]">
                <span className="h-px w-8 bg-[var(--sc-sun-deep)]" aria-hidden="true" />
                <span>{copy.common.eyebrow}</span>
              </div>
              <h2
                id="socle-commun-title"
                className="sc-serif text-[clamp(1.9rem,3.8vw,3.3rem)] font-normal leading-[1.07]"
              >
                {copy.common.title}
              </h2>
              <p className="mt-5 text-[0.98rem] leading-8 text-[var(--sc-text-mid)]">
                {copy.common.intro}
              </p>
            </div>
          </Reveal>

          <Reveal delay>
            <ul className="mt-14 grid gap-px border border-[var(--sc-grey)] bg-[var(--sc-grey)] sm:grid-cols-2">
              {copy.common.items.map((item) => (
                <li
                  key={item.title}
                  className="bg-[var(--sc-white)] px-7 py-9 sm:px-9 sm:py-11"
                >
                  <h3 className="sc-serif text-[1.22rem] font-normal leading-[1.3]">
                    {item.title}
                  </h3>
                  <p className="mt-4 text-[0.94rem] leading-8 text-[var(--sc-text-mid)]">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ── What is specific to Oralign ──────────────────────────────── */}
      <section
        id="propre-a-oralign"
        data-section-tone="light"
        aria-labelledby="propre-a-oralign-title"
        className="px-5 py-20 text-[var(--sc-black)] sm:px-8 sm:py-24 lg:px-12 lg:py-28"
      >
        <div className="mx-auto grid w-full max-w-[1240px] gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <Reveal>
            <div className="max-w-[520px]">
              <div className="mb-5 flex items-center gap-3 text-[0.58rem] uppercase tracking-[0.42em] text-[var(--sc-sun-deep)]">
                <span className="h-px w-8 bg-[var(--sc-sun-deep)]" aria-hidden="true" />
                <span>{copy.oralign.eyebrow}</span>
              </div>
              <h2
                id="propre-a-oralign-title"
                className="sc-serif text-[clamp(1.9rem,3.8vw,3.3rem)] font-normal leading-[1.07]"
              >
                {copy.oralign.title}
              </h2>
              <p className="mt-5 text-[0.98rem] leading-8 text-[var(--sc-text-mid)]">
                {copy.oralign.intro}
              </p>
            </div>
          </Reveal>

          <Reveal delay>
            <ul className="border-t border-[var(--sc-grey)]">
              {copy.oralign.items.map((item) => (
                <li
                  key={item.title}
                  className="border-b border-[var(--sc-grey)] py-8 first:pt-8"
                >
                  <h3 className="sc-serif text-[1.22rem] font-normal leading-[1.3]">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-[0.94rem] leading-8 text-[var(--sc-text-mid)]">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ── What actually decides the outcome ────────────────────────── */}
      <section
        id="ce-qui-compte"
        data-section-tone="light"
        aria-labelledby="ce-qui-compte-title"
        className="bg-[rgba(25,25,25,0.025)] px-5 py-20 text-[var(--sc-black)] sm:px-8 sm:py-24 lg:px-12 lg:py-28"
      >
        <div className="mx-auto w-full max-w-[1240px]">
          <Reveal>
            <div className="max-w-[720px]">
              <div className="mb-5 flex items-center gap-3 text-[0.58rem] uppercase tracking-[0.42em] text-[var(--sc-sun-deep)]">
                <span className="h-px w-8 bg-[var(--sc-sun-deep)]" aria-hidden="true" />
                <span>{copy.decides.eyebrow}</span>
              </div>
              <h2
                id="ce-qui-compte-title"
                className="sc-serif text-[clamp(1.9rem,3.8vw,3.3rem)] font-normal leading-[1.07]"
              >
                {copy.decides.title}
              </h2>
              <p className="mt-5 text-[0.98rem] leading-8 text-[var(--sc-text-mid)]">
                {copy.decides.intro}
              </p>
            </div>
          </Reveal>

          <Reveal delay>
            <ul className="mt-14 grid gap-px border border-[var(--sc-grey)] bg-[var(--sc-grey)] lg:grid-cols-3">
              {copy.decides.items.map((item) => (
                <li
                  key={item.title}
                  className="bg-[var(--sc-white)] px-7 py-9 sm:px-9 sm:py-11"
                >
                  <h3 className="sc-serif text-[1.22rem] font-normal leading-[1.3]">
                    {item.title}
                  </h3>
                  <p className="mt-4 text-[0.94rem] leading-8 text-[var(--sc-text-mid)]">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ── Questions to bring to the practitioner ───────────────────── */}
      <section
        id="questions-praticien"
        data-section-tone="light"
        aria-labelledby="questions-praticien-title"
        className="px-5 py-20 text-[var(--sc-black)] sm:px-8 sm:py-24 lg:px-12 lg:py-28"
      >
        <div className="mx-auto w-full max-w-[1240px]">
          <Reveal>
            <div className="max-w-[680px]">
              <div className="mb-5 flex items-center gap-3 text-[0.58rem] uppercase tracking-[0.42em] text-[var(--sc-sun-deep)]">
                <span className="h-px w-8 bg-[var(--sc-sun-deep)]" aria-hidden="true" />
                <span>{copy.questions.eyebrow}</span>
              </div>
              <h2
                id="questions-praticien-title"
                className="sc-serif text-[clamp(1.9rem,3.8vw,3.3rem)] font-normal leading-[1.07]"
              >
                {copy.questions.title}
              </h2>
              <p className="mt-5 text-[0.98rem] leading-8 text-[var(--sc-text-mid)]">
                {copy.questions.intro}
              </p>
            </div>
          </Reveal>

          <Reveal delay>
            <div className="mt-12 max-w-[900px] border border-[var(--sc-grey)] px-6 py-4 sm:px-10 sm:py-6">
              <ol className="divide-y divide-[var(--sc-grey)]">
                {copy.questions.items.map((question, index) => (
                  <li key={question} className="flex items-start gap-5 py-6">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 grid size-8 shrink-0 place-items-center border border-[var(--sc-grey)] text-[0.7rem] font-bold tracking-[0.08em] text-[var(--sc-sun-deep)]"
                    >
                      {index + 1}
                    </span>
                    <span className="text-[0.98rem] leading-8 text-[var(--sc-text-mid)]">
                      {question}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <p className="mt-8 max-w-[720px] text-[0.94rem] leading-8 text-[var(--sc-text-mid)]">
              {copy.questions.closing}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────────────── */}
      <section
        id="comparer-en-cabinet"
        data-section-tone="light"
        aria-labelledby="comparer-en-cabinet-title"
        className="bg-[rgba(25,25,25,0.025)] px-5 py-20 text-[var(--sc-black)] sm:px-8 sm:py-24 lg:px-12 lg:py-28"
      >
        <div className="mx-auto w-full max-w-[1240px]">
          <Reveal>
            <div className="max-w-[640px]">
              <div className="mb-5 flex items-center gap-3 text-[0.58rem] uppercase tracking-[0.42em] text-[var(--sc-sun-deep)]">
                <span className="h-px w-8 bg-[var(--sc-sun-deep)]" aria-hidden="true" />
                <span>{copy.cta.eyebrow}</span>
              </div>
              <h2
                id="comparer-en-cabinet-title"
                className="sc-serif text-[clamp(1.9rem,3.8vw,3.3rem)] font-normal leading-[1.07]"
              >
                {copy.cta.title}
              </h2>
              <p className="mt-5 text-[0.98rem] leading-8 text-[var(--sc-text-mid)]">
                {copy.cta.body}
              </p>
              <Link
                href="/trouver-un-praticien"
                className="mt-8 inline-flex min-h-12 items-center justify-center gap-3 bg-[var(--sc-sun)] px-6 py-3 text-center text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--sc-black)] no-underline transition-colors hover:bg-[var(--sc-sun-2)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--sc-black)]"
              >
                {copy.cta.action}
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}

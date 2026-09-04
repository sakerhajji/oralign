"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Lang } from "../../_lib/i18n/dict";
import { useShowcaseLang } from "../../_lib/i18n/lang-context";
import { Reveal } from "../shared/reveal";

/**
 * Sections of the "Prix" page (/prix).
 *
 * Editorial rule for this page: ORALIGN works with practitioners, not
 * directly with patients. The patient fee is set by the treating dentist
 * or orthodontist and depends on the case, so NO amount, percentage,
 * instalment count or duration is ever published here. The page explains
 * the pricing model and sends the visitor to a consultation instead.
 */

type Item = { title: string; body: string };

const prixCopy: Record<
  Lang,
  {
    hero: { eyebrow: string; title: string; lede: string; note: string };
    drivers: { eyebrow: string; title: string; intro: string; items: Item[] };
    quote: {
      eyebrow: string;
      title: string;
      intro: string;
      items: Item[];
      note: string;
    };
    payment: { eyebrow: string; title: string; paragraphs: string[] };
    transparency: { eyebrow: string; title: string; paragraphs: string[] };
    questions: {
      eyebrow: string;
      title: string;
      intro: string;
      items: string[];
      note: string;
    };
    cta: { eyebrow: string; title: string; body: string; action: string };
  }
> = {
  fr: {
    hero: {
      eyebrow: "PRIX ET DEVIS",
      title:
        "Prix des aligneurs dentaires en Tunisie : ce qui compose réellement le tarif.",
      lede:
        "ORALIGN travaille avec les praticiens, pas directement avec les patients : les honoraires sont fixés par le dentiste ou l’orthodontiste qui vous suit, en fonction de votre cas et du plan de traitement qu’il conçoit. Cette page explique ce qui fait varier ce tarif, ce qu’un devis contient, et comment comparer deux propositions sans vous tromper.",
      note:
        "Vous ne trouverez aucun montant sur cette page. Nous expliquons plus bas pourquoi un prix affiché serait trompeur pour un traitement médical.",
    },
    drivers: {
      eyebrow: "CE QUI FAIT LE PRIX",
      title: "Ce qui détermine le coût de votre traitement.",
      intro:
        "Deux sourires qui se ressemblent sur une photo peuvent demander deux plans très différents. Voici les éléments que votre praticien prend en compte lorsqu’il chiffre votre traitement.",
      items: [
        {
          title: "La complexité du cas",
          body:
            "Un léger encombrement et une malocclusion qui demande des déplacements dentaires importants ne mobilisent ni le même travail de planification, ni le même suivi clinique.",
        },
        {
          title: "Le nombre d’étapes",
          body:
            "Chaque étape du plan correspond à une gouttière fabriquée sur mesure. Plus le mouvement à obtenir est important, plus la série compte d’étapes.",
        },
        {
          title: "Une arcade ou les deux",
          body:
            "Certains plans ne concernent que l’arcade supérieure ou inférieure ; d’autres traitent les deux. C’est le praticien qui détermine ce qui est nécessaire cliniquement.",
        },
        {
          title: "La durée et le suivi",
          body:
            "Les rendez-vous de contrôle font partie du traitement. Un plan qui s’étale sur une plus longue période demande davantage de temps clinique.",
        },
        {
          title: "Les affinements",
          body:
            "Si les dents n’ont pas bougé exactement comme prévu, le praticien peut commander une série complémentaire. Faire préciser ce point dès le devis évite les mauvaises surprises.",
        },
        {
          title: "La contention finale",
          body:
            "À la fin du traitement, une contention maintient le résultat obtenu. Elle fait partie du parcours et doit apparaître clairement dans la proposition.",
        },
      ],
    },
    quote: {
      eyebrow: "LE DEVIS",
      title: "Ce que contient le devis d’un praticien.",
      intro:
        "Un devis écrit est la seule référence fiable. Demandez-le, relisez-le et gardez-en une copie. Voici les lignes que l’on retrouve habituellement, sans qu’aucun montant ne puisse être annoncé à l’avance.",
      items: [
        {
          title: "Le bilan et le plan de traitement 3D",
          body:
            "Examen clinique, radiographies si le praticien les juge nécessaires, empreintes ou scan intra-oral, puis la planification numérique des déplacements, que le praticien valide avant toute fabrication.",
        },
        {
          title: "La série d’aligneurs",
          body:
            "L’ensemble des gouttières prévues par le plan validé, fabriquées sur mesure pour votre bouche.",
        },
        {
          title: "Les rendez-vous de suivi",
          body:
            "Les contrôles pendant toute la durée du traitement, ainsi que les gestes cliniques prévus par le plan.",
        },
        {
          title: "La contention de fin de traitement",
          body:
            "Le dispositif qui maintient le résultat une fois la série terminée, et les consignes de port que votre praticien vous donne.",
        },
        {
          title: "Les affinements éventuels",
          body:
            "Compris dans la proposition ou facturés séparément selon le cabinet : c’est précisément le point à faire préciser par écrit.",
        },
      ],
      note:
        "Si une ligne n’apparaît pas sur le devis, elle n’est pas comprise. Demandez que chaque poste soit nommé, même lorsque le praticien vous annonce un montant global.",
    },
    payment: {
      eyebrow: "LE RÈGLEMENT",
      title: "Le paiement peut généralement être échelonné.",
      paragraphs: [
        "La plupart des cabinets acceptent d’étaler le règlement sur la durée du traitement. Les modalités — le nombre de versements, le calendrier des échéances, les moyens de paiement acceptés — sont définies par le cabinet lui-même, jamais par ORALIGN. Demandez-les par écrit avant de commencer.",
        "Selon votre couverture, une prise en charge partielle par une assurance ou une mutuelle peut exister. Votre praticien vous indiquera les justificatifs à fournir, mais seul votre assureur peut confirmer ce qui est pris en charge dans votre situation.",
        "Un point mérite d’être posé dès le premier rendez-vous : ce qu’il advient du règlement si le plan est modifié en cours de traitement. Une réponse claire à cette question en dit long sur la transparence d’une proposition.",
      ],
    },
    transparency: {
      eyebrow: "TRANSPARENCE",
      title: "Pourquoi vous ne trouverez pas de grille tarifaire en ligne.",
      paragraphs: [
        "Un traitement d’alignement est un acte médical, pas un article de catalogue. Il commence par un examen, s’appuie sur un diagnostic et engage la responsabilité du praticien qui le conduit.",
        "Afficher un prix unique reviendrait soit à annoncer un montant que beaucoup de patients ne paieraient pas réellement, soit à laisser croire qu’un traitement peut se décider sans examen clinique. Les deux nous semblent malhonnêtes envers vous.",
        "ORALIGN fournit la technologie de planification et les aligneurs aux praticiens. La relation de soin, la décision clinique et les honoraires appartiennent au praticien qui vous examine et qui vous suit.",
        "La réponse honnête à la question « combien ça coûte ? » est donc toujours la même : une consultation, puis un devis écrit qui porte sur votre cas et sur rien d’autre.",
      ],
    },
    questions: {
      eyebrow: "COMPARER",
      title: "Les questions à poser pour comparer deux propositions.",
      intro:
        "Comparer deux devis n’a de sens que si vous comparez le même périmètre. Ces questions vous permettent de ramener deux propositions sur un terrain commun.",
      items: [
        "Que couvre exactement le montant annoncé : le bilan, la série complète, les rendez-vous de suivi, la contention ?",
        "Combien d’étapes le plan prévoit-il, et concerne-t-il une arcade ou les deux ?",
        "Que se passe-t-il s’il faut des aligneurs supplémentaires ? Les affinements sont-ils compris, et jusqu’à quand ?",
        "La contention de fin de traitement est-elle incluse ? Et son remplacement en cas de perte ou de casse ?",
        "Quelles sont les modalités de règlement proposées et à quel rythme ?",
        "Que devient le devis si le plan évolue en cours de route, et comment en serai-je informé ?",
        "Qui assure le suivi, à quelle fréquence, et que faire entre deux rendez-vous en cas de problème ?",
      ],
      note:
        "Un praticien qui prend le temps de répondre à ces questions par écrit vous donne déjà une bonne indication sur la façon dont votre traitement sera suivi.",
    },
    cta: {
      eyebrow: "VOTRE DEVIS",
      title: "Un devis personnalisé commence par une consultation.",
      body:
        "Un praticien formé aux aligneurs ORALIGN examine votre situation, vous dit si ce type de traitement est indiqué pour vous et vous remet une proposition écrite adaptée à votre cas.",
      action: "Trouver un praticien",
    },
  },
  en: {
    hero: {
      eyebrow: "PRICING AND QUOTES",
      title:
        "The price of clear aligners in Tunisia: what actually makes up the fee.",
      lede:
        "ORALIGN works with practitioners rather than directly with patients: the fee is set by the dentist or orthodontist treating you, based on your case and the treatment plan they design. This page explains what makes that fee vary, what a quote contains, and how to compare two proposals without getting it wrong.",
      note:
        "You will not find an amount on this page. Further down, we explain why a published price would be misleading for a medical treatment.",
    },
    drivers: {
      eyebrow: "WHAT SETS THE PRICE",
      title: "What determines the cost of your treatment.",
      intro:
        "Two smiles that look alike in a photo can call for very different plans. These are the elements your practitioner weighs when pricing your treatment.",
      items: [
        {
          title: "How complex the case is",
          body:
            "Mild crowding and a malocclusion that requires substantial tooth movement do not involve the same planning work, nor the same clinical follow-up.",
        },
        {
          title: "The number of stages",
          body:
            "Each stage of the plan corresponds to one custom-made aligner. The greater the movement to achieve, the more stages the series contains.",
        },
        {
          title: "One arch or both",
          body:
            "Some plans involve only the upper or the lower arch; others treat both. Your practitioner determines what is clinically necessary.",
        },
        {
          title: "Duration and follow-up",
          body:
            "Review appointments are part of the treatment. A plan that runs over a longer period requires more clinical time.",
        },
        {
          title: "Refinements",
          body:
            "If the teeth have not moved exactly as planned, the practitioner can order an additional series. Clarifying this in the quote avoids unpleasant surprises.",
        },
        {
          title: "The final retainer",
          body:
            "Once treatment ends, a retainer holds the result in place. It is part of the journey and should appear clearly in the proposal.",
        },
      ],
    },
    quote: {
      eyebrow: "THE QUOTE",
      title: "What a practitioner's quote contains.",
      intro:
        "A written quote is the only reliable reference. Ask for it, read it carefully and keep a copy. These are the lines it usually contains — none of which can be priced in advance.",
      items: [
        {
          title: "The assessment and the 3D treatment plan",
          body:
            "Clinical examination, radiographs where your practitioner judges them necessary, impressions or an intraoral scan, then the digital planning of the movements, which the practitioner approves before anything is manufactured.",
        },
        {
          title: "The aligner series",
          body:
            "All the aligners set out by the approved plan, custom-made for your mouth.",
        },
        {
          title: "Follow-up appointments",
          body:
            "The reviews throughout the treatment, together with the clinical steps the plan calls for.",
        },
        {
          title: "The end-of-treatment retainer",
          body:
            "The device that holds the result once the series is complete, and the wear instructions your practitioner gives you.",
        },
        {
          title: "Any refinements",
          body:
            "Included in the proposal or billed separately depending on the practice: this is precisely the point to have confirmed in writing.",
        },
      ],
      note:
        "If a line does not appear on the quote, it is not included. Ask for every item to be named, even when the practitioner quotes a single overall figure.",
    },
    payment: {
      eyebrow: "PAYMENT",
      title: "Payment can generally be spread out.",
      paragraphs: [
        "Most practices accept staging payment across the treatment. The terms — how many instalments, when each falls due, which payment methods are accepted — are set by the practice itself, never by ORALIGN. Ask for them in writing before you begin.",
        "Depending on your cover, partial reimbursement through an insurer or a health scheme may be possible. Your practitioner will tell you which documents to supply, but only your insurer can confirm what is covered in your situation.",
        "One question is worth raising at the first appointment: what happens to the agreed payment if the plan is modified during treatment. A clear answer says a great deal about how transparent a proposal is.",
      ],
    },
    transparency: {
      eyebrow: "TRANSPARENCY",
      title: "Why you will not find a price list online.",
      paragraphs: [
        "Aligner treatment is a medical procedure, not a catalogue item. It begins with an examination, rests on a diagnosis, and engages the responsibility of the practitioner who carries it out.",
        "Publishing a single price would either advertise a figure many patients would not actually pay, or suggest that treatment can be decided without a clinical examination. Both strike us as dishonest towards you.",
        "ORALIGN supplies the planning technology and the aligners to practitioners. The clinical relationship, the clinical decision and the fee belong to the practitioner who examines you and follows your case.",
        "So the honest answer to “how much does it cost?” is always the same: a consultation, then a written quote that addresses your case and nothing else.",
      ],
    },
    questions: {
      eyebrow: "COMPARING",
      title: "The questions to ask when comparing two proposals.",
      intro:
        "Comparing two quotes only makes sense if you are comparing the same scope. These questions bring two proposals onto common ground.",
      items: [
        "What exactly does the stated figure cover: the assessment, the full series, the follow-up appointments, the retainer?",
        "How many stages does the plan contain, and does it involve one arch or both?",
        "What happens if additional aligners are needed? Are refinements included, and for how long?",
        "Is the end-of-treatment retainer included? And its replacement if it is lost or broken?",
        "What payment terms are proposed, and on what schedule?",
        "What happens to the quote if the plan changes along the way, and how will I be told?",
        "Who provides the follow-up, how often, and what should I do between appointments if something goes wrong?",
      ],
      note:
        "A practitioner who takes the time to answer these questions in writing already tells you a lot about how your treatment will be followed.",
    },
    cta: {
      eyebrow: "YOUR QUOTE",
      title: "A personalised quote starts with a consultation.",
      body:
        "A practitioner trained on ORALIGN aligners examines your situation, tells you whether this kind of treatment is indicated for you, and gives you a written proposal built around your case.",
      action: "Find a practitioner",
    },
  },
  ar: {
    hero: {
      eyebrow: "الأسعار والتقديرات",
      title: "أسعار التقويم الشفاف في تونس: ما الذي يحدّد التكلفة فعلاً.",
      lede:
        "تعمل ORALIGN مع الأطباء لا مع المرضى مباشرة: فالأتعاب يحدّدها طبيب الأسنان أو أخصائي التقويم الذي يتابعك، حسب حالتك وخطة العلاج التي يضعها. تشرح هذه الصفحة ما الذي يجعل هذه التكلفة تتغيّر، وما الذي يتضمّنه التقدير الكتابي، وكيف تقارن بين عرضين دون التباس.",
      note:
        "لن تجد أي مبلغ في هذه الصفحة. ونوضّح أدناه لماذا يكون نشر سعر ثابت مضلّلاً حين يتعلّق الأمر بعلاج طبي.",
    },
    drivers: {
      eyebrow: "ما الذي يحدّد السعر",
      title: "العناصر التي تحدّد تكلفة علاجك.",
      intro:
        "قد تتشابه ابتسامتان في صورة وتحتاج كلٌّ منهما إلى خطة مختلفة تماماً. هذه هي العناصر التي يأخذها طبيبك في الحسبان عند تقدير تكلفة العلاج.",
      items: [
        {
          title: "درجة تعقيد الحالة",
          body:
            "ازدحام بسيط في الأسنان وسوء إطباق يتطلّب تحريكاً كبيراً للأسنان لا يستلزمان القدر نفسه من عمل التخطيط ولا من المتابعة السريرية.",
        },
        {
          title: "عدد المراحل",
          body:
            "تقابل كل مرحلة من الخطة جهازاً شفافاً مصنوعاً خصيصاً لك. وكلّما زاد مقدار الحركة المطلوبة زاد عدد مراحل السلسلة.",
        },
        {
          title: "فك واحد أو الفكّان معاً",
          body:
            "بعض الخطط تخصّ الفك العلوي أو السفلي فقط، وأخرى تعالج الفكّين. والطبيب هو من يحدّد ما هو ضروري سريرياً.",
        },
        {
          title: "مدة العلاج والمتابعة",
          body:
            "مواعيد المراقبة جزء من العلاج. والخطة التي تمتد على فترة أطول تتطلّب وقتاً سريرياً أكبر.",
        },
        {
          title: "التعديلات التكميلية",
          body:
            "إذا لم تتحرّك الأسنان تماماً كما هو مخطّط، يمكن للطبيب طلب سلسلة إضافية. وتوضيح هذه النقطة في التقدير منذ البداية يجنّبك المفاجآت.",
        },
        {
          title: "جهاز التثبيت النهائي",
          body:
            "في نهاية العلاج يحافظ جهاز التثبيت على النتيجة المحقّقة. وهو جزء من المسار ويجب أن يظهر بوضوح في العرض.",
        },
      ],
    },
    quote: {
      eyebrow: "التقدير الكتابي",
      title: "ما الذي يتضمّنه تقدير الطبيب.",
      intro:
        "التقدير الكتابي هو المرجع الموثوق الوحيد. اطلبه واقرأه بعناية واحتفظ بنسخة منه. وهذه البنود التي يتضمّنها عادةً، دون أن يكون بالإمكان تسعير أيٍّ منها مسبقاً.",
      items: [
        {
          title: "الفحص وخطة العلاج ثلاثية الأبعاد",
          body:
            "فحص سريري، وصور أشعة إذا رأى الطبيب ضرورتها، وطبعات أو مسح داخل الفم، ثم التخطيط الرقمي لحركة الأسنان الذي يصادق عليه الطبيب قبل أي تصنيع.",
        },
        {
          title: "سلسلة الأجهزة الشفافة",
          body:
            "مجموع الأجهزة التي تنصّ عليها الخطة المصادق عليها، مصنوعة خصيصاً لفمك.",
        },
        {
          title: "مواعيد المتابعة",
          body:
            "مواعيد المراقبة طوال مدة العلاج، إضافة إلى الإجراءات السريرية التي تقتضيها الخطة.",
        },
        {
          title: "جهاز التثبيت في نهاية العلاج",
          body:
            "الجهاز الذي يحافظ على النتيجة بعد انتهاء السلسلة، مع تعليمات الارتداء التي يقدّمها لك طبيبك.",
        },
        {
          title: "التعديلات التكميلية عند الحاجة",
          body:
            "قد تكون مشمولة في العرض أو تُحتسب على حدة حسب العيادة، وهذه بالذات النقطة التي ينبغي توضيحها كتابةً.",
        },
      ],
      note:
        "إذا لم يرد بند في التقدير فهو غير مشمول. اطلب تسمية كل بند على حدة حتى عندما يعلن الطبيب مبلغاً إجمالياً واحداً.",
    },
    payment: {
      eyebrow: "طريقة الدفع",
      title: "يمكن عادةً تقسيط الدفع.",
      paragraphs: [
        "تقبل أغلب العيادات توزيع الدفع على مدة العلاج. أما الشروط — عدد الدفعات ومواعيدها ووسائل الدفع المقبولة — فتحدّدها العيادة نفسها ولا تحدّدها ORALIGN إطلاقاً. اطلبها كتابةً قبل بدء العلاج.",
        "وحسب تغطيتك، قد يكون هناك تحمّل جزئي من شركة تأمين أو صندوق تأمين صحي. سيدلّك طبيبك على الوثائق المطلوبة، لكن شركة التأمين وحدها هي التي تؤكّد ما هو مشمول في حالتك.",
        "وهناك سؤال يستحق الطرح منذ الموعد الأول: ماذا يحدث للمبلغ المتّفق عليه إذا تغيّرت الخطة أثناء العلاج. فالإجابة الواضحة عن هذا السؤال تكشف الكثير عن شفافية العرض.",
      ],
    },
    transparency: {
      eyebrow: "الشفافية",
      title: "لماذا لن تجد قائمة أسعار على الإنترنت.",
      paragraphs: [
        "علاج تقويم الأسنان عمل طبي وليس منتجاً في كتالوج. يبدأ بفحص، ويستند إلى تشخيص، ويرتّب مسؤولية على الطبيب الذي يقوم به.",
        "نشر سعر واحد يعني إمّا إعلان مبلغ لن يدفعه كثير من المرضى فعلياً، وإمّا الإيحاء بأن العلاج يمكن أن يُقرَّر دون فحص سريري. وكلا الأمرين يبدو لنا غير أمين تجاهك.",
        "توفّر ORALIGN تقنية التخطيط والأجهزة الشفافة للأطباء. أما العلاقة العلاجية والقرار السريري والأتعاب فتعود إلى الطبيب الذي يفحصك ويتابع حالتك.",
        "لذلك تبقى الإجابة الأمينة عن سؤال «كم يكلّف؟» واحدة دائماً: استشارة، ثم تقدير كتابي يخصّ حالتك أنت دون سواها.",
      ],
    },
    questions: {
      eyebrow: "المقارنة",
      title: "الأسئلة التي تطرحها لمقارنة عرضين.",
      intro:
        "لا معنى لمقارنة تقديرين إلا إذا كنت تقارن النطاق نفسه. تساعدك هذه الأسئلة على وضع العرضين على أرضية واحدة.",
      items: [
        "ما الذي يغطّيه المبلغ المعلن بالضبط: الفحص، والسلسلة الكاملة، ومواعيد المتابعة، وجهاز التثبيت؟",
        "كم مرحلة تتضمّنها الخطة، وهل تخصّ فكاً واحداً أم الفكّين معاً؟",
        "ماذا يحدث إذا لزمت أجهزة إضافية؟ وهل التعديلات التكميلية مشمولة، وإلى متى؟",
        "هل جهاز التثبيت في نهاية العلاج مشمول؟ وماذا عن استبداله في حال فقدانه أو كسره؟",
        "ما شروط الدفع المقترحة وعلى أي وتيرة؟",
        "ماذا يحلّ بالتقدير إذا تغيّرت الخطة أثناء العلاج، وكيف سأُبلَّغ بذلك؟",
        "من يتولّى المتابعة وبأي وتيرة، وماذا أفعل بين موعدين إذا واجهت مشكلة؟",
      ],
      note:
        "الطبيب الذي يخصّص وقتاً للإجابة عن هذه الأسئلة كتابةً يعطيك أصلاً فكرة جيدة عن الطريقة التي ستُتابَع بها حالتك.",
    },
    cta: {
      eyebrow: "تقديرك الخاص",
      title: "التقدير الشخصي يبدأ باستشارة.",
      body:
        "يفحص طبيب مدرَّب على أجهزة ORALIGN الشفافة وضعك، ويخبرك ما إذا كان هذا النوع من العلاج مناسباً لحالتك، ثم يسلّمك عرضاً كتابياً مبنياً على حالتك.",
      action: "ابحث عن طبيب",
    },
  },
};

const eyebrowClass =
  "mb-5 flex items-center gap-3 text-[0.58rem] uppercase tracking-[0.42em] text-[var(--sc-sun-deep)]";
const headingClass =
  "sc-serif text-[clamp(1.9rem,3.8vw,3.3rem)] font-normal leading-[1.07]";
const bodyClass = "mt-5 text-[0.98rem] leading-8 text-[var(--sc-text-mid)]";

export function PrixPage() {
  const { lang } = useShowcaseLang();
  const copy = prixCopy[lang];

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section
        id="prix-hero"
        data-section-tone="light"
        aria-labelledby="prix-hero-title"
        className="px-5 py-20 text-[var(--sc-black)] sm:px-8 sm:py-24 lg:px-12 lg:py-28"
      >
        <div className="mx-auto w-full max-w-[1240px]">
          <Reveal>
            <div className="max-w-[880px]">
              <div className={eyebrowClass}>
                <span className="h-px w-8 bg-[var(--sc-sun-deep)]" aria-hidden="true" />
                <span>{copy.hero.eyebrow}</span>
              </div>
              <h1 id="prix-hero-title" className={`${headingClass} text-balance`}>
                {copy.hero.title}
              </h1>
              <p className={`${bodyClass} max-w-[720px]`}>{copy.hero.lede}</p>
            </div>
          </Reveal>

          <Reveal delay>
            <p className="mt-10 max-w-[720px] border border-[var(--sc-grey)] px-5 py-4 text-[0.9rem] leading-7 text-[var(--sc-black)]">
              {copy.hero.note}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── What drives the cost ─────────────────────────────── */}
      <section
        id="prix-facteurs"
        data-section-tone="light"
        aria-labelledby="prix-facteurs-title"
        className="bg-[rgba(25,25,25,0.025)] px-5 py-20 text-[var(--sc-black)] sm:px-8 sm:py-24 lg:px-12 lg:py-28"
      >
        <div className="mx-auto w-full max-w-[1240px]">
          <Reveal>
            <div className="max-w-[720px]">
              <div className={eyebrowClass}>
                <span className="h-px w-8 bg-[var(--sc-sun-deep)]" aria-hidden="true" />
                <span>{copy.drivers.eyebrow}</span>
              </div>
              <h2 id="prix-facteurs-title" className={headingClass}>
                {copy.drivers.title}
              </h2>
              <p className={bodyClass}>{copy.drivers.intro}</p>
            </div>
          </Reveal>

          <Reveal delay>
            <ul className="mt-14 grid gap-px border border-[var(--sc-grey)] bg-[var(--sc-grey)] sm:grid-cols-2 lg:grid-cols-3">
              {copy.drivers.items.map((item, index) => (
                <li
                  key={item.title}
                  className="flex flex-col bg-[var(--sc-white)] p-7 sm:p-8"
                >
                  <span className="text-[0.62rem] font-bold uppercase tracking-[0.24em] text-[var(--sc-sun-deep)]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="mt-4 block h-px w-8 bg-[var(--sc-sun)]" aria-hidden="true" />
                  <h3 className="sc-serif mt-5 text-[1.25rem] font-normal leading-[1.25]">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-[0.94rem] leading-7 text-[var(--sc-text-mid)]">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ── What a quote contains ────────────────────────────── */}
      <section
        id="prix-devis"
        data-section-tone="light"
        aria-labelledby="prix-devis-title"
        className="px-5 py-20 text-[var(--sc-black)] sm:px-8 sm:py-24 lg:px-12 lg:py-28"
      >
        <div className="mx-auto grid w-full max-w-[1240px] gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <Reveal>
            <div className="max-w-[460px]">
              <div className={eyebrowClass}>
                <span className="h-px w-8 bg-[var(--sc-sun-deep)]" aria-hidden="true" />
                <span>{copy.quote.eyebrow}</span>
              </div>
              <h2 id="prix-devis-title" className={headingClass}>
                {copy.quote.title}
              </h2>
              <p className={bodyClass}>{copy.quote.intro}</p>
            </div>
          </Reveal>

          <Reveal delay>
            <ul className="border border-[var(--sc-grey)]">
              {copy.quote.items.map((item) => (
                <li
                  key={item.title}
                  className="border-b border-[var(--sc-grey)] p-6 last:border-b-0 sm:p-8"
                >
                  <h3 className="sc-serif text-[1.2rem] font-normal leading-[1.25]">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-[0.94rem] leading-7 text-[var(--sc-text-mid)]">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-[0.9rem] leading-7 text-[var(--sc-black)]">
              {copy.quote.note}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Payment terms ────────────────────────────────────── */}
      <section
        id="prix-reglement"
        data-section-tone="light"
        aria-labelledby="prix-reglement-title"
        className="bg-[rgba(25,25,25,0.025)] px-5 py-20 text-[var(--sc-black)] sm:px-8 sm:py-24 lg:px-12 lg:py-28"
      >
        <div className="mx-auto w-full max-w-[1240px]">
          <Reveal>
            <div className="max-w-[720px]">
              <div className={eyebrowClass}>
                <span className="h-px w-8 bg-[var(--sc-sun-deep)]" aria-hidden="true" />
                <span>{copy.payment.eyebrow}</span>
              </div>
              <h2 id="prix-reglement-title" className={headingClass}>
                {copy.payment.title}
              </h2>
            </div>
          </Reveal>

          <Reveal delay>
            <div className="mt-10 grid gap-8 md:grid-cols-3">
              {copy.payment.paragraphs.map((paragraph) => (
                <p
                  key={paragraph}
                  className="border-t border-[var(--sc-grey)] pt-6 text-[0.94rem] leading-7 text-[var(--sc-text-mid)]"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Why no online price list ─────────────────────────── */}
      <section
        id="prix-transparence"
        data-section-tone="light"
        aria-labelledby="prix-transparence-title"
        className="px-5 py-20 text-[var(--sc-black)] sm:px-8 sm:py-24 lg:px-12 lg:py-28"
      >
        <div className="mx-auto grid w-full max-w-[1240px] gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <div className="max-w-[520px]">
              <div className={eyebrowClass}>
                <span className="h-px w-8 bg-[var(--sc-sun-deep)]" aria-hidden="true" />
                <span>{copy.transparency.eyebrow}</span>
              </div>
              <h2 id="prix-transparence-title" className={headingClass}>
                {copy.transparency.title}
              </h2>
            </div>
          </Reveal>

          <Reveal delay>
            <div className="max-w-[560px] space-y-6 border border-[var(--sc-grey)] p-7 sm:p-9">
              {copy.transparency.paragraphs.map((paragraph) => (
                <p
                  key={paragraph}
                  className="text-[0.96rem] leading-8 text-[var(--sc-text-mid)]"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Questions to ask ─────────────────────────────────── */}
      <section
        id="prix-questions"
        data-section-tone="light"
        aria-labelledby="prix-questions-title"
        className="bg-[rgba(25,25,25,0.025)] px-5 py-20 text-[var(--sc-black)] sm:px-8 sm:py-24 lg:px-12 lg:py-28"
      >
        <div className="mx-auto w-full max-w-[1240px]">
          <Reveal>
            <div className="max-w-[720px]">
              <div className={eyebrowClass}>
                <span className="h-px w-8 bg-[var(--sc-sun-deep)]" aria-hidden="true" />
                <span>{copy.questions.eyebrow}</span>
              </div>
              <h2 id="prix-questions-title" className={headingClass}>
                {copy.questions.title}
              </h2>
              <p className={bodyClass}>{copy.questions.intro}</p>
            </div>
          </Reveal>

          <Reveal delay>
            <ol className="mt-12 max-w-[880px] border border-[var(--sc-grey)] bg-[var(--sc-white)]">
              {copy.questions.items.map((question, index) => (
                <li
                  key={question}
                  className="flex items-baseline gap-5 border-b border-[var(--sc-grey)] px-6 py-5 last:border-b-0 sm:px-8"
                >
                  <span className="shrink-0 text-[0.62rem] font-bold uppercase tracking-[0.24em] text-[var(--sc-sun-deep)]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[0.96rem] leading-7 text-[var(--sc-black)]">
                    {question}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-6 max-w-[720px] text-[0.9rem] leading-7 text-[var(--sc-text-mid)]">
              {copy.questions.note}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────── */}
      <section
        id="prix-cta"
        data-section-tone="light"
        aria-labelledby="prix-cta-title"
        className="px-5 py-20 text-[var(--sc-black)] sm:px-8 sm:py-24 lg:px-12 lg:py-28"
      >
        <div className="mx-auto w-full max-w-[1240px]">
          <Reveal>
            <div className="max-w-[720px] border border-[var(--sc-grey)] p-7 sm:p-10 lg:p-12">
              <div className={eyebrowClass}>
                <span className="h-px w-8 bg-[var(--sc-sun-deep)]" aria-hidden="true" />
                <span>{copy.cta.eyebrow}</span>
              </div>
              <h2 id="prix-cta-title" className={headingClass}>
                {copy.cta.title}
              </h2>
              <p className={bodyClass}>{copy.cta.body}</p>
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

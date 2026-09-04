"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Lang } from "../../_lib/i18n/dict";
import { useShowcaseLang } from "../../_lib/i18n/lang-context";
import { Reveal } from "../shared/reveal";

/**
 * "Aligneurs pour adolescents" page (/aligneurs-adolescents).
 *
 * Written for a parent deciding whether clear aligners suit their teenager,
 * with the teenager reading over their shoulder. Deliberately text-only and
 * free of figures: every clinical judgement is attributed to the practitioner,
 * who is the one who decides.
 */

type Item = { title: string; body: string };

type AdosCopy = {
  hero: { eyebrow: string; title: string; lede: string; cta: string };
  why: { eyebrow: string; title: string; intro: string; items: Item[] };
  check: { eyebrow: string; title: string; body: string; items: Item[]; note: string };
  wear: { eyebrow: string; title: string; body: string; helps: Item; honest: Item };
  daily: { eyebrow: string; title: string; intro: string; items: Item[] };
  parent: { eyebrow: string; title: string; body: string; items: Item[] };
  cta: { eyebrow: string; title: string; body: string; action: string };
};

const adosCopy: Record<Lang, AdosCopy> = {
  fr: {
    hero: {
      eyebrow: "ORALIGN · ADOLESCENTS",
      title: "Des aligneurs pour votre adolescent : ce qu’il faut savoir avant de décider.",
      lede: "Votre adolescent vous parle d’aligneurs transparents plutôt que d’un appareil métallique. La demande est légitime, et souvent bon signe : il s’intéresse à son sourire. Reste à savoir si son cas s’y prête, et s’il est prêt à jouer le jeu. Cette page vous donne de quoi en discuter avec lui — puis avec un praticien, qui seul peut trancher.",
      cta: "Trouver un praticien",
    },
    why: {
      eyebrow: "CE QU’ILS EN ATTENDENT",
      title: "Pourquoi votre adolescent demande des aligneurs.",
      intro:
        "Les raisons qu’ils avancent sont rarement médicales. Elles n’en sont pas moins réelles : à cet âge, l’image que l’on renvoie compte, et un appareil que l’on peut retirer change le rapport au traitement.",
      items: [
        {
          title: "Discret au lycée",
          body: "Les gouttières sont transparentes. En classe, sur les photos, dans les vidéos qui circulent entre amis, elles se remarquent peu. Pour beaucoup d’adolescents, c’est la raison numéro un.",
        },
        {
          title: "Rien de métallique",
          body: "Pas de bagues ni de fils collés sur les dents, et l’appareil se retire quand il le faut. De quoi rassurer ceux qui redoutent l’aspect d’un traitement visible.",
        },
        {
          title: "Le sport reste le sport",
          body: "Selon l’activité, le praticien indique s’il vaut mieux retirer les gouttières ou porter une protection adaptée. Rien n’étant collé aux dents, la question reste simple.",
        },
        {
          title: "Manger sans y penser",
          body: "On retire les gouttières avant le repas, on se brosse les dents avant de les remettre. L’appareil lui-même n’interdit aucun aliment.",
        },
      ],
    },
    check: {
      eyebrow: "L’ÉVALUATION",
      title: "Ce que le praticien vérifie avant de dire oui.",
      body: "Un adolescent n’est pas un adulte en plus petit. Sa bouche évolue encore, et cette évolution fait partie du raisonnement clinique. C’est pourquoi la réponse ne vient jamais d’une page web : elle vient d’un examen.",
      items: [
        {
          title: "Le stade de développement dentaire",
          body: "Le praticien regarde où en est la denture : quelles dents sont déjà en place, lesquelles sont encore attendues, et ce que cela implique pour le plan de traitement.",
        },
        {
          title: "Les dents effectivement sorties",
          body: "Le nombre de dents présentes et leur position conditionnent ce qu’il est possible de faire avec des gouttières, et à quel moment le faire.",
        },
        {
          title: "La nature de la correction envisagée",
          body: "Certains mouvements se prêtent bien aux aligneurs, d’autres beaucoup moins. Le praticien évalue si le cas entre dans ce cadre.",
        },
        {
          title: "L’état de santé bucco-dentaire",
          body: "Caries à soigner, hygiène, gencives : ces points se règlent avant d’envisager de déplacer des dents.",
        },
        {
          title: "La motivation réelle de l’adolescent",
          body: "Elle fait partie de l’examen. Le praticien lui parle directement, et pas seulement à vous.",
        },
      ],
      note: "À l’issue de ce bilan, la réponse peut être non — ou pas maintenant, ou pas avec des aligneurs. Un autre dispositif est parfois mieux adapté au cas, et le dire fait partie du travail du praticien. Un avis qui écarte une solution reste un avis utile.",
    },
    wear: {
      eyebrow: "LA CONDITION",
      title: "Un aligneur ne fait rien tant qu’il est dans son boîtier.",
      body: "C’est le point sur lequel il faut être direct, parce qu’il pèse sur le résultat plus que tout le reste. Les gouttières ne déplacent les dents que pendant qu’elles sont portées. Le praticien fixe le port attendu et le moment de passer à la gouttière suivante ; tout le reste se joue à la maison, au lycée et le week-end.",
      helps: {
        title: "Ce qui aide",
        body: "Une routine simple et toujours la même : on retire pour manger, on se brosse les dents, on remet aussitôt. Un endroit fixe pour le boîtier. Un rappel sur le téléphone les premières semaines. Et un adulte qui demande comment ça se passe sans transformer chaque repas en contrôle.",
      },
      honest: {
        title: "Ce qu’il faut regarder en face",
        body: "Un adolescent qui ne veut pas porter ses gouttières ne les portera pas, et aucun argument commercial n’y changera quoi que ce soit. Dans ce cas, les aligneurs ne sont pas le bon choix : mieux vaut le dire au praticien, qui pourra proposer une autre approche plutôt que d’engager un traitement qui n’avancera pas.",
      },
    },
    daily: {
      eyebrow: "AU QUOTIDIEN",
      title: "À quoi ressemble une journée avec des aligneurs.",
      intro: "Rien de compliqué, mais quelques réflexes à installer dès les premiers jours.",
      items: [
        {
          title: "Les repas",
          body: "On retire les gouttières avant de manger, sans exception, et on se brosse les dents avant de les remettre. À la cantine comme à la maison, le boîtier reste dans le sac.",
        },
        {
          title: "Les boissons",
          body: "On boit de l’eau gouttières en place ; pour le reste, on les retire d’abord et on se brosse les dents avant de les remettre. Le praticien précise ce qu’il attend.",
        },
        {
          title: "Le nettoyage",
          body: "Les gouttières se rincent et se nettoient en douceur, selon la méthode indiquée par le praticien. L’eau très chaude est à éviter : elle peut déformer le plastique.",
        },
        {
          title: "Le boîtier, toujours",
          body: "La règle qui évite le plus d’ennuis : dans la bouche ou dans le boîtier, jamais dans une serviette en papier ni au bord d’un plateau. C’est ainsi que la plupart des gouttières disparaissent.",
        },
        {
          title: "Si une gouttière est perdue ou cassée",
          body: "On ne saute pas d’étape et on n’improvise pas. On appelle le cabinet : le praticien dit s’il faut remettre la précédente, passer à la suivante ou refaire la pièce.",
        },
      ],
    },
    parent: {
      eyebrow: "VOTRE RÔLE",
      title: "Ce qui vous revient, à vous.",
      body: "Vous n’êtes pas là pour surveiller une gouttière. Vous êtes là pour tenir le cadre autour du traitement, et c’est ce cadre qui fait la différence.",
      items: [
        {
          title: "Les rendez-vous",
          body: "Ils donnent son rythme au traitement. Le praticien vérifie que les dents suivent le plan prévu et ajuste si ce n’est pas le cas. Un rendez-vous décalé se rattrape ; une série de rendez-vous manqués finit par se voir sur le résultat.",
        },
        {
          title: "Le suivi entre les visites",
          body: "Une question, un doute, une gêne inhabituelle : le cabinet est le bon interlocuteur. Mieux vaut un appel de trop qu’un problème laissé de côté.",
        },
        {
          title: "La contention, à la fin",
          body: "Le traitement ne s’arrête pas quand les dents sont alignées. Les dents ont tendance à revenir vers leur position d’origine, et une contention est prescrite pour maintenir le résultat. Le praticien en explique la forme et la durée — et c’est souvent là que votre présence compte le plus, parce que l’enthousiasme du début est retombé.",
        },
        {
          title: "Le bon moment",
          body: "Faut-il commencer maintenant ou attendre ? La question n’a pas de réponse générale : elle dépend de la denture de votre adolescent et de la correction envisagée. C’est exactement la conversation à avoir lors d’un bilan, et la raison pour laquelle un avis précoce est utile même quand rien ne presse.",
        },
      ],
    },
    cta: {
      eyebrow: "PROCHAINE ÉTAPE",
      title: "La seule façon de savoir : un bilan.",
      body: "Un praticien certifié ORALIGN examine votre adolescent, vous dit si les aligneurs conviennent à son cas et vous explique franchement ce que le traitement demandera à l’un comme à l’autre. Vous décidez ensuite, en connaissance de cause.",
      action: "Trouver un praticien",
    },
  },
  en: {
    hero: {
      eyebrow: "ORALIGN · TEENAGERS",
      title: "Clear aligners for your teenager: what to know before you decide.",
      lede: "Your teenager is asking for clear aligners rather than a metal appliance. It is a fair request, and often a good sign: they care about their smile. What remains is whether their case suits aligners, and whether they are ready to commit. This page gives you what you need to talk it through with them — and then with a practitioner, who alone can decide.",
      cta: "Find a practitioner",
    },
    why: {
      eyebrow: "WHAT THEY WANT",
      title: "Why your teenager is asking for aligners.",
      intro:
        "The reasons they give are rarely medical. That does not make them less real: at this age, how you look to others matters, and an appliance you can take out changes the whole relationship with treatment.",
      items: [
        {
          title: "Discreet at school",
          body: "The trays are clear. In class, in photos, in the videos passed around between friends, they are barely noticeable. For many teenagers this is reason number one.",
        },
        {
          title: "Nothing metal",
          body: "No brackets or wires bonded to the teeth, and the appliance comes out when it needs to. That reassures anyone who dreads the look of visible treatment.",
        },
        {
          title: "Sport stays sport",
          body: "Depending on the activity, the practitioner will say whether the trays are better removed or a suitable guard worn. With nothing bonded to the teeth, the question stays simple.",
        },
        {
          title: "Eating without thinking about it",
          body: "The trays come out before a meal, and teeth are brushed before they go back in. The appliance itself rules out no food.",
        },
      ],
    },
    check: {
      eyebrow: "THE ASSESSMENT",
      title: "What the practitioner checks before saying yes.",
      body: "A teenager is not a smaller adult. Their mouth is still changing, and that change is part of the clinical reasoning. Which is why the answer never comes from a web page: it comes from an examination.",
      items: [
        {
          title: "The stage of dental development",
          body: "The practitioner looks at where the dentition stands: which teeth are already in place, which are still expected, and what that means for the treatment plan.",
        },
        {
          title: "Which teeth are actually through",
          body: "How many teeth have come through, and where they sit, determines what aligners can do and when it makes sense to do it.",
        },
        {
          title: "The nature of the correction involved",
          body: "Some movements suit aligners well; others much less so. The practitioner judges whether the case falls within that range.",
        },
        {
          title: "Oral health",
          body: "Decay to treat, hygiene, gums: these are settled before moving any teeth is considered.",
        },
        {
          title: "The teenager's own motivation",
          body: "It is part of the examination. The practitioner talks to them directly, not only to you.",
        },
      ],
      note: "At the end of that assessment the answer may be no — or not now, or not with aligners. Another appliance is sometimes better suited to the case, and saying so is part of the practitioner's job. An opinion that rules a solution out is still a useful opinion.",
    },
    wear: {
      eyebrow: "THE CONDITION",
      title: "An aligner does nothing while it sits in its case.",
      body: "This is the point to be blunt about, because it weighs on the outcome more than anything else. Aligners move teeth only while they are being worn. The practitioner sets the wear expected and when to move to the next tray; everything after that is decided at home, at school and at the weekend.",
      helps: {
        title: "What helps",
        body: "A simple routine that never changes: out before eating, brush, straight back in. One fixed place for the case. A reminder on the phone for the first few weeks. And an adult who asks how it is going without turning every meal into an inspection.",
      },
      honest: {
        title: "What has to be faced",
        body: "A teenager who does not want to wear their aligners will not wear them, and no marketing argument changes that. In that case aligners are not the right choice: better to say so to the practitioner, who can suggest another approach rather than start a treatment that will not progress.",
      },
    },
    daily: {
      eyebrow: "EVERYDAY LIFE",
      title: "What an ordinary day with aligners looks like.",
      intro: "Nothing complicated, but a few habits to settle in during the first days.",
      items: [
        {
          title: "Meals",
          body: "Trays out before eating, without exception, and teeth brushed before they go back in. At the school canteen as at home, the case stays in the bag.",
        },
        {
          title: "Drinks",
          body: "Water can be drunk with the trays in; for anything else, they come out first and teeth are brushed before they go back. The practitioner will spell out what they expect.",
        },
        {
          title: "Cleaning",
          body: "The trays are rinsed and cleaned gently, in the way the practitioner explains. Very hot water is to be avoided: it can distort the plastic.",
        },
        {
          title: "The case, always",
          body: "The rule that prevents the most trouble: in the mouth or in the case, never in a paper napkin or on the edge of a tray. That is how most aligners disappear.",
        },
        {
          title: "If one is lost or broken",
          body: "Do not skip a step and do not improvise. Call the practice: the practitioner says whether to go back to the previous tray, move on to the next, or have the piece remade.",
        },
      ],
    },
    parent: {
      eyebrow: "YOUR PART",
      title: "What falls to you.",
      body: "You are not there to police a tray. You are there to hold the frame around the treatment, and it is that frame that makes the difference.",
      items: [
        {
          title: "The appointments",
          body: "They set the rhythm of the treatment. The practitioner checks that the teeth are following the plan and adjusts if they are not. A rescheduled appointment is easily recovered; a run of missed ones eventually shows in the result.",
        },
        {
          title: "Follow-up between visits",
          body: "A question, a doubt, an unusual discomfort: the practice is the right place to take it. Better one call too many than a problem left alone.",
        },
        {
          title: "Retention, at the end",
          body: "Treatment does not stop when the teeth are aligned. Teeth tend to drift back toward where they started, and a retainer is prescribed to hold the result. The practitioner explains its form and how long it is worn — and this is often where your presence matters most, because the excitement of the beginning has worn off.",
        },
        {
          title: "The right moment",
          body: "Start now or wait? There is no general answer: it depends on your teenager's dentition and on the correction involved. That is exactly the conversation to have at an assessment, and the reason an early opinion is useful even when nothing is pressing.",
        },
      ],
    },
    cta: {
      eyebrow: "NEXT STEP",
      title: "The only way to know: an assessment.",
      body: "A certified ORALIGN practitioner examines your teenager, tells you whether aligners suit the case, and explains frankly what the treatment will ask of you both. You decide after that, with the facts in hand.",
      action: "Find a practitioner",
    },
  },
  ar: {
    hero: {
      eyebrow: "ORALIGN · المراهقون",
      title: "أجهزة التقويم الشفافة للمراهقين: ما ينبغي معرفته قبل اتخاذ القرار.",
      lede: "يطلب ابنك أو ابنتك أجهزة تقويم شفافة بدل التقويم المعدني. طلب مشروع، وغالباً ما يكون علامة جيدة: فهو اهتمام حقيقي بالابتسامة. يبقى أن نعرف هل تناسب الحالة هذا النوع من العلاج، وهل المراهق مستعد للالتزام به. تمنحك هذه الصفحة ما تحتاجه للحديث معه أولاً، ثم مع الطبيب الذي يعود إليه القرار وحده.",
      cta: "ابحث عن طبيب",
    },
    why: {
      eyebrow: "ما يتوقّعونه",
      title: "لماذا يطلب المراهقون الأجهزة الشفافة.",
      intro:
        "الأسباب التي يذكرونها نادراً ما تكون طبية، لكنها حقيقية: في هذه السن تهمّ الصورة التي يظهر بها المرء أمام الآخرين، وجهاز يمكن نزعه يغيّر علاقتهم بالعلاج كلها.",
      items: [
        {
          title: "غير ملحوظ في المدرسة",
          body: "الأجهزة شفافة، فلا تكاد تُلاحظ في القسم أو في الصور أو في مقاطع الفيديو التي يتبادلونها بين الأصدقاء. وهذا هو السبب الأول عند كثير من المراهقين.",
        },
        {
          title: "لا شيء معدني",
          body: "لا حاصرات ولا أسلاك ملصقة على الأسنان، والجهاز يُنزع عند الحاجة. وهذا يطمئن من يخشى مظهر العلاج الظاهر.",
        },
        {
          title: "الرياضة تبقى رياضة",
          body: "بحسب النشاط، يوضّح الطبيب هل الأفضل نزع الأجهزة أم استعمال واقٍ مناسب. ولأن لا شيء ملصقاً بالأسنان، تبقى المسألة بسيطة.",
        },
        {
          title: "الأكل دون تفكير",
          body: "تُنزع الأجهزة قبل الوجبة، وتُنظَّف الأسنان قبل إعادتها. والجهاز نفسه لا يمنع أي نوع من الطعام.",
        },
      ],
    },
    check: {
      eyebrow: "التقييم",
      title: "ما يتحقّق منه الطبيب قبل أن يوافق.",
      body: "المراهق ليس بالغاً بحجم أصغر؛ فمه ما زال يتغيّر، وهذا التغيّر جزء من التفكير السريري. لذلك لا تأتي الإجابة من صفحة على الإنترنت، بل من فحص.",
      items: [
        {
          title: "مرحلة النمو السنّي",
          body: "ينظر الطبيب إلى المرحلة التي بلغتها الأسنان: أيّها في موضعه فعلاً، وأيّها ما زال منتظراً، وما يعنيه ذلك بالنسبة إلى خطة العلاج.",
        },
        {
          title: "الأسنان البازغة فعلاً",
          body: "عدد الأسنان الظاهرة ومواضعها يحدّدان ما يمكن إنجازه بالأجهزة الشفافة، ومتى يكون من المناسب إنجازه.",
        },
        {
          title: "طبيعة التصحيح المطلوب",
          body: "بعض الحركات تناسب الأجهزة الشفافة، وبعضها أقل ملاءمة بكثير. ويقدّر الطبيب ما إذا كانت الحالة تدخل في هذا الإطار.",
        },
        {
          title: "صحة الفم والأسنان",
          body: "التسوّس الذي يحتاج علاجاً، والنظافة، وحالة اللثة: تُسوّى هذه النقاط قبل التفكير في تحريك الأسنان.",
        },
        {
          title: "دافعية المراهق نفسه",
          body: "وهي جزء من الفحص. يتحدّث الطبيب معه مباشرة، لا معك وحدك.",
        },
      ],
      note: "قد تكون النتيجة بعد هذا الفحص: لا — أو ليس الآن، أو ليس بالأجهزة الشفافة. فقد يكون جهاز آخر أنسب للحالة، وقول ذلك جزء من عمل الطبيب. والرأي الذي يستبعد حلاً يبقى رأياً مفيداً.",
    },
    wear: {
      eyebrow: "الشرط الأساسي",
      title: "الجهاز لا يفعل شيئاً وهو في علبته.",
      body: "هذه هي النقطة التي ينبغي قولها بصراحة، لأنها تؤثر في النتيجة أكثر من أي شيء آخر. فالأجهزة لا تحرّك الأسنان إلا أثناء ارتدائها. يحدّد الطبيب مدة الارتداء المطلوبة وموعد الانتقال إلى الجهاز التالي؛ أما ما عدا ذلك فيُحسم في البيت وفي المدرسة وفي عطلة نهاية الأسبوع.",
      helps: {
        title: "ما الذي يساعد",
        body: "روتين بسيط لا يتغيّر: نزع الجهاز قبل الأكل، تنظيف الأسنان، ثم إعادته فوراً. مكان ثابت للعلبة. تنبيه على الهاتف في الأسابيع الأولى. وحضور شخص بالغ يسأل كيف تسير الأمور دون أن يحوّل كل وجبة إلى مراقبة.",
      },
      honest: {
        title: "ما ينبغي مواجهته بصراحة",
        body: "المراهق الذي لا يريد ارتداء أجهزته لن يرتديها، ولا تغيّر الحجج التسويقية شيئاً في ذلك. في هذه الحالة لا تكون الأجهزة الشفافة الخيار المناسب: والأفضل قول ذلك للطبيب حتى يقترح مقاربة أخرى بدل بدء علاج لن يتقدّم.",
      },
    },
    daily: {
      eyebrow: "الحياة اليومية",
      title: "كيف يبدو يوم عادي مع الأجهزة الشفافة.",
      intro: "لا شيء معقّد، لكن هناك عادات قليلة ينبغي ترسيخها منذ الأيام الأولى.",
      items: [
        {
          title: "الوجبات",
          body: "تُنزع الأجهزة قبل الأكل دون استثناء، وتُنظَّف الأسنان قبل إعادتها. في المطعم المدرسي كما في البيت، تبقى العلبة في الحقيبة.",
        },
        {
          title: "المشروبات",
          body: "يُشرب الماء والأجهزة في مكانها؛ أما ما عداه فتُنزع الأجهزة أولاً، ثم تُنظَّف الأسنان قبل إعادتها. ويوضّح الطبيب ما ينتظره بالتحديد.",
        },
        {
          title: "التنظيف",
          body: "تُشطف الأجهزة وتُنظَّف برفق وفق الطريقة التي يشرحها الطبيب. ويُتجنَّب الماء شديد السخونة لأنه قد يشوّه البلاستيك.",
        },
        {
          title: "العلبة دائماً",
          body: "القاعدة التي تجنّب أكبر قدر من المتاعب: إمّا في الفم وإمّا في العلبة، لا في منديل ورقي ولا على حافة صينية. فهكذا تضيع أغلب الأجهزة.",
        },
        {
          title: "إذا ضاع جهاز أو انكسر",
          body: "لا تُقفز مرحلة ولا يُرتجل حلّ. يُتصل بالعيادة: الطبيب هو من يقول هل يُعاد الجهاز السابق، أم يُنتقل إلى التالي، أم تُعاد صناعة القطعة.",
        },
      ],
    },
    parent: {
      eyebrow: "دورك أنت",
      title: "ما الذي يعود إليك.",
      body: "دورك ليس مراقبة جهاز، بل الحفاظ على الإطار الذي يحيط بالعلاج، وهذا الإطار هو ما يصنع الفرق.",
      items: [
        {
          title: "المواعيد",
          body: "هي التي تنظّم إيقاع العلاج. يتحقّق الطبيب من أن الأسنان تسير وفق الخطة، ويعدّل إن لم تكن كذلك. موعد مؤجَّل يمكن تداركه، أما تراكم المواعيد الفائتة فينعكس في النهاية على النتيجة.",
        },
        {
          title: "المتابعة بين الزيارات",
          body: "سؤال أو شكّ أو إزعاج غير معتاد: العيادة هي الجهة المناسبة. واتصال زائد خير من مشكلة تُترك جانباً.",
        },
        {
          title: "التثبيت في النهاية",
          body: "لا ينتهي العلاج بمجرّد انتظام الأسنان. فللأسنان ميل إلى العودة نحو موضعها الأصلي، ويُوصف جهاز تثبيت للحفاظ على النتيجة. يشرح الطبيب شكله ومدّة ارتدائه — وهنا غالباً ما يكون حضورك أهمّ ما يكون، لأن حماس البداية يكون قد خفّ.",
        },
        {
          title: "الوقت المناسب",
          body: "هل نبدأ الآن أم ننتظر؟ لا جواب عامّ عن هذا السؤال: فهو يتوقّف على أسنان ابنك أو ابنتك وعلى طبيعة التصحيح المطلوب. وهذه بالضبط هي المحادثة التي تُجرى أثناء الفحص، والسبب الذي يجعل رأياً مبكراً مفيداً حتى لو لم يكن هناك ما يستعجل.",
        },
      ],
    },
    cta: {
      eyebrow: "الخطوة التالية",
      title: "الطريقة الوحيدة للمعرفة: فحص.",
      body: "يفحص طبيب معتمد من ORALIGN ابنك أو ابنتك، ويخبرك هل تناسب الأجهزة الشفافة هذه الحالة، ويشرح بصراحة ما سيتطلّبه العلاج منكما معاً. ثم تقرّرون عن بيّنة.",
      action: "ابحث عن طبيب",
    },
  },
};

const ctaClass =
  "mt-8 inline-flex min-h-12 items-center justify-center gap-3 bg-[var(--sc-sun)] px-6 py-3 text-center text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--sc-black)] no-underline transition-colors hover:bg-[var(--sc-sun-2)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--sc-black)]";

function Eyebrow({ label }: { label: string }) {
  return (
    <div className="mb-5 flex items-center gap-3 text-[0.58rem] uppercase tracking-[0.42em] text-[var(--sc-sun-deep)]">
      <span className="h-px w-8 bg-[var(--sc-sun-deep)]" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function Card({ item }: { item: Item }) {
  return (
    <article className="border border-[var(--sc-grey)] p-6 sm:p-7">
      <h3 className="sc-serif text-[1.1rem] font-normal leading-snug">{item.title}</h3>
      <p className="mt-3 text-[0.94rem] leading-7 text-[var(--sc-text-mid)]">{item.body}</p>
    </article>
  );
}

export function AdosPage() {
  const { lang } = useShowcaseLang();
  const copy = adosCopy[lang];

  return (
    <>
      {/* Hero */}
      <section
        id="ados-hero"
        data-section-tone="light"
        aria-labelledby="ados-hero-title"
        className="px-5 py-20 text-[var(--sc-black)] sm:px-8 sm:py-24 lg:px-12 lg:py-28"
      >
        <div className="mx-auto w-full max-w-[1240px]">
          <Reveal>
            <div className="max-w-[860px]">
              <Eyebrow label={copy.hero.eyebrow} />
              <h1
                id="ados-hero-title"
                className="sc-serif text-[clamp(1.9rem,3.8vw,3.3rem)] font-normal leading-[1.07]"
              >
                {copy.hero.title}
              </h1>
              <p className="mt-5 max-w-[680px] text-[0.98rem] leading-8 text-[var(--sc-text-mid)]">
                {copy.hero.lede}
              </p>
              <Link href="/trouver-un-praticien" className={ctaClass}>
                {copy.hero.cta}
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Why teenagers ask for aligners */}
      <section
        id="ados-pourquoi"
        data-section-tone="light"
        aria-labelledby="ados-pourquoi-title"
        className="bg-[rgba(25,25,25,0.025)] px-5 py-20 text-[var(--sc-black)] sm:px-8 sm:py-24 lg:px-12 lg:py-28"
      >
        <div className="mx-auto grid w-full max-w-[1240px] gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <Reveal>
            <div className="max-w-[520px]">
              <Eyebrow label={copy.why.eyebrow} />
              <h2
                id="ados-pourquoi-title"
                className="sc-serif text-[clamp(1.9rem,3.8vw,3.3rem)] font-normal leading-[1.07]"
              >
                {copy.why.title}
              </h2>
              <p className="mt-5 text-[0.98rem] leading-8 text-[var(--sc-text-mid)]">
                {copy.why.intro}
              </p>
            </div>
          </Reveal>

          <Reveal delay>
            <div className="grid gap-4 sm:grid-cols-2">
              {copy.why.items.map((item) => (
                <Card key={item.title} item={item} />
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* What the practitioner checks */}
      <section
        id="ados-evaluation"
        data-section-tone="light"
        aria-labelledby="ados-evaluation-title"
        className="px-5 py-20 text-[var(--sc-black)] sm:px-8 sm:py-24 lg:px-12 lg:py-28"
      >
        <div className="mx-auto w-full max-w-[1240px]">
          <Reveal>
            <div className="max-w-[720px]">
              <Eyebrow label={copy.check.eyebrow} />
              <h2
                id="ados-evaluation-title"
                className="sc-serif text-[clamp(1.9rem,3.8vw,3.3rem)] font-normal leading-[1.07]"
              >
                {copy.check.title}
              </h2>
              <p className="mt-5 text-[0.98rem] leading-8 text-[var(--sc-text-mid)]">
                {copy.check.body}
              </p>
            </div>
          </Reveal>

          <Reveal delay>
            <dl className="mt-12 border-t border-[var(--sc-grey)]">
              {copy.check.items.map((item) => (
                <div
                  key={item.title}
                  className="grid gap-2 border-b border-[var(--sc-grey)] py-6 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,2fr)] sm:gap-10 sm:py-7"
                >
                  <dt className="sc-serif text-[1.1rem] font-normal leading-snug">{item.title}</dt>
                  <dd className="text-[0.94rem] leading-7 text-[var(--sc-text-mid)]">{item.body}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-8 max-w-[760px] border-l-2 border-[var(--sc-sun)] pl-5 text-[0.94rem] leading-7 text-[var(--sc-text-mid)]">
              {copy.check.note}
            </p>
          </Reveal>
        </div>
      </section>

      {/* The honest requirement: wear */}
      <section
        id="ados-port"
        data-section-tone="light"
        aria-labelledby="ados-port-title"
        className="bg-[rgba(25,25,25,0.025)] px-5 py-20 text-[var(--sc-black)] sm:px-8 sm:py-24 lg:px-12 lg:py-28"
      >
        <div className="mx-auto grid w-full max-w-[1240px] gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <div className="max-w-[540px]">
              <Eyebrow label={copy.wear.eyebrow} />
              <h2
                id="ados-port-title"
                className="sc-serif text-[clamp(1.9rem,3.8vw,3.3rem)] font-normal leading-[1.07]"
              >
                {copy.wear.title}
              </h2>
              <p className="mt-5 text-[0.98rem] leading-8 text-[var(--sc-text-mid)]">
                {copy.wear.body}
              </p>
            </div>
          </Reveal>

          <Reveal delay>
            <div className="grid gap-4">
              <Card item={copy.wear.helps} />
              <article className="border border-[var(--sc-grey)] bg-[var(--sc-white)] p-6 sm:p-7">
                <h3 className="sc-serif text-[1.1rem] font-normal leading-snug">
                  {copy.wear.honest.title}
                </h3>
                <p className="mt-3 text-[0.94rem] leading-7 text-[var(--sc-text-mid)]">
                  {copy.wear.honest.body}
                </p>
              </article>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Everyday life */}
      <section
        id="ados-quotidien"
        data-section-tone="light"
        aria-labelledby="ados-quotidien-title"
        className="px-5 py-20 text-[var(--sc-black)] sm:px-8 sm:py-24 lg:px-12 lg:py-28"
      >
        <div className="mx-auto w-full max-w-[1240px]">
          <Reveal>
            <div className="max-w-[720px]">
              <Eyebrow label={copy.daily.eyebrow} />
              <h2
                id="ados-quotidien-title"
                className="sc-serif text-[clamp(1.9rem,3.8vw,3.3rem)] font-normal leading-[1.07]"
              >
                {copy.daily.title}
              </h2>
              <p className="mt-5 text-[0.98rem] leading-8 text-[var(--sc-text-mid)]">
                {copy.daily.intro}
              </p>
            </div>
          </Reveal>

          <Reveal delay>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {copy.daily.items.map((item) => (
                <Card key={item.title} item={item} />
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* The parent's part */}
      <section
        id="ados-parent"
        data-section-tone="light"
        aria-labelledby="ados-parent-title"
        className="bg-[rgba(25,25,25,0.025)] px-5 py-20 text-[var(--sc-black)] sm:px-8 sm:py-24 lg:px-12 lg:py-28"
      >
        <div className="mx-auto grid w-full max-w-[1240px] gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <Reveal>
            <div className="max-w-[520px]">
              <Eyebrow label={copy.parent.eyebrow} />
              <h2
                id="ados-parent-title"
                className="sc-serif text-[clamp(1.9rem,3.8vw,3.3rem)] font-normal leading-[1.07]"
              >
                {copy.parent.title}
              </h2>
              <p className="mt-5 text-[0.98rem] leading-8 text-[var(--sc-text-mid)]">
                {copy.parent.body}
              </p>
            </div>
          </Reveal>

          <Reveal delay>
            <div className="grid gap-4 sm:grid-cols-2">
              {copy.parent.items.map((item) => (
                <Card key={item.title} item={item} />
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Closing CTA */}
      <section
        id="ados-cta"
        data-section-tone="light"
        aria-labelledby="ados-cta-title"
        className="px-5 py-20 text-[var(--sc-black)] sm:px-8 sm:py-24 lg:px-12 lg:py-28"
      >
        <div className="mx-auto w-full max-w-[1240px]">
          <Reveal>
            <div className="border border-[var(--sc-grey)] p-8 sm:p-12 lg:p-16">
              <div className="max-w-[720px]">
                <Eyebrow label={copy.cta.eyebrow} />
                <h2
                  id="ados-cta-title"
                  className="sc-serif text-[clamp(1.9rem,3.8vw,3.3rem)] font-normal leading-[1.07]"
                >
                  {copy.cta.title}
                </h2>
                <p className="mt-5 text-[0.98rem] leading-8 text-[var(--sc-text-mid)]">
                  {copy.cta.body}
                </p>
                <Link href="/trouver-un-praticien" className={ctaClass}>
                  {copy.cta.action}
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}

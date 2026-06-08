/**
 * Dashboard-side i18n dictionary.
 *
 * Why a TypeScript dictionary (not react-i18next, not next-intl):
 *   1. The showcase area already ships its own context-based i18n in
 *      `src/app/(showcase)/_lib/i18n/`. Adopting the same shape on the
 *      dashboard keeps the codebase consistent.
 *   2. Type-safety: every key path is autocompleted + statically
 *      checked. Renaming a key surfaces every call site.
 *   3. No new runtime dependency — the translation cost is one
 *      synchronous object lookup, no loader, no Suspense boundary.
 *   4. Translations live next to each other so a reviewer can spot a
 *      missing language at a glance instead of diffing three JSON
 *      files in three windows.
 *
 * Structure: every leaf is `{ en, fr, ar }`. Sections nest freely.
 *
 * RTL: Arabic switches the `<html dir>` attribute (handled by
 * `useLang`). Components don't need to know which language is active
 * — they just call `t('section.key')` and Tailwind's logical
 * properties (`ms-*` / `me-*`) handle layout.
 */

export type Lang = 'en' | 'fr' | 'ar';

export const LANGS: readonly Lang[] = ['en', 'fr', 'ar'] as const;
export const DEFAULT_LANG: Lang = 'en';

type T = Record<Lang, string>;

export const dict = {
  // ─── Generic / cross-cutting ────────────────────────────────────
  common: {
    save: { en: 'Save', fr: 'Enregistrer', ar: 'حفظ' } as T,
    saveChanges: { en: 'Save changes', fr: 'Enregistrer les modifications', ar: 'حفظ التغييرات' } as T,
    saveDraft: { en: 'Save draft', fr: 'Enregistrer le brouillon', ar: 'حفظ المسودة' } as T,
    cancel: { en: 'Cancel', fr: 'Annuler', ar: 'إلغاء' } as T,
    close: { en: 'Close', fr: 'Fermer', ar: 'إغلاق' } as T,
    confirm: { en: 'Confirm', fr: 'Confirmer', ar: 'تأكيد' } as T,
    submit: { en: 'Submit', fr: 'Soumettre', ar: 'إرسال' } as T,
    back: { en: 'Back', fr: 'Retour', ar: 'رجوع' } as T,
    continue: { en: 'Continue', fr: 'Continuer', ar: 'متابعة' } as T,
    edit: { en: 'Edit', fr: 'Modifier', ar: 'تعديل' } as T,
    delete: { en: 'Delete', fr: 'Supprimer', ar: 'حذف' } as T,
    loading: { en: 'Loading…', fr: 'Chargement…', ar: 'جاري التحميل…' } as T,
    search: { en: 'Search', fr: 'Rechercher', ar: 'بحث' } as T,
    yes: { en: 'Yes', fr: 'Oui', ar: 'نعم' } as T,
    no: { en: 'No', fr: 'Non', ar: 'لا' } as T,
    optional: { en: 'Optional', fr: 'Facultatif', ar: 'اختياري' } as T,
    required: { en: 'Required', fr: 'Obligatoire', ar: 'مطلوب' } as T,
    notSet: { en: 'Not set', fr: 'Non défini', ar: 'غير محدد' } as T,
    actions: { en: 'Actions', fr: 'Actions', ar: 'الإجراءات' } as T,
    next: { en: 'Next', fr: 'Suivant', ar: 'التالي' } as T,
    previous: { en: 'Previous', fr: 'Précédent', ar: 'السابق' } as T,
    yourTurn: { en: 'Your turn', fr: 'À vous', ar: 'دورك' } as T,
  },

  // ─── Language switcher ──────────────────────────────────────────
  language: {
    label: { en: 'Language', fr: 'Langue', ar: 'اللغة' } as T,
    english: { en: 'English', fr: 'Anglais', ar: 'الإنجليزية' } as T,
    french: { en: 'French', fr: 'Français', ar: 'الفرنسية' } as T,
    arabic: { en: 'Arabic', fr: 'Arabe', ar: 'العربية' } as T,
  },

  // ─── Order list / status badges ─────────────────────────────────
  orders: {
    listTitle: { en: 'Orders', fr: 'Commandes', ar: 'الطلبات' } as T,
    newOrder: { en: 'New order', fr: 'Nouvelle commande', ar: 'طلب جديد' } as T,

    // Order status enum → human label. Used everywhere a row renders
    // its current step in the lifecycle.
    statusLabel: {
      draft: { en: 'Draft', fr: 'Brouillon', ar: 'مسودة' } as T,
      submitted: { en: 'Submitted', fr: 'Soumis', ar: 'مُرسل' } as T,
      under_review: { en: 'Under review', fr: 'En cours d’examen', ar: 'قيد المراجعة' } as T,
      treatment_planning: { en: 'Treatment planning', fr: 'Planification du traitement', ar: 'تخطيط العلاج' } as T,
      treatment_plan_ready: { en: 'Treatment ready', fr: 'Plan prêt', ar: 'الخطة جاهزة' } as T,
      revision_requested: { en: 'Revision requested', fr: 'Révision demandée', ar: 'مراجعة مطلوبة' } as T,
      treatment_approved: { en: 'Treatment approved', fr: 'Traitement approuvé', ar: 'تم اعتماد العلاج' } as T,
      quotation_sent: { en: 'Quotation sent', fr: 'Devis envoyé', ar: 'تم إرسال عرض السعر' } as T,
      payment_plan_selected: { en: 'Payment plan selected', fr: 'Plan de paiement choisi', ar: 'تم اختيار خطة الدفع' } as T,
      payment_pending: { en: 'Payment pending', fr: 'Paiement en attente', ar: 'الدفع قيد الانتظار' } as T,
      payment_review: { en: 'Payment review', fr: 'Paiement en révision', ar: 'مراجعة الدفع' } as T,
      paid: { en: 'Paid', fr: 'Payé', ar: 'مدفوع' } as T,
      fabrication: { en: 'Fabrication', fr: 'Fabrication', ar: 'التصنيع' } as T,
      ready_to_ship: { en: 'Ready to ship', fr: 'Prêt à expédier', ar: 'جاهز للشحن' } as T,
      shipped: { en: 'Shipped', fr: 'Expédié', ar: 'تم الشحن' } as T,
      finished: { en: 'Finished', fr: 'Terminé', ar: 'منتهٍ' } as T,
      canceled: { en: 'Canceled', fr: 'Annulé', ar: 'مُلغى' } as T,
      // Legacy enum values still present in the DB.
      in_review: { en: 'In review', fr: 'En révision', ar: 'قيد المراجعة' } as T,
      approved: { en: 'Approved', fr: 'Approuvé', ar: 'موافق عليه' } as T,
      rejected: { en: 'Rejected', fr: 'Rejeté', ar: 'مرفوض' } as T,
      cancelled: { en: 'Cancelled', fr: 'Annulé', ar: 'مُلغى' } as T,
    },

    // Derived treatment-fee badge that lives next to OrderStatus.
    feeBadge: {
      paid: { en: 'Fee paid', fr: 'Honoraires payés', ar: 'الأتعاب مدفوعة' } as T,
      pending: { en: 'Fee pending', fr: 'Honoraires en attente', ar: 'الأتعاب قيد الانتظار' } as T,
      rejected: { en: 'Fee rejected', fr: 'Honoraires rejetés', ar: 'الأتعاب مرفوضة' } as T,
      unpaid: { en: 'Fee unpaid', fr: 'Honoraires non payés', ar: 'الأتعاب غير مدفوعة' } as T,
    },
  },

  // ─── Order form (the wizard) ────────────────────────────────────
  // Strings used by the multi-step order creation form. Translations
  // use proper Tunisian-French orthodontic terminology (e.g. "Motif
  // de consultation" rather than the literal "Plainte principale").
  orderForm: {
    titleCreate: { en: 'Create order', fr: 'Créer une commande', ar: 'إنشاء طلب' } as T,
    titleEdit: { en: 'Edit order', fr: 'Modifier la commande', ar: 'تعديل الطلب' } as T,
    titleSubmitted: { en: 'Order details', fr: 'Détails de la commande', ar: 'تفاصيل الطلب' } as T,
    of: { en: 'of', fr: 'sur', ar: 'من' } as T,
    step: { en: 'Step', fr: 'Étape', ar: 'الخطوة' } as T,

    steps: {
      patient: { en: 'Patient', fr: 'Patient', ar: 'المريض' } as T,
      images: { en: 'Patient images', fr: 'Photos du patient', ar: 'صور المريض' } as T,
      radiography: { en: 'Radiography & scans', fr: 'Radiographies & empreintes', ar: 'الأشعّة والمسح الضوئي' } as T,
      treatment: { en: 'Treatment plan', fr: 'Plan de traitement', ar: 'خطة العلاج' } as T,
      advanced: { en: 'Advanced movements', fr: 'Mouvements avancés', ar: 'الحركات المتقدّمة' } as T,
      review: { en: 'Review & submit', fr: 'Vérifier & soumettre', ar: 'المراجعة والإرسال' } as T,
    },

    // ── Patient step ─────────────────────────────────────────────
    patient: {
      // Choice cards atop the step
      chooseOneOfYour: { en: 'Select one of your patients', fr: 'Choisir un de vos patients', ar: 'اختر أحد مرضاك' } as T,
      chooseExistingHint: {
        en: 'Choose an existing patient from your list.',
        fr: 'Choisissez un patient existant dans votre liste.',
        ar: 'اختر مريضًا موجودًا من قائمتك.',
      } as T,
      createNewCardTitle: { en: 'Create a new patient', fr: 'Créer un nouveau patient', ar: 'إنشاء مريض جديد' } as T,
      createNewHint: {
        en: 'Add details to create a new patient.',
        fr: 'Renseignez les informations pour créer un nouveau patient.',
        ar: 'أدخل المعلومات لإنشاء مريض جديد.',
      } as T,
      // Selects
      dentistLabel: { en: 'Dentist', fr: 'Praticien', ar: 'الطبيب' } as T,
      selectDentistPh: { en: 'Select dentist', fr: 'Choisir un praticien', ar: 'اختر طبيبًا' } as T,
      patientLabel: { en: 'Patient', fr: 'Patient', ar: 'المريض' } as T,
      selectPatientFromListPh: {
        en: 'Select patient from your list',
        fr: 'Choisir un patient dans votre liste',
        ar: 'اختر مريضًا من قائمتك',
      } as T,
      // Form fields (inline new-patient form)
      patientNameLabel: { en: 'Patient name', fr: 'Nom du patient', ar: 'اسم المريض' } as T,
      fullNameInputPh: { en: 'Full name', fr: 'Nom complet', ar: 'الاسم الكامل' } as T,
      phoneInputPh: { en: '+216 12 345 678', fr: '+216 12 345 678', ar: '+216 12 345 678' } as T,
      addressInputPh: { en: 'Street, city, postal code', fr: 'Rue, ville, code postal', ar: 'الشارع، المدينة، الرمز البريدي' } as T,
      genderLabel: { en: 'Gender', fr: 'Sexe', ar: 'الجنس' } as T,
      selectGenderPh: { en: 'Select patient gender', fr: 'Choisir le sexe du patient', ar: 'اختر جنس المريض' } as T,
      notesLabel: { en: 'Notes', fr: 'Notes', ar: 'ملاحظات' } as T,
      notesInputPh: {
        en: 'Allergies, medical history, anything the planner should know…',
        fr: 'Allergies, antécédents médicaux, toute information utile au planificateur…',
        ar: 'الحساسية، التاريخ الطبي، أي معلومة مفيدة للمخطّط…',
      } as T,

      sectionTitle: { en: 'Patient information', fr: 'Informations du patient', ar: 'معلومات المريض' } as T,
      sectionHint: {
        en: 'Pick an existing patient from your case files, or create a new one in seconds.',
        fr: 'Choisissez un patient existant dans votre dossier, ou créez-en un nouveau en quelques secondes.',
        ar: 'اختر مريضًا موجودًا من ملفّاتك أو أنشئ ملفًّا جديدًا في ثوانٍ.',
      } as T,
      pickExisting: { en: 'Existing patient', fr: 'Patient existant', ar: 'مريض موجود' } as T,
      createNew: { en: 'New patient', fr: 'Nouveau patient', ar: 'مريض جديد' } as T,
      pickerLabel: { en: 'Pick a patient', fr: 'Choisir un patient', ar: 'اختر المريض' } as T,
      pickerPlaceholder: { en: 'Search by name…', fr: 'Rechercher par nom…', ar: 'ابحث بالاسم…' } as T,

      // Fields
      fullName: { en: 'Full name', fr: 'Nom complet', ar: 'الاسم الكامل' } as T,
      fullNamePh: { en: 'e.g. John Doe', fr: 'p. ex. Jean Dupont', ar: 'مثال: محمد علي' } as T,
      email: { en: 'Email', fr: 'E-mail', ar: 'البريد الإلكتروني' } as T,
      emailPh: { en: 'patient@example.com', fr: 'patient@example.com', ar: 'patient@example.com' } as T,
      phone: { en: 'Phone', fr: 'Téléphone', ar: 'الهاتف' } as T,
      phonePh: { en: '+216…', fr: '+216…', ar: '+216…' } as T,
      address: { en: 'Address', fr: 'Adresse', ar: 'العنوان' } as T,
      addressPh: { en: 'Street, city', fr: 'Rue, ville', ar: 'الشارع، المدينة' } as T,
      dob: { en: 'Date of birth', fr: 'Date de naissance', ar: 'تاريخ الميلاد' } as T,
      age: { en: 'Age', fr: 'Âge', ar: 'العمر' } as T,
      ageYears: { en: 'years', fr: 'ans', ar: 'سنوات' } as T,
      sex: { en: 'Sex', fr: 'Sexe', ar: 'الجنس' } as T,
      sexFemale: { en: 'Female', fr: 'Femme', ar: 'أنثى' } as T,
      sexMale: { en: 'Male', fr: 'Homme', ar: 'ذكر' } as T,
      sexOther: { en: 'Other', fr: 'Autre', ar: 'آخر' } as T,
      patientStage: { en: 'Patient stage', fr: 'Phase du patient', ar: 'مرحلة المريض' } as T,
      stageInitial: { en: 'Initial', fr: 'Initiale', ar: 'الأولية' } as T,
      stageRefinement: { en: 'Refinement', fr: 'Affinage', ar: 'التحسين' } as T,
      stageRetainer: { en: 'Retainer', fr: 'Contention', ar: 'التثبيت' } as T,
      notes: { en: 'Patient notes', fr: 'Notes patient', ar: 'ملاحظات المريض' } as T,
      notesPh: { en: 'Any clinical context the team should know about…', fr: 'Tout contexte clinique utile à l’équipe…', ar: 'أي معلومات سريرية يجب أن يعرفها الفريق…' } as T,
      dentist: { en: 'Treating dentist', fr: 'Praticien traitant', ar: 'الطبيب المعالج' } as T,
      dentistPickerPh: { en: 'Assign to a dentist…', fr: 'Affecter à un praticien…', ar: 'إسناد إلى الطبيب…' } as T,
    },

    // ── Clinical files step (patient images + radio) ─────────────
    files: {
      images: {
        title: { en: 'Patient images', fr: 'Photos du patient', ar: 'صور المريض' } as T,
        hint: {
          en: 'Upload each focus and intraoral view. The field reference shows the expected angle — rotate or flip your photo to match before it uploads.',
          fr: 'Téléversez chaque vue, du sourire à l’intra-oral. La photo de référence indique l’angle attendu — pivotez ou retournez votre image avant le téléversement.',
          ar: 'حمّل كل لقطة من الصور خارج وداخل الفم. الصورة المرجعية تبيّن الزاوية المتوقّعة — دوّر صورتك أو اقلبها لتطابقها قبل التحميل.',
        } as T,
      },
      radiography: {
        title: { en: 'Radiography & STL scans', fr: 'Radiographies & empreintes STL', ar: 'الأشعّة وملفات STL' } as T,
        hint: {
          en: 'Attach panoramic + cephalometric radiographs, plus the upper / lower digital impressions (STL or DCM).',
          fr: 'Joignez la panoramique et la téléradiographie de profil, ainsi que les empreintes numériques supérieures et inférieures (STL ou DCM).',
          ar: 'أرفق الأشعة البانورامية والقياسات الجانبية، إضافة إلى الطبعات الرقمية العلوية والسفلية (STL أو DCM).',
        } as T,
      },
      cbctRequested: { en: 'CBCT requested', fr: 'CBCT demandé', ar: 'طُلب CBCT' } as T,
    },

    // ── Treatment plan step ──────────────────────────────────────
    treatment: {
      // Fieldset legends
      patientStageLegend: { en: 'Patient stage', fr: 'Phase du patient', ar: 'مرحلة المريض' } as T,
      patientStageHint: {
        en: 'Where the patient is in their treatment lifecycle.',
        fr: 'Où en est le patient dans son parcours de traitement.',
        ar: 'في أي مرحلة من العلاج يقع المريض.',
      } as T,
      // Per-stage helper text shown under each ChoiceCard
      stageInitialDesc: {
        en: 'First aligner setup for this patient.',
        fr: 'Premier traitement par aligneurs pour ce patient.',
        ar: 'أول مجموعة من المصفّات لهذا المريض.',
      } as T,
      stageRefinementDesc: {
        en: 'Top-up after the first treatment phase.',
        fr: 'Reprise après la première phase de traitement.',
        ar: 'استكمال بعد المرحلة الأولى من العلاج.',
      } as T,
      stageRetainerDesc: {
        en: 'Retention only — keep teeth in their corrected position.',
        fr: 'Contention uniquement — maintenir la position corrigée.',
        ar: 'تثبيت فقط — للحفاظ على وضع الأسنان المُصحَّح.',
      } as T,

      archTreatmentLegend: { en: 'Arch treatment', fr: 'Traitement des arcades', ar: 'علاج الأقواس' } as T,
      archTreatmentHint: {
        en: 'Which arch(es) the planner will treat.',
        fr: 'Quelle(s) arcade(s) seront traitées par le planificateur.',
        ar: 'أيّ الأقواس سيعالجها المخطّط.',
      } as T,
      chiefComplaintLegend: { en: 'Chief complaint', fr: 'Motif de consultation', ar: 'سبب الاستشارة' } as T,
      chiefComplaintHint: {
        en: 'The patient’s main concern in their own words.',
        fr: 'La préoccupation principale du patient, dans ses propres mots.',
        ar: 'شكوى المريض الرئيسية بكلماته.',
      } as T,
      chiefComplaintInputPh: {
        en: 'Describe the patient’s main concern…',
        fr: 'Décrivez la préoccupation principale du patient…',
        ar: 'صف الشكوى الرئيسية للمريض…',
      } as T,

      treatmentPlanLegend: { en: 'Treatment plan', fr: 'Plan de traitement', ar: 'خطة العلاج' } as T,
      treatmentPlanHint: {
        en: 'Which segments the planner is allowed to move.',
        fr: 'Quels segments le planificateur est autorisé à déplacer.',
        ar: 'الأجزاء التي يُسمح للمخطّط بتحريكها.',
      } as T,
      // Treatment-plan option pills (the saved string is English; this maps to localized labels)
      planFullArch: { en: 'Full Arch', fr: 'Arcade complète', ar: 'القوس بأكمله' } as T,
      planAnteriorOnly: { en: 'Anterior only', fr: 'Antérieurs uniquement', ar: 'الأماميات فقط' } as T,
      plan4to4: { en: '4 to 4 only', fr: 'De 4 à 4 uniquement', ar: 'من 4 إلى 4 فقط' } as T,
      planDontMove67: { en: 'Don’t move 6 / 7', fr: 'Ne pas déplacer 6 / 7', ar: 'عدم تحريك 6 و 7' } as T,

      apLegend: { en: 'A-P relationship', fr: 'Relation A-P', ar: 'العلاقة الأمامية الخلفية' } as T,
      apHint: {
        en: 'Antero-posterior treatment goal for canines and molars.',
        fr: 'Objectif antéro-postérieur pour les canines et les molaires.',
        ar: 'الهدف الأمامي الخلفي للأنياب والأرحاء.',
      } as T,
      apMaintainOpt: { en: 'Maintain', fr: 'Maintenir', ar: 'حفظ' } as T,
      apImproveCanine: { en: 'Improve canine only', fr: 'Améliorer la canine uniquement', ar: 'تحسين الناب فقط' } as T,
      apImproveCanineMolar: { en: 'Improve canine and molar', fr: 'Améliorer canine et molaire', ar: 'تحسين الناب والرحى' } as T,
      apCorrectBoth: { en: 'Correct both molar and canine', fr: 'Corriger molaire et canine', ar: 'تصحيح الرحى والناب معًا' } as T,

      chiefComplaint: { en: 'Chief complaint', fr: 'Motif de consultation', ar: 'سبب الاستشارة' } as T,
      chiefComplaintPh: {
        en: 'What does the patient want to fix? E.g. crowded lower arch, gaps, midline shift…',
        fr: 'Que souhaite corriger le patient ? P. ex. encombrement inférieur, diastèmes, déviation médiane…',
        ar: 'ما الذي يرغب المريض في إصلاحه؟ مثل ازدحام الأسنان السفلية، الفراغات، انحراف الخط المتوسط…',
      } as T,
      additionalNotes: { en: 'Additional clinical notes', fr: 'Notes cliniques supplémentaires', ar: 'ملاحظات سريرية إضافية' } as T,
      additionalNotesPh: {
        en: 'Anything else the planner should consider for this case.',
        fr: 'Toute autre information utile au planificateur pour ce cas.',
        ar: 'أي معلومات إضافية يجب على المخطّط مراعاتها.',
      } as T,

      // Arch treatment
      archTreatment: { en: 'Arch treatment', fr: 'Traitement des arcades', ar: 'علاج الأقواس' } as T,
      archUpper: { en: 'Upper arch', fr: 'Arcade supérieure', ar: 'القوس العلوي' } as T,
      archLower: { en: 'Lower arch', fr: 'Arcade inférieure', ar: 'القوس السفلي' } as T,
      archBoth: { en: 'Both arches', fr: 'Les deux arcades', ar: 'كلا القوسين' } as T,

      // Treatment scope (full / anterior / partial)
      treatmentScope: { en: 'Treatment scope', fr: 'Étendue du traitement', ar: 'نطاق العلاج' } as T,
      scopeFull: { en: 'Full arch', fr: 'Arcade complète', ar: 'القوس بأكمله' } as T,
      scopeAnterior: { en: 'Anterior only', fr: 'Antérieurs uniquement', ar: 'الأماميات فقط' } as T,
      scope4to4: { en: '4 to 4 only', fr: 'De 4 à 4 uniquement', ar: 'من 4 إلى 4 فقط' } as T,
      scopeNoMove67: { en: 'Don’t move 6 / 7', fr: 'Ne pas déplacer 6 / 7', ar: 'عدم تحريك 6 و 7' } as T,

      // A-P relationship (sagittal class)
      apRelationship: { en: 'Antero-posterior relationship', fr: 'Relation antéro-postérieure', ar: 'العلاقة الأمامية الخلفية' } as T,
      apClassI: { en: 'Class I — maintain', fr: 'Classe I — à maintenir', ar: 'الفئة الأولى — حفظ' } as T,
      apClassIIcorrect: { en: 'Class II — correct', fr: 'Classe II — à corriger', ar: 'الفئة الثانية — تصحيح' } as T,
      apClassIIIcorrect: { en: 'Class III — correct', fr: 'Classe III — à corriger', ar: 'الفئة الثالثة — تصحيح' } as T,
      apMaintain: { en: 'Maintain current relationship', fr: 'Maintenir la relation actuelle', ar: 'حفظ العلاقة الحالية' } as T,

      midline: { en: 'Midline', fr: 'Ligne médiane', ar: 'الخط المتوسط' } as T,
      midlineMaintain: { en: 'Maintain', fr: 'Maintenir', ar: 'حفظ' } as T,
      midlineCorrect: { en: 'Correct', fr: 'Corriger', ar: 'تصحيح' } as T,
      midlineImprove: { en: 'Improve where possible', fr: 'Améliorer si possible', ar: 'تحسين قدر الإمكان' } as T,
    },

    // ── Advanced movements step ──────────────────────────────────
    advanced: {
      // Helper text under each <legend>
      elasticsHint: {
        en: 'Pick the primary elastic configuration. Use the notes field for wear time, hook positions or a secondary type.',
        fr: 'Choisissez la configuration principale d’élastiques. Utilisez le champ de notes pour le port, les crochets ou un type secondaire.',
        ar: 'اختر إعداد المطّاطات الأساسي. استخدم خانة الملاحظات لمدة الارتداء، مواضع الخطّاف أو نوعٍ ثانوي.',
      } as T,
      elasticsNotesLabel: { en: 'Notes (optional)', fr: 'Notes (facultatif)', ar: 'ملاحظات (اختياري)' } as T,
      elasticsNotesPh: {
        en: 'e.g. Full-time wear; upper canine → lower first molar',
        fr: 'p. ex. port permanent ; canine supérieure → première molaire inférieure',
        ar: 'مثال: ارتداء دائم؛ الناب العلوي → الرحى الأولى السفلية',
      } as T,
      openBiteHint: {
        en: 'What should happen to the open bite during treatment?',
        fr: 'Que faire de la béance pendant le traitement ?',
        ar: 'ماذا يحدث للعضّة المفتوحة أثناء العلاج؟',
      } as T,
      openBiteCorrectOpt: { en: 'Correct', fr: 'Corriger', ar: 'تصحيح' } as T,
      openBiteMaintainOpt: { en: 'Maintain', fr: 'Maintenir', ar: 'حفظ' } as T,
      openBiteImprovedOpt: { en: 'Improved', fr: 'Amélioration', ar: 'تحسين' } as T,

      midlineHint: {
        en: 'Should the dental midline be maintained or corrected?',
        fr: 'La ligne médiane dentaire doit-elle être maintenue ou corrigée ?',
        ar: 'هل يجب الحفاظ على الخط المتوسط أم تصحيحه؟',
      } as T,
      midlineMaintainOpt: { en: 'Maintain', fr: 'Maintenir', ar: 'حفظ' } as T,
      midlineCorrectOpt: { en: 'Correct', fr: 'Corriger', ar: 'تصحيح' } as T,

      iprHint: {
        en: 'Pick where interproximal reduction is allowed.',
        fr: 'Indiquez où la réduction interproximale est autorisée.',
        ar: 'حدّد المواضع المسموح فيها بالتقليم بين الأسنان.',
      } as T,

      biteRampsHint: {
        en: 'Where should the planner place bite ramps, if any?',
        fr: 'Où le planificateur doit-il placer des plans de morsure, si nécessaire ?',
        ar: 'أين يضع المخطّط مرتفعات العضّ، إن وُجدت؟',
      } as T,
      biteRampsNoneOpt: { en: 'No bite ramps', fr: 'Aucun plan de morsure', ar: 'لا توجد مرتفعات' } as T,
      biteRampsAnteriorOpt: { en: 'Anterior', fr: 'Antérieurs', ar: 'الأماميات' } as T,
      biteRampsCanineOpt: { en: 'Canine / cuspid', fr: 'Canines', ar: 'الأنياب' } as T,
      biteRampsMolarOpt: { en: 'Molar', fr: 'Molaires', ar: 'الأرحاء' } as T,

      expansionHint: {
        en: 'Select the segment that needs expansion, or “No expansion” if the arches are well-developed.',
        fr: 'Sélectionnez le segment à expandre, ou « Pas d’expansion » si les arcades sont déjà bien développées.',
        ar: 'اختر الجزء الذي يحتاج إلى توسعة، أو "لا توسعة" إذا كانت الأقواس جيدة.',
      } as T,
      expansionNoneOpt: { en: 'No expansion', fr: 'Pas d’expansion', ar: 'لا توسعة' } as T,

      crossbiteHint: {
        en: 'What should happen to any present crossbite?',
        fr: 'Que faire de l’articulé inversé, s’il est présent ?',
        ar: 'ماذا يحدث للعضّة المعكوسة إن وُجدت؟',
      } as T,
      crossbiteCorrectOpt: { en: 'Correct', fr: 'Corriger', ar: 'تصحيح' } as T,
      crossbiteMaintainOpt: { en: 'Maintain', fr: 'Maintenir', ar: 'حفظ' } as T,
      crossbiteAnteriorOpt: { en: 'Correct only anterior', fr: 'Corriger seulement les antérieurs', ar: 'تصحيح الأماميات فقط' } as T,
      crossbitePosteriorOpt: { en: 'Correct only posterior', fr: 'Corriger seulement les postérieurs', ar: 'تصحيح الخلفيات فقط' } as T,

      spacesHint: {
        en: 'Close existing spaces or maintain them for future restorative work?',
        fr: 'Fermer les espaces existants ou les maintenir pour un futur traitement prothétique ?',
        ar: 'إغلاق الفراغات الحالية أم الحفاظ عليها لعمل تعويضي مستقبلي؟',
      } as T,
      spacesCloseOpt: { en: 'Close all spaces', fr: 'Fermer tous les espaces', ar: 'إغلاق جميع الفراغات' } as T,
      spacesMaintainOpt: { en: 'Maintain spaces', fr: 'Maintenir les espaces', ar: 'الحفاظ على الفراغات' } as T,
      spacesNotesPh: {
        en: 'e.g. Close upper midline diastema; maintain space at #15 for future implant',
        fr: 'p. ex. fermer le diastème médian supérieur ; conserver l’espace en #15 pour un futur implant',
        ar: 'مثال: إغلاق الفجوة المتوسطة العلوية؛ الحفاظ على المساحة عند 15 لزرعة مستقبلية',
      } as T,

      // Generic segment options shared by IPR / Expansion
      segmentNo: { en: 'No', fr: 'Non', ar: 'لا' } as T,
      segmentNoIpr: { en: 'No IPR', fr: 'Pas d’IPR', ar: 'بدون IPR' } as T,
      segmentAnterior: { en: 'Anterior', fr: 'Antérieurs', ar: 'الأماميات' } as T,
      segmentPosterior: { en: 'Posterior', fr: 'Postérieurs', ar: 'الخلفيات' } as T,
      segmentBoth: { en: 'Both', fr: 'Les deux', ar: 'كلاهما' } as T,

      extractionsHint: {
        en: 'Teeth flagged with the orange Extract chip in the odontogram above appear here automatically. Use the notes field for confirmation, sequencing or extra context.',
        fr: 'Les dents marquées en orange « Extract » dans l’odontogramme apparaissent ici automatiquement. Utilisez les notes pour la confirmation, la séquence ou tout contexte additionnel.',
        ar: 'الأسنان المعلَّمة بالشريحة البرتقالية "Extract" في مخطط الأسنان أعلاه تظهر هنا تلقائيًا. استخدم الملاحظات للتأكيد، التسلسل أو السياق الإضافي.',
      } as T,
      extractionsTeethTitle: {
        en: 'Selected tooth-level instructions (FDI)',
        fr: 'Dents sélectionnées (notation FDI)',
        ar: 'الأسنان المختارة (ترقيم FDI)',
      } as T,
      extractionsEmpty: {
        en: 'No teeth marked for extraction yet. Click a tooth in the odontogram above and pick Extract to add it here.',
        fr: 'Aucune dent à extraire pour le moment. Cliquez une dent dans l’odontogramme et choisissez « Extract » pour l’ajouter ici.',
        ar: 'لم تُحدَّد أي سن للقلع بعد. انقر على سن في مخطط الأسنان واختر "Extract" لإضافتها.',
      } as T,
      extractionsNotesPh: {
        en: 'e.g. Confirmed with patient; extract before treatment start',
        fr: 'p. ex. confirmé avec le patient ; extraction avant le début du traitement',
        ar: 'مثال: تم التأكيد مع المريض؛ القلع قبل بدء العلاج',
      } as T,

      sectionTitle: { en: 'Tooth-level instructions & mechanics', fr: 'Instructions par dent & mécaniques', ar: 'تعليمات لكل سن وميكانيكا العلاج' } as T,
      sectionHint: {
        en: 'Fine-tune what should happen on each tooth — extractions, attachments, IPR — and choose the mechanics the planner should apply.',
        fr: 'Affinez ce qui doit se passer sur chaque dent — extractions, taquets, stripping — et choisissez les mécaniques à appliquer.',
        ar: 'حدّد بدقّة ما يجب فعله لكل سن — قلع، ملحقات، IPR — واختر الميكانيكا التي يطبّقها المخطّط.',
      } as T,

      // Section legends
      elastics: { en: 'Elastics', fr: 'Élastiques', ar: 'المطّاطات' } as T,
      elasticsNone: { en: 'No elastics', fr: 'Pas d’élastiques', ar: 'بدون مطّاطات' } as T,
      elasticsClassI: { en: 'Class I elastics', fr: 'Élastiques classe I', ar: 'مطّاطات الفئة الأولى' } as T,
      elasticsClassII: { en: 'Class II elastics', fr: 'Élastiques classe II', ar: 'مطّاطات الفئة الثانية' } as T,
      elasticsClassIII: { en: 'Class III elastics', fr: 'Élastiques classe III', ar: 'مطّاطات الفئة الثالثة' } as T,
      elasticsVertical: { en: 'Vertical bite elastics', fr: 'Élastiques verticaux', ar: 'مطّاطات عمودية' } as T,
      elasticsCrossCross: { en: 'Criss-cross elastics', fr: 'Élastiques en croix', ar: 'مطّاطات متقاطعة' } as T,

      openBite: { en: 'Open bite', fr: 'Béance', ar: 'العضّة المفتوحة' } as T,
      openBiteNone: { en: 'Not present', fr: 'Absente', ar: 'غير موجودة' } as T,
      openBiteCorrect: { en: 'Correct it', fr: 'À corriger', ar: 'تصحيحها' } as T,
      openBiteMaintain: { en: 'Maintain', fr: 'Maintenir', ar: 'حفظ' } as T,

      biteRamps: { en: 'Bite ramps', fr: 'Plans de morsure', ar: 'مرتفعات العضّ' } as T,
      biteRampsNone: { en: 'Not needed', fr: 'Non nécessaires', ar: 'غير لازمة' } as T,
      biteRampsUpper: { en: 'Upper anterior', fr: 'Antérieurs supérieurs', ar: 'الأماميات العلوية' } as T,
      biteRampsLower: { en: 'Lower anterior', fr: 'Antérieurs inférieurs', ar: 'الأماميات السفلية' } as T,
      biteRampsPlanner: { en: 'Planner’s call', fr: 'Au choix du planificateur', ar: 'حسب رأي المخطّط' } as T,

      iprStripping: { en: 'IPR / Stripping', fr: 'IPR / Stripping', ar: 'IPR / تقليم' } as T,
      iprAllowed: { en: 'Allowed', fr: 'Autorisé', ar: 'مسموح به' } as T,
      iprAvoid: { en: 'Avoid', fr: 'À éviter', ar: 'يُتجنّب' } as T,
      iprPlannerCall: { en: 'Planner’s call', fr: 'Au choix du planificateur', ar: 'حسب رأي المخطّط' } as T,

      expansion: { en: 'Expansion', fr: 'Expansion', ar: 'التوسعة' } as T,
      expansionNone: { en: 'Not requested', fr: 'Non requise', ar: 'غير مطلوبة' } as T,
      expansionDental: { en: 'Dental expansion', fr: 'Expansion dentaire', ar: 'توسعة سنّيّة' } as T,
      expansionSkeletal: { en: 'Skeletal expansion', fr: 'Expansion squelettique', ar: 'توسعة هيكليّة' } as T,
      expansionPlanner: { en: 'Planner’s call', fr: 'Au choix du planificateur', ar: 'حسب رأي المخطّط' } as T,

      crossbite: { en: 'Crossbite', fr: 'Articulé inversé', ar: 'العضّة المعكوسة' } as T,
      crossbiteNone: { en: 'Not present', fr: 'Absente', ar: 'غير موجودة' } as T,
      crossbiteCorrect: { en: 'Correct it', fr: 'À corriger', ar: 'تصحيحها' } as T,

      spaces: { en: 'Spaces', fr: 'Espaces', ar: 'الفراغات' } as T,
      spacesClose: { en: 'Close all spaces', fr: 'Fermer tous les espaces', ar: 'إغلاق جميع الفراغات' } as T,
      spacesMaintain: { en: 'Maintain', fr: 'Maintenir', ar: 'الحفاظ عليها' } as T,
      spacesPlanner: { en: 'Planner’s call', fr: 'Au choix du planificateur', ar: 'حسب رأي المخطّط' } as T,

      extractions: { en: 'Extractions', fr: 'Extractions', ar: 'القلع' } as T,
      extractionsNone: { en: 'None', fr: 'Aucune', ar: 'لا شيء' } as T,
      extractionsRequested: { en: 'Requested — see odontogram', fr: 'Demandées — voir odontogramme', ar: 'مطلوبة — انظر مخطط الأسنان' } as T,

      specialInstructions: { en: 'Special instructions', fr: 'Instructions spéciales', ar: 'تعليمات خاصة' } as T,
      specialInstructionsPh: {
        en: 'Anything we should be aware of (e.g. avoid attachments on front teeth, patient travels in 3 weeks…)',
        fr: 'Tout ce que nous devrions savoir (p. ex. éviter les taquets antérieurs, le patient voyage dans 3 semaines…)',
        ar: 'أي شيء يجب أن نعرفه (مثل: تجنّب الملحقات على الأسنان الأمامية، المريض سيسافر بعد 3 أسابيع…)',
      } as T,

      odontogramLoading: { en: 'Loading odontogram…', fr: 'Chargement de l’odontogramme…', ar: 'جاري تحميل مخطط الأسنان…' } as T,
      odontogramHint: {
        en: 'Tap a tooth to flag an extraction, attachment, or IPR site. Tap again to clear.',
        fr: 'Touchez une dent pour signaler une extraction, un taquet ou un site d’IPR. Touchez à nouveau pour effacer.',
        ar: 'انقر على السن لتحديد قلع أو ملحق أو موضع IPR. انقر مرة أخرى للمسح.',
      } as T,
    },

    // ── Review step ──────────────────────────────────────────────
    review: {
      sectionTitle: { en: 'Review your order', fr: 'Vérifier votre commande', ar: 'مراجعة الطلب' } as T,
      sectionHint: {
        en: 'A quick recap before you send it to the lab. You can still edit each step from the breadcrumb above.',
        fr: 'Un récapitulatif avant l’envoi au laboratoire. Vous pouvez toujours modifier chaque étape via le fil d’Ariane ci-dessus.',
        ar: 'ملخّص سريع قبل إرسال الطلب إلى المختبر. لا يزال بإمكانك تعديل أي خطوة من شريط التنقل أعلاه.',
      } as T,

      patientInfo: { en: 'Patient information', fr: 'Informations du patient', ar: 'معلومات المريض' } as T,
      patientImages: { en: 'Patient images', fr: 'Photos du patient', ar: 'صور المريض' } as T,
      radiographyScans: { en: 'Radiography & STL scans', fr: 'Radiographies & STL', ar: 'الأشعّة وملفات STL' } as T,
      treatmentObjective: { en: 'Treatment plan & clinical objective', fr: 'Plan de traitement & objectif clinique', ar: 'خطة العلاج والهدف السريري' } as T,
      toothLevel: { en: 'Tooth-level instructions & movement plan', fr: 'Instructions par dent & plan de mouvement', ar: 'تعليمات لكل سن وخطة الحركة' } as T,
      orderMetadata: { en: 'Order metadata', fr: 'Informations de commande', ar: 'بيانات الطلب' } as T,
      readyToSubmit: { en: 'Ready to submit', fr: 'Prêt à soumettre', ar: 'جاهز للإرسال' } as T,
      readyToSubmitHint: {
        en: 'Once submitted, the planner is notified and you’ll receive the treatment plan to approve.',
        fr: 'Une fois soumise, le planificateur est notifié et vous recevrez le plan de traitement à approuver.',
        ar: 'بمجرّد الإرسال، يتم إعلام المخطّط وستتلقّى خطة العلاج للموافقة.',
      } as T,
    },

    // ── Actions / buttons ────────────────────────────────────────
    actions: {
      saveDraft: { en: 'Save draft', fr: 'Enregistrer le brouillon', ar: 'حفظ المسودة' } as T,
      saveChanges: { en: 'Save changes', fr: 'Enregistrer les modifications', ar: 'حفظ التغييرات' } as T,
      submitOrder: { en: 'Submit order', fr: 'Soumettre la commande', ar: 'إرسال الطلب' } as T,
      continueLater: { en: 'Continue later', fr: 'Continuer plus tard', ar: 'المتابعة لاحقًا' } as T,
    },

    // ── Validation / errors ──────────────────────────────────────
    errors: {
      patientStageRequired: { en: 'Patient stage is required.', fr: 'La phase du patient est obligatoire.', ar: 'مرحلة المريض مطلوبة.' } as T,
      patientRequired: { en: 'Please pick or create a patient first.', fr: 'Veuillez choisir ou créer un patient.', ar: 'يرجى اختيار أو إنشاء مريض أوّلًا.' } as T,
      chiefComplaintRequired: { en: 'Please describe the chief complaint.', fr: 'Veuillez décrire le motif de consultation.', ar: 'يرجى وصف سبب الاستشارة.' } as T,
      archRequired: { en: 'Pick at least one arch to treat.', fr: 'Choisissez au moins une arcade à traiter.', ar: 'اختر قوسًا واحدًا على الأقل للعلاج.' } as T,
      saveFailed: { en: 'Could not save — please try again.', fr: 'Échec de l’enregistrement — veuillez réessayer.', ar: 'تعذّر الحفظ — يرجى المحاولة مرة أخرى.' } as T,
      loadFailed: { en: 'Could not load — please reload the page.', fr: 'Échec du chargement — rechargez la page.', ar: 'تعذّر التحميل — يرجى إعادة تحميل الصفحة.' } as T,
    },
  },

  // ─── Order detail page ──────────────────────────────────────────
  orderDetail: {
    backToList: { en: 'All orders', fr: 'Toutes les commandes', ar: 'كل الطلبات' } as T,
    submittedOn: { en: 'Submitted on', fr: 'Soumis le', ar: 'تم الإرسال في' } as T,
    createdOn: { en: 'Created on', fr: 'Créé le', ar: 'تاريخ الإنشاء' } as T,
    changeStatus: { en: 'Change status', fr: 'Changer le statut', ar: 'تغيير الحالة' } as T,
    deletedBadge: { en: 'Deleted', fr: 'Supprimé', ar: 'محذوف' } as T,
    delete: { en: 'Delete order', fr: 'Supprimer la commande', ar: 'حذف الطلب' } as T,
    deletePermanently: { en: 'Delete permanently', fr: 'Suppression définitive', ar: 'حذف نهائي' } as T,
    restore: { en: 'Restore', fr: 'Restaurer', ar: 'استعادة' } as T,
    editOrder: { en: 'Edit order', fr: 'Modifier la commande', ar: 'تعديل الطلب' } as T,

    // Tabs
    tabs: {
      details: { en: 'Order details', fr: 'Détails', ar: 'التفاصيل' } as T,
      treatmentPlan: { en: 'Treatment plan', fr: 'Plan de traitement', ar: 'خطة العلاج' } as T,
      quote: { en: 'Quotation', fr: 'Devis', ar: 'عرض السعر' } as T,
    },

    // Treatment-fee banner
    fee: {
      titleAwaiting: { en: 'Awaiting treatment fee', fr: 'En attente des honoraires', ar: 'في انتظار الأتعاب' } as T,
      titlePaid: { en: 'Treatment fee paid', fr: 'Honoraires payés', ar: 'تم دفع الأتعاب' } as T,
      titlePending: { en: 'Bank transfer awaiting confirmation', fr: 'Virement en attente de confirmation', ar: 'تحويل بنكي في انتظار التأكيد' } as T,
      doctorPay: { en: 'Pay treatment fee', fr: 'Payer les honoraires', ar: 'دفع الأتعاب' } as T,
      adminConfirm: { en: 'Review & confirm', fr: 'Vérifier & confirmer', ar: 'مراجعة وتأكيد' } as T,
      viewReceipt: { en: 'View receipt', fr: 'Voir le reçu', ar: 'عرض الإيصال' } as T,
      paidOnTeam: {
        en: 'The treatment fee has been settled. The treatment plan can now be sent.',
        fr: 'Les honoraires ont été réglés. Le plan de traitement peut désormais être envoyé.',
        ar: 'تم تسوية الأتعاب. يمكن الآن إرسال خطة العلاج.',
      } as T,
      doctorPendingHint: {
        en: 'Your receipt has been received. An admin will review the proof and confirm the payment shortly.',
        fr: 'Votre justificatif est bien reçu. Un administrateur vérifiera la preuve et confirmera le paiement sous peu.',
        ar: 'تم استلام الإيصال. سيقوم المسؤول بمراجعة الإثبات وتأكيد الدفع قريبًا.',
      } as T,
      adminPendingHint: {
        en: 'A receipt was uploaded by the doctor. Review the proof and confirm once the funds land in the account.',
        fr: 'Le praticien a téléversé un justificatif. Vérifiez la preuve et confirmez dès que les fonds sont reçus.',
        ar: 'حمّل الطبيب الإيصال. راجِع الإثبات وأكِّد فور وصول الأموال.',
      } as T,
      doctorAwaitingHint: {
        en: 'The treatment plan starts as soon as the professional fee is settled. Pick a payment method below.',
        fr: 'Le plan de traitement débute dès que les honoraires sont réglés. Choisissez un mode de paiement ci-dessous.',
        ar: 'تبدأ خطة العلاج فور تسوية الأتعاب المهنية. اختر طريقة الدفع أدناه.',
      } as T,
    },

    // Patient information card
    patientCard: {
      title: { en: 'Patient information', fr: 'Informations du patient', ar: 'معلومات المريض' } as T,
      sex: { en: 'Sex', fr: 'Sexe', ar: 'الجنس' } as T,
      dob: { en: 'Date of birth', fr: 'Date de naissance', ar: 'تاريخ الميلاد' } as T,
      stage: { en: 'Patient stage', fr: 'Phase du patient', ar: 'مرحلة المريض' } as T,
      arch: { en: 'Arch treatment', fr: 'Arcades traitées', ar: 'الأقواس المعالَجة' } as T,
      dentist: { en: 'Treating dentist', fr: 'Praticien traitant', ar: 'الطبيب المعالج' } as T,
      address: { en: 'Address', fr: 'Adresse', ar: 'العنوان' } as T,
      phone: { en: 'Phone', fr: 'Téléphone', ar: 'الهاتف' } as T,
      email: { en: 'Email', fr: 'E-mail', ar: 'البريد الإلكتروني' } as T,
      notes: { en: 'Patient notes', fr: 'Notes patient', ar: 'ملاحظات المريض' } as T,
    },

    // Section titles inside the detail
    sections: {
      patientImages: { en: 'Patient images', fr: 'Photos du patient', ar: 'صور المريض' } as T,
      radiographyScans: { en: 'Radiography & STL scans', fr: 'Radiographies & STL', ar: 'الأشعّة وملفات STL' } as T,
      clinicalObjective: { en: 'Treatment plan & clinical objective', fr: 'Plan de traitement & objectif clinique', ar: 'خطة العلاج والهدف السريري' } as T,
      toothLevel: { en: 'Tooth-level instructions & movement plan', fr: 'Instructions par dent & plan de mouvement', ar: 'تعليمات لكل سن وخطة الحركة' } as T,
    },
  },

  // ─── Navigation (header / sidebar) ──────────────────────────────
  nav: {
    dashboard: { en: 'Dashboard', fr: 'Tableau de bord', ar: 'لوحة التحكم' } as T,
    orders: { en: 'Orders', fr: 'Commandes', ar: 'الطلبات' } as T,
    patients: { en: 'Patients', fr: 'Patients', ar: 'المرضى' } as T,
    payments: { en: 'Payments', fr: 'Paiements', ar: 'المدفوعات' } as T,
    paymentHistory: { en: 'Payment history', fr: 'Historique des paiements', ar: 'سجلّ المدفوعات' } as T,
    pendingPayments: { en: 'Pending payments', fr: 'Paiements en attente', ar: 'المدفوعات المعلّقة' } as T,
    packs: { en: 'Packs', fr: 'Forfaits', ar: 'الباقات' } as T,
    messages: { en: 'Messages', fr: 'Messages', ar: 'الرسائل' } as T,
    notifications: { en: 'Notifications', fr: 'Notifications', ar: 'الإشعارات' } as T,
    media: { en: 'Media', fr: 'Médias', ar: 'الوسائط' } as T,
    reports: { en: 'Reports', fr: 'Rapports', ar: 'التقارير' } as T,
    settings: { en: 'Settings', fr: 'Paramètres', ar: 'الإعدادات' } as T,
    account: { en: 'My account', fr: 'Mon compte', ar: 'حسابي' } as T,
    logout: { en: 'Log out', fr: 'Déconnexion', ar: 'تسجيل الخروج' } as T,
  },
} as const;

// ────────────────────────────────────────────────────────────────────
// Translation lookup
// ────────────────────────────────────────────────────────────────────

/**
 * Dot-path lookup into the dictionary. Generic enough to handle any
 * depth without TypeScript balking. Falls back to English if the
 * current language is missing a key, and to the raw path if the key
 * doesn't exist — so a typo at the call site stays visible on screen.
 */
type DictNode = T | { [key: string]: DictNode };

function getEntry(obj: DictNode, path: string): T | undefined {
  const parts = path.split('.');
  let node: DictNode | undefined = obj;
  for (const p of parts) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as { [key: string]: DictNode })[p];
  }
  // A leaf has en/fr/ar string fields.
  if (
    node &&
    typeof node === 'object' &&
    typeof (node as Partial<T>).en === 'string'
  ) {
    return node as T;
  }
  return undefined;
}

/**
 * Translate a dotted path against the current language. Supports
 * `{name}`-style interpolation:
 *
 *   t('orderForm.welcome', 'fr', { name: 'Saker' })
 *   // dict entry "Bonjour, {name}!" → "Bonjour, Saker!"
 *
 * Returns the raw path on miss so a developer typo is immediately
 * visible instead of rendering a blank label that ships to prod.
 */
export function translate(
  path: string,
  lang: Lang,
  vars?: Record<string, string | number>,
): string {
  const entry = getEntry(dict as unknown as DictNode, path);
  if (!entry) return path;
  let value = entry[lang] || entry.en || path;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return value;
}

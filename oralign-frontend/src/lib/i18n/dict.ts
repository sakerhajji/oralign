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
 *      missing language at a glance instead of diffing two JSON files
 *      in two windows.
 *
 * Structure: every leaf is `{ en, fr }`. Sections nest freely.
 *
 * Arabic support was removed from the dashboard. The marketing
 * showcase still ships AR (it's a public-facing site with a different
 * audience) — that lives in `src/app/(showcase)/_lib/i18n/` and is
 * intentionally kept separate.
 */

export type Lang = 'en' | 'fr';

export const LANGS: readonly Lang[] = ['en', 'fr'] as const;
export const DEFAULT_LANG: Lang = 'fr';

type T = Record<Lang, string>;

export const dict = {
  // ─── Generic / cross-cutting ────────────────────────────────────
  common: {
    save: { en: 'Save', fr: 'Enregistrer' } as T,
    saveChanges: { en: 'Save changes', fr: 'Enregistrer les modifications' } as T,
    saveDraft: { en: 'Save draft', fr: 'Enregistrer le brouillon' } as T,
    cancel: { en: 'Cancel', fr: 'Annuler' } as T,
    close: { en: 'Close', fr: 'Fermer' } as T,
    confirm: { en: 'Confirm', fr: 'Confirmer' } as T,
    submit: { en: 'Submit', fr: 'Soumettre' } as T,
    back: { en: 'Back', fr: 'Retour' } as T,
    continue: { en: 'Continue', fr: 'Continuer' } as T,
    edit: { en: 'Edit', fr: 'Modifier' } as T,
    delete: { en: 'Delete', fr: 'Supprimer' } as T,
    loading: { en: 'Loading…', fr: 'Chargement…' } as T,
    search: { en: 'Search', fr: 'Rechercher' } as T,
    yes: { en: 'Yes', fr: 'Oui' } as T,
    no: { en: 'No', fr: 'Non' } as T,
    optional: { en: 'Optional', fr: 'Facultatif' } as T,
    required: { en: 'Required', fr: 'Obligatoire' } as T,
    notSet: { en: 'Not set', fr: 'Non défini' } as T,
    actions: { en: 'Actions', fr: 'Actions' } as T,
    next: { en: 'Next', fr: 'Suivant' } as T,
    previous: { en: 'Previous', fr: 'Précédent' } as T,
    yourTurn: { en: 'Your turn', fr: 'À vous' } as T,
  },

  // ─── Language switcher ──────────────────────────────────────────
  language: {
    label: { en: 'Language', fr: 'Langue' } as T,
    english: { en: 'English', fr: 'Anglais' } as T,
    french: { en: 'French', fr: 'Français' } as T,
  },

  // ─── Order list / status badges ─────────────────────────────────
  orders: {
    listTitle: { en: 'Orders', fr: 'Commandes' } as T,
    newOrder: { en: 'New order', fr: 'Nouvelle commande' } as T,

    // Order status enum → human label. Used everywhere a row renders
    // its current step in the lifecycle.
    statusLabel: {
      draft: { en: 'Draft', fr: 'Brouillon' } as T,
      submitted: { en: 'Submitted', fr: 'Soumis' } as T,
      under_review: { en: 'Under review', fr: 'En cours d’examen' } as T,
      treatment_planning: { en: 'Treatment planning', fr: 'Planification du traitement' } as T,
      treatment_plan_ready: { en: 'Treatment ready', fr: 'Plan prêt' } as T,
      revision_requested: { en: 'Revision requested', fr: 'Révision demandée' } as T,
      treatment_approved: { en: 'Treatment approved', fr: 'Traitement approuvé' } as T,
      quotation_sent: { en: 'Quotation sent', fr: 'Devis envoyé' } as T,
      payment_plan_selected: { en: 'Payment plan selected', fr: 'Plan de paiement choisi' } as T,
      payment_pending: { en: 'Payment pending', fr: 'Paiement en attente' } as T,
      payment_review: { en: 'Payment review', fr: 'Paiement en révision' } as T,
      // `paid` is treated as the start of production now — the
      // backend auto-transitions paid → fabrication, but historical
      // rows may still carry the literal `paid` enum so we render
      // them as "In Fabrication" so the workflow reads consistently.
      paid: { en: 'In Fabrication', fr: 'En fabrication' } as T,
      fabrication: { en: 'In Fabrication', fr: 'En fabrication' } as T,
      ready_to_ship: { en: 'Ready to ship', fr: 'Prêt à expédier' } as T,
      shipped: { en: 'Shipped', fr: 'Expédiée' } as T,
      // `finished` means the patient has received the aligners — the
      // user-facing label reads as "Done" everywhere so the lifecycle
      // ends on a positive note rather than a vague "Finished".
      finished: { en: 'Done', fr: 'Terminée' } as T,
      canceled: { en: 'Canceled', fr: 'Annulé' } as T,
      // Legacy enum values still present in the DB.
      in_review: { en: 'In review', fr: 'En révision' } as T,
      approved: { en: 'Approved', fr: 'Approuvé' } as T,
      rejected: { en: 'Rejected', fr: 'Rejeté' } as T,
      cancelled: { en: 'Cancelled', fr: 'Annulé' } as T,
    },

    // Derived treatment-fee badge that lives next to OrderStatus.
    feeBadge: {
      paid: { en: 'Fee paid', fr: 'Honoraires payés' } as T,
      pending: { en: 'Fee pending', fr: 'Honoraires en attente' } as T,
      rejected: { en: 'Fee rejected', fr: 'Honoraires rejetés' } as T,
      unpaid: { en: 'Fee unpaid', fr: 'Honoraires non payés' } as T,
    },
  },

  // ─── Order form (the wizard) ────────────────────────────────────
  // Strings used by the multi-step order creation form. Translations
  // use proper Tunisian-French orthodontic terminology (e.g. "Motif
  // de consultation" rather than the literal "Plainte principale").
  orderForm: {
    titleCreate: { en: 'Create order', fr: 'Créer une commande' } as T,
    titleEdit: { en: 'Edit order', fr: 'Modifier la commande' } as T,
    titleSubmitted: { en: 'Order details', fr: 'Détails de la commande' } as T,
    of: { en: 'of', fr: 'sur' } as T,
    step: { en: 'Step', fr: 'Étape' } as T,

    steps: {
      patient: { en: 'Patient', fr: 'Patient' } as T,
      images: { en: 'Patient images', fr: 'Photos du patient' } as T,
      radiography: { en: 'Radiography & scans', fr: 'Radiographies & empreintes' } as T,
      treatment: { en: 'Treatment plan', fr: 'Plan de traitement' } as T,
      advanced: { en: 'Advanced movements', fr: 'Mouvements avancés' } as T,
      review: { en: 'Review & submit', fr: 'Vérifier & soumettre' } as T,
    },

    // ── Patient step ─────────────────────────────────────────────
    patient: {
      // Choice cards atop the step
      chooseOneOfYour: { en: 'Select one of your patients', fr: 'Choisir un de vos patients' } as T,
      chooseExistingHint: {
        en: 'Choose an existing patient from your list.',
        fr: 'Choisissez un patient existant dans votre liste.',
      } as T,
      createNewCardTitle: { en: 'Create a new patient', fr: 'Créer un nouveau patient' } as T,
      createNewHint: {
        en: 'Add details to create a new patient.',
        fr: 'Renseignez les informations pour créer un nouveau patient.',
      } as T,
      // Selects
      dentistLabel: { en: 'Dentist', fr: 'Praticien' } as T,
      selectDentistPh: { en: 'Select dentist', fr: 'Choisir un praticien' } as T,
      patientLabel: { en: 'Patient', fr: 'Patient' } as T,
      selectPatientFromListPh: {
        en: 'Select patient from your list',
        fr: 'Choisir un patient dans votre liste',
      } as T,
      // Clinical conditions / "Reason for consultation"
      reasonLegend: { en: 'Reason for consultation', fr: 'Motif de consultation' } as T,
      reasonDescription: {
        en: 'Select every condition that applies — multiple are allowed. Tick “Other” to describe a reason not on the list.',
        fr: 'Cochez chaque condition qui s’applique — plusieurs choix sont possibles. Cochez « Autre » pour décrire un motif absent de la liste.',
      } as T,
      // Free-text "Other" detail field
      reasonOtherLabel: {
        en: 'Other — please describe',
        fr: 'Autre — précisez',
      } as T,
      reasonOtherPh: {
        en: 'Describe the additional clinical detail (max 500 characters)',
        fr: 'Décrivez le détail clinique supplémentaire (500 caractères max.)',
      } as T,
      // Individual condition labels — the canonical English value stays
      // the storage key; only the UI label flips. Translations follow
      // standard Tunisian-French orthodontic terminology so the planner
      // reading a French chart recognises every term at a glance.
      condCrowding: { en: 'Crowding', fr: 'Encombrement' } as T,
      condSpacing: { en: 'Spacing', fr: 'Espacement' } as T,
      condClassII1: { en: 'Class II Division 1', fr: 'Classe II Division 1' } as T,
      condClassII2: { en: 'Class II Division 2', fr: 'Classe II Division 2' } as T,
      condClassIII: { en: 'Class III', fr: 'Classe III' } as T,
      condOpenBite: { en: 'Open bite', fr: 'Béance' } as T,
      condAnteriorCrossbite: { en: 'Anterior crossbite', fr: 'Articulé inversé antérieur' } as T,
      condPosteriorCrossbite: { en: 'Posterior crossbite', fr: 'Articulé inversé postérieur' } as T,
      condDeepBite: { en: 'Deep bite', fr: 'Supraclusion' } as T,
      condNarrowArch: { en: 'Narrow arch', fr: 'Arcade étroite' } as T,
      condProclination: { en: 'Proclination', fr: 'Vestibulo-version' } as T,
      condIncreasedOverjet: { en: 'Increased overjet', fr: 'Surplomb augmenté' } as T,
      condUnestheticSmile: { en: 'Unesthetic smile', fr: 'Sourire inesthétique' } as T,
      condDentalShapeAnomaly: { en: 'Dental shape anomaly', fr: 'Anomalie de forme dentaire' } as T,
      condOther: { en: 'Other', fr: 'Autre' } as T,

      // Form fields (inline new-patient form)
      patientNameLabel: { en: 'Patient name', fr: 'Nom du patient' } as T,
      fullNameInputPh: { en: 'Full name', fr: 'Nom complet' } as T,
      phoneInputPh: { en: '+216 12 345 678', fr: '+216 12 345 678' } as T,
      addressInputPh: { en: 'Street, city, postal code', fr: 'Rue, ville, code postal' } as T,
      genderLabel: { en: 'Gender', fr: 'Sexe' } as T,
      selectGenderPh: { en: 'Select patient gender', fr: 'Choisir le sexe du patient' } as T,
      notesLabel: { en: 'Notes', fr: 'Notes' } as T,
      notesInputPh: {
        en: 'Allergies, medical history, anything the planner should know…',
        fr: 'Allergies, antécédents médicaux, toute information utile au planificateur…',
      } as T,

      sectionTitle: { en: 'Patient information', fr: 'Informations du patient' } as T,
      sectionHint: {
        en: 'Pick an existing patient from your case files, or create a new one in seconds.',
        fr: 'Choisissez un patient existant dans votre dossier, ou créez-en un nouveau en quelques secondes.',
      } as T,
      pickExisting: { en: 'Existing patient', fr: 'Patient existant' } as T,
      createNew: { en: 'New patient', fr: 'Nouveau patient' } as T,
      pickerLabel: { en: 'Pick a patient', fr: 'Choisir un patient' } as T,
      pickerPlaceholder: { en: 'Search by name…', fr: 'Rechercher par nom…' } as T,

      // Fields
      fullName: { en: 'Full name', fr: 'Nom complet' } as T,
      fullNamePh: { en: 'e.g. John Doe', fr: 'p. ex. Jean Dupont' } as T,
      email: { en: 'Email', fr: 'E-mail' } as T,
      emailPh: { en: 'patient@example.com', fr: 'patient@example.com' } as T,
      phone: { en: 'Phone', fr: 'Téléphone' } as T,
      phonePh: { en: '+216…', fr: '+216…' } as T,
      address: { en: 'Address', fr: 'Adresse' } as T,
      addressPh: { en: 'Street, city', fr: 'Rue, ville' } as T,
      dob: { en: 'Date of birth', fr: 'Date de naissance' } as T,
      age: { en: 'Age', fr: 'Âge' } as T,
      ageYears: { en: 'years', fr: 'ans' } as T,
      sex: { en: 'Sex', fr: 'Sexe' } as T,
      sexFemale: { en: 'Female', fr: 'Femme' } as T,
      sexMale: { en: 'Male', fr: 'Homme' } as T,
      sexOther: { en: 'Other', fr: 'Autre' } as T,
      patientStage: { en: 'Patient stage', fr: 'Phase du patient' } as T,
      stageInitial: { en: 'Initial', fr: 'Initiale' } as T,
      stageRefinement: { en: 'Refinement', fr: 'Affinage' } as T,
      stageRetainer: { en: 'Retainer', fr: 'Contention' } as T,
      notes: { en: 'Patient notes', fr: 'Notes patient' } as T,
      notesPh: { en: 'Any clinical context the team should know about…', fr: 'Tout contexte clinique utile à l’équipe…' } as T,
      dentist: { en: 'Treating dentist', fr: 'Praticien traitant' } as T,
      dentistPickerPh: { en: 'Assign to a dentist…', fr: 'Affecter à un praticien…' } as T,
    },

    // ── Clinical files step (patient images + radio) ─────────────
    files: {
      images: {
        title: { en: 'Patient images', fr: 'Photos du patient' } as T,
        hint: {
          en: 'Upload each focus and intraoral view. The field reference shows the expected angle — rotate or flip your photo to match before it uploads.',
          fr: 'Téléversez chaque vue, du sourire à l’intra-oral. La photo de référence indique l’angle attendu — pivotez ou retournez votre image avant le téléversement.',
        } as T,
      },
      radiography: {
        title: { en: 'Radiography & STL scans', fr: 'Radiographies & empreintes STL' } as T,
        hint: {
          en: 'Attach panoramic + cephalometric radiographs, plus the upper / lower digital impressions (STL or DCM).',
          fr: 'Joignez la panoramique et la téléradiographie de profil, ainsi que les empreintes numériques supérieures et inférieures (STL ou DCM).',
        } as T,
      },
      cbctRequested: { en: 'CBCT requested', fr: 'CBCT demandé' } as T,
    },

    // ── Treatment plan step ──────────────────────────────────────
    treatment: {
      // Fieldset legends
      patientStageLegend: { en: 'Patient stage', fr: 'Phase du patient' } as T,
      patientStageHint: {
        en: 'Where the patient is in their treatment lifecycle.',
        fr: 'Où en est le patient dans son parcours de traitement.',
      } as T,
      // Per-stage helper text shown under each ChoiceCard
      stageInitialDesc: {
        en: 'First aligner setup for this patient.',
        fr: 'Premier traitement par aligneurs pour ce patient.',
      } as T,
      stageRefinementDesc: {
        en: 'Top-up after the first treatment phase.',
        fr: 'Reprise après la première phase de traitement.',
      } as T,
      stageRetainerDesc: {
        en: 'Retention only — keep teeth in their corrected position.',
        fr: 'Contention uniquement — maintenir la position corrigée.',
      } as T,

      archTreatmentLegend: { en: 'Arch treatment', fr: 'Traitement des arcades' } as T,
      archTreatmentHint: {
        en: 'Which arch(es) the planner will treat.',
        fr: 'Quelle(s) arcade(s) seront traitées par le planificateur.',
      } as T,
      chiefComplaintLegend: { en: 'Chief complaint', fr: 'Motif de consultation' } as T,
      chiefComplaintHint: {
        en: 'The patient’s main concern in their own words.',
        fr: 'La préoccupation principale du patient, dans ses propres mots.',
      } as T,
      chiefComplaintInputPh: {
        en: 'Describe the patient’s main concern…',
        fr: 'Décrivez la préoccupation principale du patient…',
      } as T,

      treatmentPlanLegend: { en: 'Treatment plan', fr: 'Plan de traitement' } as T,
      treatmentPlanHint: {
        en: 'Which segments the planner is allowed to move.',
        fr: 'Quels segments le planificateur est autorisé à déplacer.',
      } as T,
      // Treatment-plan option pills (the saved string is English; this maps to localized labels)
      planFullArch: { en: 'Full Arch', fr: 'Arcade complète' } as T,
      planAnteriorOnly: { en: 'Anterior only', fr: 'Antérieurs uniquement' } as T,
      plan4to4: { en: '4 to 4 only', fr: 'De 4 à 4 uniquement' } as T,
      planDontMove67: { en: 'Don’t move 6 / 7', fr: 'Ne pas déplacer 6 / 7' } as T,

      apLegend: { en: 'A-P relationship', fr: 'Relation A-P' } as T,
      apHint: {
        en: 'Antero-posterior treatment goal for canines and molars.',
        fr: 'Objectif antéro-postérieur pour les canines et les molaires.',
      } as T,
      apMaintainOpt: { en: 'Maintain', fr: 'Maintenir' } as T,
      apImproveCanine: { en: 'Improve canine only', fr: 'Améliorer la canine uniquement' } as T,
      apImproveCanineMolar: { en: 'Improve canine and molar', fr: 'Améliorer canine et molaire' } as T,
      apCorrectBoth: { en: 'Correct both molar and canine', fr: 'Corriger molaire et canine' } as T,

      chiefComplaint: { en: 'Chief complaint', fr: 'Motif de consultation' } as T,
      chiefComplaintPh: {
        en: 'What does the patient want to fix? E.g. crowded lower arch, gaps, midline shift…',
        fr: 'Que souhaite corriger le patient ? P. ex. encombrement inférieur, diastèmes, déviation médiane…',
      } as T,
      additionalNotes: { en: 'Additional clinical notes', fr: 'Notes cliniques supplémentaires' } as T,
      additionalNotesPh: {
        en: 'Anything else the planner should consider for this case.',
        fr: 'Toute autre information utile au planificateur pour ce cas.',
      } as T,

      // Arch treatment
      archTreatment: { en: 'Arch treatment', fr: 'Traitement des arcades' } as T,
      archUpper: { en: 'Upper arch', fr: 'Arcade supérieure' } as T,
      archLower: { en: 'Lower arch', fr: 'Arcade inférieure' } as T,
      archBoth: { en: 'Both arches', fr: 'Les deux arcades' } as T,

      // Treatment scope (full / anterior / partial)
      treatmentScope: { en: 'Treatment scope', fr: 'Étendue du traitement' } as T,
      scopeFull: { en: 'Full arch', fr: 'Arcade complète' } as T,
      scopeAnterior: { en: 'Anterior only', fr: 'Antérieurs uniquement' } as T,
      scope4to4: { en: '4 to 4 only', fr: 'De 4 à 4 uniquement' } as T,
      scopeNoMove67: { en: 'Don’t move 6 / 7', fr: 'Ne pas déplacer 6 / 7' } as T,

      // A-P relationship (sagittal class)
      apRelationship: { en: 'Antero-posterior relationship', fr: 'Relation antéro-postérieure' } as T,
      apClassI: { en: 'Class I — maintain', fr: 'Classe I — à maintenir' } as T,
      apClassIIcorrect: { en: 'Class II — correct', fr: 'Classe II — à corriger' } as T,
      apClassIIIcorrect: { en: 'Class III — correct', fr: 'Classe III — à corriger' } as T,
      apMaintain: { en: 'Maintain current relationship', fr: 'Maintenir la relation actuelle' } as T,

      midline: { en: 'Midline', fr: 'Ligne médiane' } as T,
      midlineMaintain: { en: 'Maintain', fr: 'Maintenir' } as T,
      midlineCorrect: { en: 'Correct', fr: 'Corriger' } as T,
      midlineImprove: { en: 'Improve where possible', fr: 'Améliorer si possible' } as T,
    },

    // ── Advanced movements step ──────────────────────────────────
    advanced: {
      // Helper text under each <legend>
      elasticsHint: {
        en: 'Pick the primary elastic configuration. Use the notes field for wear time, hook positions or a secondary type.',
        fr: 'Choisissez la configuration principale d’élastiques. Utilisez le champ de notes pour le port, les crochets ou un type secondaire.',
      } as T,
      elasticsNotesLabel: { en: 'Notes (optional)', fr: 'Notes (facultatif)' } as T,
      elasticsNotesPh: {
        en: 'e.g. Full-time wear; upper canine → lower first molar',
        fr: 'p. ex. port permanent ; canine supérieure → première molaire inférieure',
      } as T,
      openBiteHint: {
        en: 'What should happen to the open bite during treatment?',
        fr: 'Que faire de la béance pendant le traitement ?',
      } as T,
      openBiteCorrectOpt: { en: 'Correct', fr: 'Corriger' } as T,
      openBiteMaintainOpt: { en: 'Maintain', fr: 'Maintenir' } as T,
      openBiteImprovedOpt: { en: 'Improved', fr: 'Amélioration' } as T,

      midlineHint: {
        en: 'Should the dental midline be maintained or corrected?',
        fr: 'La ligne médiane dentaire doit-elle être maintenue ou corrigée ?',
      } as T,
      midlineMaintainOpt: { en: 'Maintain', fr: 'Maintenir' } as T,
      midlineCorrectOpt: { en: 'Correct', fr: 'Corriger' } as T,

      iprHint: {
        en: 'Pick where interproximal reduction is allowed.',
        fr: 'Indiquez où la réduction interproximale est autorisée.',
      } as T,

      biteRampsHint: {
        en: 'Where should the planner place bite ramps, if any?',
        fr: 'Où le planificateur doit-il placer des plans de morsure, si nécessaire ?',
      } as T,
      biteRampsNoneOpt: { en: 'No bite ramps', fr: 'Aucun plan de morsure' } as T,
      biteRampsAnteriorOpt: { en: 'Anterior', fr: 'Antérieurs' } as T,
      biteRampsCanineOpt: { en: 'Canine / cuspid', fr: 'Canines' } as T,
      biteRampsMolarOpt: { en: 'Molar', fr: 'Molaires' } as T,

      expansionHint: {
        en: 'Select the segment that needs expansion, or “No expansion” if the arches are well-developed.',
        fr: 'Sélectionnez le segment à expandre, ou « Pas d’expansion » si les arcades sont déjà bien développées.',
      } as T,
      expansionNoneOpt: { en: 'No expansion', fr: 'Pas d’expansion' } as T,

      crossbiteHint: {
        en: 'What should happen to any present crossbite?',
        fr: 'Que faire de l’articulé inversé, s’il est présent ?',
      } as T,
      crossbiteCorrectOpt: { en: 'Correct', fr: 'Corriger' } as T,
      crossbiteMaintainOpt: { en: 'Maintain', fr: 'Maintenir' } as T,
      crossbiteAnteriorOpt: { en: 'Correct only anterior', fr: 'Corriger seulement les antérieurs' } as T,
      crossbitePosteriorOpt: { en: 'Correct only posterior', fr: 'Corriger seulement les postérieurs' } as T,

      spacesHint: {
        en: 'Close existing spaces or maintain them for future restorative work?',
        fr: 'Fermer les espaces existants ou les maintenir pour un futur traitement prothétique ?',
      } as T,
      spacesCloseOpt: { en: 'Close all spaces', fr: 'Fermer tous les espaces' } as T,
      spacesMaintainOpt: { en: 'Maintain spaces', fr: 'Maintenir les espaces' } as T,
      spacesNotesPh: {
        en: 'e.g. Close upper midline diastema; maintain space at #15 for future implant',
        fr: 'p. ex. fermer le diastème médian supérieur ; conserver l’espace en #15 pour un futur implant',
      } as T,

      // Generic segment options shared by IPR / Expansion
      segmentNo: { en: 'No', fr: 'Non' } as T,
      segmentNoIpr: { en: 'No IPR', fr: 'Pas d’IPR' } as T,
      segmentAnterior: { en: 'Anterior', fr: 'Antérieurs' } as T,
      segmentPosterior: { en: 'Posterior', fr: 'Postérieurs' } as T,
      segmentBoth: { en: 'Both', fr: 'Les deux' } as T,

      extractionsHint: {
        en: 'Teeth flagged with the orange Extract chip in the odontogram above appear here automatically. Use the notes field for confirmation, sequencing or extra context.',
        fr: 'Les dents marquées en orange « Extract » dans l’odontogramme apparaissent ici automatiquement. Utilisez les notes pour la confirmation, la séquence ou tout contexte additionnel.',
      } as T,
      extractionsTeethTitle: {
        en: 'Selected tooth-level instructions (FDI)',
        fr: 'Dents sélectionnées (notation FDI)',
      } as T,
      extractionsEmpty: {
        en: 'No teeth marked for extraction yet. Click a tooth in the odontogram above and pick Extract to add it here.',
        fr: 'Aucune dent à extraire pour le moment. Cliquez une dent dans l’odontogramme et choisissez « Extract » pour l’ajouter ici.',
      } as T,
      extractionsNotesPh: {
        en: 'e.g. Confirmed with patient; extract before treatment start',
        fr: 'p. ex. confirmé avec le patient ; extraction avant le début du traitement',
      } as T,

      sectionTitle: { en: 'Tooth-level instructions & mechanics', fr: 'Instructions par dent & mécaniques' } as T,
      sectionHint: {
        en: 'Fine-tune what should happen on each tooth — extractions, attachments, IPR — and choose the mechanics the planner should apply.',
        fr: 'Affinez ce qui doit se passer sur chaque dent — extractions, taquets, stripping — et choisissez les mécaniques à appliquer.',
      } as T,

      // Section legends
      elastics: { en: 'Elastics', fr: 'Élastiques' } as T,
      elasticsNone: { en: 'No elastics', fr: 'Pas d’élastiques' } as T,
      elasticsClassI: { en: 'Class I elastics', fr: 'Élastiques classe I' } as T,
      elasticsClassII: { en: 'Class II elastics', fr: 'Élastiques classe II' } as T,
      elasticsClassIII: { en: 'Class III elastics', fr: 'Élastiques classe III' } as T,
      elasticsVertical: { en: 'Vertical bite elastics', fr: 'Élastiques verticaux' } as T,
      elasticsCrossCross: { en: 'Criss-cross elastics', fr: 'Élastiques en croix' } as T,

      openBite: { en: 'Open bite', fr: 'Béance' } as T,
      openBiteNone: { en: 'Not present', fr: 'Absente' } as T,
      openBiteCorrect: { en: 'Correct it', fr: 'À corriger' } as T,
      openBiteMaintain: { en: 'Maintain', fr: 'Maintenir' } as T,

      biteRamps: { en: 'Bite ramps', fr: 'Plans de morsure' } as T,
      biteRampsNone: { en: 'Not needed', fr: 'Non nécessaires' } as T,
      biteRampsUpper: { en: 'Upper anterior', fr: 'Antérieurs supérieurs' } as T,
      biteRampsLower: { en: 'Lower anterior', fr: 'Antérieurs inférieurs' } as T,
      biteRampsPlanner: { en: 'Planner’s call', fr: 'Au choix du planificateur' } as T,

      iprStripping: { en: 'IPR / Stripping', fr: 'IPR / Stripping' } as T,
      iprAllowed: { en: 'Allowed', fr: 'Autorisé' } as T,
      iprAvoid: { en: 'Avoid', fr: 'À éviter' } as T,
      iprPlannerCall: { en: 'Planner’s call', fr: 'Au choix du planificateur' } as T,

      expansion: { en: 'Expansion', fr: 'Expansion' } as T,
      expansionNone: { en: 'Not requested', fr: 'Non requise' } as T,
      expansionDental: { en: 'Dental expansion', fr: 'Expansion dentaire' } as T,
      expansionSkeletal: { en: 'Skeletal expansion', fr: 'Expansion squelettique' } as T,
      expansionPlanner: { en: 'Planner’s call', fr: 'Au choix du planificateur' } as T,

      crossbite: { en: 'Crossbite', fr: 'Articulé inversé' } as T,
      crossbiteNone: { en: 'Not present', fr: 'Absente' } as T,
      crossbiteCorrect: { en: 'Correct it', fr: 'À corriger' } as T,

      spaces: { en: 'Spaces', fr: 'Espaces' } as T,
      spacesClose: { en: 'Close all spaces', fr: 'Fermer tous les espaces' } as T,
      spacesMaintain: { en: 'Maintain', fr: 'Maintenir' } as T,
      spacesPlanner: { en: 'Planner’s call', fr: 'Au choix du planificateur' } as T,

      extractions: { en: 'Extractions', fr: 'Extractions' } as T,
      extractionsNone: { en: 'None', fr: 'Aucune' } as T,
      extractionsRequested: { en: 'Requested — see odontogram', fr: 'Demandées — voir odontogramme' } as T,

      specialInstructions: { en: 'Special instructions', fr: 'Instructions spéciales' } as T,
      specialInstructionsPh: {
        en: 'Anything we should be aware of (e.g. avoid attachments on front teeth, patient travels in 3 weeks…)',
        fr: 'Tout ce que nous devrions savoir (p. ex. éviter les taquets antérieurs, le patient voyage dans 3 semaines…)',
      } as T,

      odontogramLoading: { en: 'Loading odontogram…', fr: 'Chargement de l’odontogramme…' } as T,
      odontogramHint: {
        en: 'Tap a tooth to flag an extraction, attachment, or IPR site. Tap again to clear.',
        fr: 'Touchez une dent pour signaler une extraction, un taquet ou un site d’IPR. Touchez à nouveau pour effacer.',
      } as T,
    },

    // ── Review step ──────────────────────────────────────────────
    review: {
      sectionTitle: { en: 'Review your order', fr: 'Vérifier votre commande' } as T,
      sectionHint: {
        en: 'A quick recap before you send it to the lab. You can still edit each step from the breadcrumb above.',
        fr: 'Un récapitulatif avant l’envoi au laboratoire. Vous pouvez toujours modifier chaque étape via le fil d’Ariane ci-dessus.',
      } as T,

      patientInfo: { en: 'Patient information', fr: 'Informations du patient' } as T,
      patientImages: { en: 'Patient images', fr: 'Photos du patient' } as T,
      radiographyScans: { en: 'Radiography & STL scans', fr: 'Radiographies & STL' } as T,
      treatmentObjective: { en: 'Treatment plan & clinical objective', fr: 'Plan de traitement & objectif clinique' } as T,
      toothLevel: { en: 'Tooth-level instructions & movement plan', fr: 'Instructions par dent & plan de mouvement' } as T,
      orderMetadata: { en: 'Order metadata', fr: 'Informations de commande' } as T,
      readyToSubmit: { en: 'Ready to submit', fr: 'Prêt à soumettre' } as T,
      readyToSubmitHint: {
        en: 'Once submitted, the planner is notified and you’ll receive the treatment plan to approve.',
        fr: 'Une fois soumise, le planificateur est notifié et vous recevrez le plan de traitement à approuver.',
      } as T,
    },

    // ── Actions / buttons ────────────────────────────────────────
    actions: {
      saveDraft: { en: 'Save draft', fr: 'Enregistrer le brouillon' } as T,
      saveChanges: { en: 'Save changes', fr: 'Enregistrer les modifications' } as T,
      submitOrder: { en: 'Submit order', fr: 'Soumettre la commande' } as T,
      continueLater: { en: 'Continue later', fr: 'Continuer plus tard' } as T,
    },

    // ── Validation / errors ──────────────────────────────────────
    errors: {
      patientStageRequired: { en: 'Patient stage is required.', fr: 'La phase du patient est obligatoire.' } as T,
      patientRequired: { en: 'Please pick or create a patient first.', fr: 'Veuillez choisir ou créer un patient.' } as T,
      chiefComplaintRequired: { en: 'Please describe the chief complaint.', fr: 'Veuillez décrire le motif de consultation.' } as T,
      archRequired: { en: 'Pick at least one arch to treat.', fr: 'Choisissez au moins une arcade à traiter.' } as T,
      saveFailed: { en: 'Could not save — please try again.', fr: 'Échec de l’enregistrement — veuillez réessayer.' } as T,
      loadFailed: { en: 'Could not load — please reload the page.', fr: 'Échec du chargement — rechargez la page.' } as T,
    },
  },

  // ─── Order detail page ──────────────────────────────────────────
  orderDetail: {
    backToList: { en: 'All orders', fr: 'Toutes les commandes' } as T,
    submittedOn: { en: 'Submitted on', fr: 'Soumis le' } as T,
    createdOn: { en: 'Created on', fr: 'Créé le' } as T,
    changeStatus: { en: 'Change status', fr: 'Changer le statut' } as T,
    deletedBadge: { en: 'Deleted', fr: 'Supprimé' } as T,
    delete: { en: 'Delete order', fr: 'Supprimer la commande' } as T,
    deletePermanently: { en: 'Delete permanently', fr: 'Suppression définitive' } as T,
    restore: { en: 'Restore', fr: 'Restaurer' } as T,
    editOrder: { en: 'Edit order', fr: 'Modifier la commande' } as T,

    // Tabs
    tabs: {
      details: { en: 'Order details', fr: 'Détails' } as T,
      treatmentPlan: { en: 'Treatment plan', fr: 'Plan de traitement' } as T,
      quote: { en: 'Quotation', fr: 'Devis' } as T,
    },

    // Treatment-fee banner
    fee: {
      titleAwaiting: { en: 'Awaiting treatment fee', fr: 'En attente des honoraires' } as T,
      titlePaid: { en: 'Treatment fee paid', fr: 'Honoraires payés' } as T,
      titlePending: { en: 'Bank transfer awaiting confirmation', fr: 'Virement en attente de confirmation' } as T,
      doctorPay: { en: 'Pay treatment fee', fr: 'Payer les honoraires' } as T,
      adminConfirm: { en: 'Review & confirm', fr: 'Vérifier & confirmer' } as T,
      viewReceipt: { en: 'View receipt', fr: 'Voir le reçu' } as T,
      paidOnTeam: {
        en: 'The treatment fee has been settled. The treatment plan can now be sent.',
        fr: 'Les honoraires ont été réglés. Le plan de traitement peut désormais être envoyé.',
      } as T,
      doctorPendingHint: {
        en: 'Your receipt has been received. An admin will review the proof and confirm the payment shortly.',
        fr: 'Votre justificatif est bien reçu. Un administrateur vérifiera la preuve et confirmera le paiement sous peu.',
      } as T,
      adminPendingHint: {
        en: 'A receipt was uploaded by the doctor. Review the proof and confirm once the funds land in the account.',
        fr: 'Le praticien a téléversé un justificatif. Vérifiez la preuve et confirmez dès que les fonds sont reçus.',
      } as T,
      doctorAwaitingHint: {
        en: 'The treatment plan starts as soon as the professional fee is settled. Pick a payment method below.',
        fr: 'Le plan de traitement débute dès que les honoraires sont réglés. Choisissez un mode de paiement ci-dessous.',
      } as T,
    },

    // Patient information card
    patientCard: {
      title: { en: 'Patient information', fr: 'Informations du patient' } as T,
      sex: { en: 'Sex', fr: 'Sexe' } as T,
      dob: { en: 'Date of birth', fr: 'Date de naissance' } as T,
      stage: { en: 'Patient stage', fr: 'Phase du patient' } as T,
      arch: { en: 'Arch treatment', fr: 'Arcades traitées' } as T,
      dentist: { en: 'Treating dentist', fr: 'Praticien traitant' } as T,
      address: { en: 'Address', fr: 'Adresse' } as T,
      phone: { en: 'Phone', fr: 'Téléphone' } as T,
      email: { en: 'Email', fr: 'E-mail' } as T,
      notes: { en: 'Patient notes', fr: 'Notes patient' } as T,
    },

    // Section titles inside the detail
    sections: {
      patientImages: { en: 'Patient images', fr: 'Photos du patient' } as T,
      radiographyScans: { en: 'Radiography & STL scans', fr: 'Radiographies & STL' } as T,
      clinicalObjective: { en: 'Treatment plan & clinical objective', fr: 'Plan de traitement & objectif clinique' } as T,
      toothLevel: { en: 'Tooth-level instructions & movement plan', fr: 'Instructions par dent & plan de mouvement' } as T,
      orderMetadata: { en: 'Order metadata', fr: 'Informations de commande' } as T,
    },

    // Generic error / empty states on this page
    orderNotFound: {
      en: 'Order not found or access is blocked',
      fr: 'Commande introuvable ou accès refusé',
    } as T,
    backToOrders: { en: 'Back to orders', fr: 'Retour aux commandes' } as T,
    loadingOdontogram: { en: 'Loading odontogram…', fr: 'Chargement de l’odontogramme…' } as T,
    newActivity: { en: 'New activity', fr: 'Nouvelle activité' } as T,

    // Soft + permanent delete dialog copy
    deleteDescription: {
      en: 'This soft-deletes the order. Backend permissions still enforce dentist ownership.',
      fr: 'La commande sera archivée. Les permissions backend continuent d’appliquer la propriété du praticien.',
    } as T,
    deletePermanentlyDescription: {
      en: 'This removes the order, tooth instructions, file records, and stored files. This cannot be undone.',
      fr: 'Cela supprime la commande, les instructions par dent, les fichiers enregistrés et les pièces stockées. Cette action est irréversible.',
    } as T,

    // Sex / gender labels (used on the patient card)
    gender: {
      male: { en: 'Male', fr: 'Homme' } as T,
      female: { en: 'Female', fr: 'Femme' } as T,
      other: { en: 'Other', fr: 'Autre' } as T,
    },

    // Age display ("32 yrs" / "2 yrs 4 mo")
    age: {
      yr: { en: 'yr', fr: 'an' } as T,
      yrs: { en: 'yrs', fr: 'ans' } as T,
      mo: { en: 'mo', fr: 'mois' } as T,
    },

    // Movement / mechanics labels under the odontogram
    movement: {
      elastics: { en: 'Elastics', fr: 'Élastiques' } as T,
      openBite: { en: 'Open bite', fr: 'Béance' } as T,
      midline: { en: 'Midline', fr: 'Ligne médiane' } as T,
      ipr: { en: 'IPR', fr: 'IPR' } as T,
      biteRamps: { en: 'Bite ramps', fr: 'Plans de morsure' } as T,
      expansion: { en: 'Expansion', fr: 'Expansion' } as T,
      noExpansion: { en: 'No expansion', fr: 'Pas d’expansion' } as T,
      crossbite: { en: 'Crossbite', fr: 'Articulé inversé' } as T,
      spaces: { en: 'Spaces', fr: 'Espaces' } as T,
      extractions: { en: 'Extractions', fr: 'Extractions' } as T,
      specialInstructions: { en: 'Special instructions', fr: 'Instructions spéciales' } as T,
      additionalNotes: { en: 'Additional notes', fr: 'Notes additionnelles' } as T,
    },

    // Order metadata block at the bottom
    metadata: {
      cbctRequested: { en: 'CBCT requested', fr: 'CBCT demandé' } as T,
      yes: { en: 'Yes', fr: 'Oui' } as T,
      no: { en: 'No', fr: 'Non' } as T,
      manufacturing: { en: 'Manufacturing', fr: 'Fabrication' } as T,
      requested: { en: 'Requested', fr: 'Demandée' } as T,
      notRequested: { en: 'Not requested', fr: 'Non demandée' } as T,
      materials: { en: 'Materials', fr: 'Matériaux' } as T,
      notSet: { en: 'Not set', fr: 'Non renseigné' } as T,
      orderCode: { en: 'Order code', fr: 'Code commande' } as T,
    },

    // Treatment plans section (inside the tab)
    plans: {
      loading: { en: 'Loading treatment plans…', fr: 'Chargement des plans de traitement…' } as T,
      empty: { en: 'No treatment plans yet.', fr: 'Aucun plan de traitement pour le moment.' } as T,
      newPlan: { en: 'New plan', fr: 'Nouveau plan' } as T,
      createFirst: { en: 'Create the first plan', fr: 'Créer le premier plan' } as T,
    },

    // Treatment-fee gate banner (extra strings on top of orderDetail.fee.*)
    feeBanner: {
      awaitingTitle: {
        en: 'Awaiting treatment fee — {amount} {currency}',
        fr: 'En attente des honoraires — {amount} {currency}',
      } as T,
      awaitingHint: {
        en: 'The professional fee must be settled before the admin can send the treatment plan. One-time payment per order.',
        fr: 'Les honoraires professionnels doivent être réglés avant que l’administrateur ne puisse envoyer le plan de traitement. Paiement unique par commande.',
      } as T,
      pendingTitle: {
        en: 'Bank transfer awaiting confirmation — {amount} {currency}',
        fr: 'Virement en attente de confirmation — {amount} {currency}',
      } as T,
      paidViaSuffix: { en: 'via {method}', fr: 'via {method}' } as T,
      paidHint: {
        en: 'The treatment plan can now be sent.',
        fr: 'Le plan de traitement peut désormais être envoyé.',
      } as T,
    },
  },

  // ─── Navigation (header / sidebar) ──────────────────────────────
  nav: {
    dashboard: { en: 'Dashboard', fr: 'Tableau de bord' } as T,
    orders: { en: 'Orders', fr: 'Commandes' } as T,
    patients: { en: 'Patients', fr: 'Patients' } as T,
    payments: { en: 'Payments', fr: 'Paiements' } as T,
    paymentHistory: { en: 'Payment history', fr: 'Historique des paiements' } as T,
    pendingPayments: { en: 'Pending payments', fr: 'Paiements en attente' } as T,
    packs: { en: 'Packs', fr: 'Forfaits' } as T,
    messages: { en: 'Messages', fr: 'Messages' } as T,
    notifications: { en: 'Notifications', fr: 'Notifications' } as T,
    media: { en: 'Media', fr: 'Médias' } as T,
    reports: { en: 'Reports', fr: 'Rapports' } as T,
    settings: { en: 'Settings', fr: 'Paramètres' } as T,
    account: { en: 'My account', fr: 'Mon compte' } as T,
    logout: { en: 'Log out', fr: 'Déconnexion' } as T,
  },

  // ─── Dashboard (doctor home page) ───────────────────────────────
  // Strings shown on the post-login dashboard: header, KPI tiles,
  // the two breakdown popups (outstanding + paid), and the
  // read-only pack catalogue underneath. French translations use
  // standard Tunisian dental-clinic vocabulary so a non-bilingual
  // dentist immediately recognises every label.
  dashboard: {
    title: { en: 'Your dashboard', fr: 'Votre tableau de bord' } as T,
    subtitle: {
      en: "Your clinic's activity, balance, and pack usage at a glance.",
      fr: 'L’activité de votre cabinet, votre solde et l’usage de vos forfaits en un coup d’œil.',
    } as T,
    refresh: { en: 'Refresh', fr: 'Actualiser' } as T,
    refreshing: { en: 'Refreshing…', fr: 'Actualisation…' } as T,
    retry: { en: 'Retry', fr: 'Réessayer' } as T,
    tryAgain: { en: 'Try again', fr: 'Réessayer' } as T,

    // Error banner shown when the KPI endpoint fails outright.
    loadError: {
      title: { en: 'Could not load your dashboard', fr: 'Impossible de charger votre tableau de bord' } as T,
      generic: {
        en: 'The API did not respond. Please check your internet connection and try again.',
        fr: 'L’API n’a pas répondu. Vérifiez votre connexion Internet et réessayez.',
      } as T,
    },

    // KPI tiles
    kpi: {
      totalOrders: { en: 'Total orders', fr: 'Total des commandes' } as T,
      totalOrdersThisMonth: {
        en: 'This month: {count}',
        fr: 'Ce mois-ci : {count}',
      } as T,
      totalOrdersToday: {
        en: 'Today: {count}',
        fr: 'Aujourd’hui : {count}',
      } as T,

      outstandingBalance: { en: 'Outstanding balance', fr: 'Solde dû' } as T,
      outstandingClickForDetails: {
        en: 'Click for details — {count} unpaid',
        fr: 'Cliquez pour le détail — {count} impayée(s)',
      } as T,
      outstandingAllClear: {
        en: 'All clear — click for details.',
        fr: 'Tout est réglé — cliquez pour le détail.',
      } as T,

      totalPatients: { en: 'Total patients', fr: 'Total des patients' } as T,
      totalPatientsNew: {
        en: '+{count} new this month',
        fr: '+{count} nouveau(x) ce mois-ci',
      } as T,

      pendingPayments: { en: 'Pending payments', fr: 'Paiements en attente' } as T,
      awaitingConfirmation: {
        en: 'Awaiting confirmation: {count}',
        fr: 'En attente de confirmation : {count}',
      } as T,

      unpaidOrders: { en: 'Unpaid orders', fr: 'Commandes impayées' } as T,
      unpaidOrdersHint: {
        en: 'Click for the per-order breakdown.',
        fr: 'Cliquez pour le détail par commande.',
      } as T,
      unpaidOrdersEmpty: {
        en: 'Nothing unpaid — click for details.',
        fr: 'Rien d’impayé — cliquez pour le détail.',
      } as T,

      paidOrders: { en: 'Paid orders', fr: 'Commandes payées' } as T,
      paidOrdersCollected: {
        en: 'Collected: {amount}',
        fr: 'Encaissé : {amount}',
      } as T,
      paidOrdersEmpty: {
        en: 'No paid orders yet — click for details.',
        fr: 'Aucune commande payée — cliquez pour le détail.',
      } as T,
    },

    // Available packs section
    packs: {
      sectionTitle: { en: 'Available packs', fr: 'Forfaits disponibles' } as T,
      sectionHint: {
        en: 'informational — choose your pack on the order form.',
        fr: 'informatif — choisissez votre forfait dans le formulaire de commande.',
      } as T,
      none: { en: 'No packs are currently available.', fr: 'Aucun forfait n’est disponible pour le moment.' } as T,
      recommended: { en: 'Recommended', fr: 'Recommandé' } as T,
      defaultDescription: {
        en: 'Customized aligner workflow tailored to your clinic.',
        fr: 'Parcours d’aligneurs personnalisé pour votre cabinet.',
      } as T,
      featureUnlimitedSteps: {
        en: 'Unlimited treatment steps',
        fr: 'Étapes de traitement illimitées',
      } as T,
      featureStepsPerArch: {
        en: '{count} steps per arch',
        fr: '{count} étape(s) par arcade',
      } as T,
      featureUnlimitedCorrections: {
        en: 'Unlimited corrections',
        fr: 'Corrections illimitées',
      } as T,
      featureIncludedCorrections: {
        en: '{count} corrections included',
        fr: '{count} correction(s) incluse(s)',
      } as T,
      featureForOrthodontists: {
        en: 'Tailored for orthodontists',
        fr: 'Conçu pour les orthodontistes',
      } as T,
      featureGeneralDentists: {
        en: 'General dentists welcome',
        fr: 'Ouvert aux omnipraticiens',
      } as T,
      hintCurrent: {
        en: 'Your current pack. You can pick it again when you create a new order.',
        fr: 'Votre forfait actuel. Vous pouvez le sélectionner à nouveau lors d’une prochaine commande.',
      } as T,
      hintChoose: {
        en: 'Choose this pack from the New Order form when you create a case.',
        fr: 'Sélectionnez ce forfait dans le formulaire « Nouvelle commande » lors de la création d’un cas.',
      } as T,
    },

    // Outstanding-balance popup
    outstandingDialog: {
      title: { en: 'Outstanding balance', fr: 'Solde dû' } as T,
      description: {
        en: 'Approved orders with a remaining amount due. Click any row to open the order.',
        fr: 'Commandes approuvées avec un solde restant à régler. Cliquez une ligne pour ouvrir la commande.',
      } as T,
      orderCount: {
        en: '{count} order{s}',
        fr: '{count} commande(s)',
      } as T,
      totalDue: { en: 'Total due', fr: 'Total dû' } as T,
      settleHint: {
        en: 'Settle to unlock the next batch of steps.',
        fr: 'Réglez le solde pour débloquer la prochaine série d’étapes.',
      } as T,
      paidUp: { en: "You're fully paid up.", fr: 'Vous êtes à jour de vos paiements.' } as T,

      // Table columns
      colOrder: { en: 'Order', fr: 'Commande' } as T,
      colPatient: { en: 'Patient', fr: 'Patient' } as T,
      colPack: { en: 'Pack', fr: 'Forfait' } as T,
      colProgress: { en: 'Progress', fr: 'Progression' } as T,
      colRemaining: { en: 'Remaining', fr: 'Restant' } as T,
      colUpdated: { en: 'Updated', fr: 'Mis à jour' } as T,
      progressPaid: {
        en: '{pct}% paid',
        fr: '{pct} % payé',
      } as T,
      ofTotal: { en: 'of {total}', fr: 'sur {total}' } as T,

      // States
      nothingOutstandingTitle: {
        en: 'Nothing outstanding',
        fr: 'Aucun solde dû',
      } as T,
      nothingOutstandingBody: {
        en: 'All your approved orders are paid in full. Nothing for you to chase right now.',
        fr: 'Toutes vos commandes approuvées sont réglées. Aucun rappel à effectuer pour le moment.',
      } as T,
      summaryOnlyTitle: { en: 'Summary only', fr: 'Résumé uniquement' } as T,
      summaryOnlyBody: {
        en: "We couldn't load the per-order breakdown right now. The headline figures from your dashboard are still accurate:",
        fr: 'Le détail par commande n’a pas pu être chargé pour le moment. Les chiffres clés du tableau de bord restent corrects :',
      } as T,
      summaryUnpaidCount: { en: 'Unpaid orders', fr: 'Commandes impayées' } as T,
      errorTitle: {
        en: "Couldn't load your outstanding orders",
        fr: 'Impossible de charger vos commandes impayées',
      } as T,
      error404Hint: {
        en: 'The server may be updating. Wait a moment and try again.',
        fr: 'Le serveur est peut-être en cours de mise à jour. Patientez un instant puis réessayez.',
      } as T,

      // Footer
      paymentHistory: { en: 'Payment history', fr: 'Historique des paiements' } as T,
      openAction: { en: 'Open', fr: 'Ouvrir' } as T,
      close: { en: 'Close', fr: 'Fermer' } as T,
    },

    // Paid-orders popup
    paidDialog: {
      title: { en: 'Paid orders', fr: 'Commandes payées' } as T,
      description: {
        en: 'Approved orders settled in full. Click any row to open the order.',
        fr: 'Commandes approuvées intégralement payées. Cliquez une ligne pour ouvrir la commande.',
      } as T,
      totalCollected: { en: 'Total collected', fr: 'Total encaissé' } as T,
      revenueHint: {
        en: 'Revenue from fully settled orders.',
        fr: 'Revenus issus des commandes intégralement réglées.',
      } as T,
      noneYetHint: {
        en: 'No orders settled yet — your first one is coming.',
        fr: 'Aucune commande réglée pour l’instant — votre première arrive.',
      } as T,

      // Table columns
      colStatus: { en: 'Status', fr: 'Statut' } as T,
      colCollected: { en: 'Collected', fr: 'Encaissé' } as T,
      colSettled: { en: 'Settled', fr: 'Réglée' } as T,
      progressPaid: { en: '100% paid', fr: '100 % payée' } as T,

      // States
      emptyTitle: {
        en: 'No paid orders yet',
        fr: 'Aucune commande payée pour l’instant',
      } as T,
      emptyBody: {
        en: "Once an approved order is settled in full it will appear here. Keep going — your first one is around the corner.",
        fr: 'Dès qu’une commande approuvée est intégralement payée, elle apparaîtra ici. Persévérez — la première arrive bientôt.',
      } as T,
      summaryPaidCount: { en: 'Paid orders', fr: 'Commandes payées' } as T,
      errorTitle: {
        en: "Couldn't load your paid orders",
        fr: 'Impossible de charger vos commandes payées',
      } as T,
    },
  },

  // ─── Patients page (/dashboard/patients) ────────────────────────
  // FR copy uses Tunisian clinical-records vocabulary — "registre",
  // "Nom complet", "Date de naissance", etc. — so a French-speaking
  // clinic recognises every field without an English crutch.
  patients: {
    // Header strap
    eyebrow: { en: 'Clinical patient registry', fr: 'Registre clinique des patients' } as T,
    title: { en: 'Patients', fr: 'Patients' } as T,
    subtitleAdmin: {
      en: 'Browse patients across every dentist on the platform, filter by demographics, and manage records.',
      fr: 'Parcourez les patients de tous les praticiens, filtrez par données démographiques et gérez les dossiers.',
    } as T,
    subtitleDentist: {
      en: 'Browse your patient list, capture demographics, and prepare them for new aligner cases.',
      fr: 'Consultez votre liste de patients, enregistrez leurs données démographiques et préparez-les pour de nouveaux cas d’aligneurs.',
    } as T,
    addPatient: { en: 'Add Patient', fr: 'Ajouter un patient' } as T,
    noRole: {
      en: 'Your role does not manage patients directly.',
      fr: 'Votre rôle ne gère pas directement les patients.',
    } as T,

    // Toolbar
    searchPh: {
      en: 'Search by name, email, or phone…',
      fr: 'Rechercher par nom, e-mail ou téléphone…',
    } as T,
    filters: { en: 'Filters', fr: 'Filtres' } as T,
    sort: { en: 'Sort', fr: 'Trier' } as T,
    sortBy: { en: 'Sort by', fr: 'Trier par' } as T,
    refresh: { en: 'Refresh', fr: 'Actualiser' } as T,

    // Sort options
    sortNewest: { en: 'Newest first', fr: 'Du plus récent' } as T,
    sortOldest: { en: 'Oldest first', fr: 'Du plus ancien' } as T,
    sortNameAsc: { en: 'Name (A–Z)', fr: 'Nom (A–Z)' } as T,
    sortNameDesc: { en: 'Name (Z–A)', fr: 'Nom (Z–A)' } as T,
    sortUpdated: { en: 'Recently updated', fr: 'Récemment mis à jour' } as T,

    // Filter panel
    dentistLabel: { en: 'Dentist', fr: 'Praticien' } as T,
    allDentists: { en: 'All dentists', fr: 'Tous les praticiens' } as T,
    genderLabel: { en: 'Gender', fr: 'Sexe' } as T,
    genderAll: { en: 'All', fr: 'Tous' } as T,
    genderFemale: { en: 'Female', fr: 'Femme' } as T,
    genderMale: { en: 'Male', fr: 'Homme' } as T,
    genderOther: { en: 'Other', fr: 'Autre' } as T,
    createdFrom: { en: 'Created from', fr: 'Créé du' } as T,
    createdTo: { en: 'Created to', fr: 'Créé au' } as T,
    clearFilters: { en: 'Clear filters', fr: 'Effacer les filtres' } as T,

    // Filter chips
    activeLabel: { en: 'Active:', fr: 'Actifs :' } as T,
    chipSearch: { en: 'Search: "{value}"', fr: 'Recherche : « {value} »' } as T,
    chipDentist: { en: 'Dentist: {value}', fr: 'Praticien : {value}' } as T,
    chipGender: { en: 'Gender: {value}', fr: 'Sexe : {value}' } as T,
    chipFrom: { en: 'From {value}', fr: 'À partir du {value}' } as T,
    chipTo: { en: 'To {value}', fr: 'Jusqu’au {value}' } as T,
    chipUnknown: { en: 'Unknown', fr: 'Inconnu' } as T,

    // Bulk action bar
    bulkSelected: {
      en: '{count} patient{s} selected',
      fr: '{count} patient(s) sélectionné(s)',
    } as T,
    bulkDeselect: { en: 'Deselect all', fr: 'Tout désélectionner' } as T,
    bulkDelete: {
      en: 'Delete {count} patient{s}',
      fr: 'Supprimer {count} patient(s)',
    } as T,
    bulkConfirmTitle: {
      en: 'Delete {count} patient{s}?',
      fr: 'Supprimer {count} patient(s) ?',
    } as T,
    bulkConfirmBody: {
      en: 'This will soft-delete {count} patient record{s}. The records will disappear from active lists but existing orders are preserved.',
      fr: 'Cela supprimera {count} dossier(s) patient (suppression douce). Les fiches disparaîtront des listes actives, mais les commandes existantes sont conservées.',
    } as T,
    cancel: { en: 'Cancel', fr: 'Annuler' } as T,

    // Table headers
    colName: { en: 'Name', fr: 'Nom' } as T,
    colEmail: { en: 'Email', fr: 'E-mail' } as T,
    colPhone: { en: 'Phone', fr: 'Téléphone' } as T,
    colGender: { en: 'Gender', fr: 'Sexe' } as T,
    colDentist: { en: 'Dentist', fr: 'Praticien' } as T,
    colCreated: { en: 'Created', fr: 'Créé le' } as T,
    colActions: { en: 'Actions', fr: 'Actions' } as T,

    // Row bits
    dobPrefix: { en: 'DOB', fr: 'Né(e) le' } as T,
    selectAllAria: {
      en: 'Select all patients on this page',
      fr: 'Sélectionner tous les patients de cette page',
    } as T,
    selectAria: { en: 'Select {name}', fr: 'Sélectionner {name}' } as T,
    actionsAria: { en: 'Actions for {name}', fr: 'Actions pour {name}' } as T,
    openEdit: { en: 'Open / edit', fr: 'Ouvrir / modifier' } as T,
    deletePatient: { en: 'Delete patient', fr: 'Supprimer le patient' } as T,
    deletePatientConfirmTitle: {
      en: 'Delete patient?',
      fr: 'Supprimer le patient ?',
    } as T,
    deletePatientConfirmBody: {
      en: 'This soft-deletes {name}. The record stays in the database but disappears from active patient lists. Existing orders remain visible.',
      fr: 'Cela supprime {name} en mode douce. La fiche reste en base mais disparaît des listes actives. Les commandes existantes restent visibles.',
    } as T,

    // Mobile card fallback strings
    noEmail: { en: 'No email', fr: 'Aucun e-mail' } as T,
    noPhone: { en: 'No phone', fr: 'Aucun téléphone' } as T,
    noBirthDate: { en: 'No birth date', fr: 'Aucune date de naissance' } as T,
    noDentist: { en: 'No dentist', fr: 'Aucun praticien' } as T,

    // States
    loadingFailedTitle: {
      en: 'Failed to load patients',
      fr: 'Échec du chargement des patients',
    } as T,
    retry: { en: 'Retry', fr: 'Réessayer' } as T,
    emptyTitle: { en: 'No patients found', fr: 'Aucun patient trouvé' } as T,
    emptyBodyFiltered: {
      en: 'No patients match the current filters. Try widening the search or clearing filters.',
      fr: 'Aucun patient ne correspond aux filtres actuels. Essayez d’élargir la recherche ou d’effacer les filtres.',
    } as T,
    emptyBodyNone: {
      en: 'Add your first patient to start creating orders.',
      fr: 'Ajoutez votre premier patient pour commencer à créer des commandes.',
    } as T,

    // Pagination
    pagSummary: {
      en: '{from}–{to} of {total} patients',
      fr: '{from}–{to} sur {total} patients',
    } as T,
    pagRowsPerPage: { en: 'Rows per page', fr: 'Lignes par page' } as T,
    pagPrevious: { en: 'Previous', fr: 'Précédent' } as T,
    pagNext: { en: 'Next', fr: 'Suivant' } as T,
    pagPageOf: {
      en: 'Page {page} of {total}',
      fr: 'Page {page} sur {total}',
    } as T,

    // ── Detail sheet (add + edit) ────────────────────────────────
    sheet: {
      titleEdit: { en: 'Edit patient', fr: 'Modifier le patient' } as T,
      titleCreate: { en: 'New patient', fr: 'Nouveau patient' } as T,
      descEdit: {
        en: 'Edit demographics, clinical conditions and dentist assignment for this patient.',
        fr: 'Modifier les données démographiques, les conditions cliniques et l’affectation du praticien.',
      } as T,
      descCreate: {
        en: 'Capture identity and clinical context for a new patient record.',
        fr: 'Saisissez l’identité et le contexte clinique d’un nouveau dossier patient.',
      } as T,
      unnamed: { en: 'Unnamed patient', fr: 'Patient sans nom' } as T,
      draftBadge: { en: 'Draft — not saved yet', fr: 'Brouillon — non enregistré' } as T,

      // Tabs
      tabIdentity: { en: 'Identity', fr: 'Identité' } as T,
      tabContact: { en: 'Contact', fr: 'Coordonnées' } as T,
      tabClinical: { en: 'Clinical', fr: 'Clinique' } as T,
      tabNotes: { en: 'Notes', fr: 'Notes' } as T,

      // Identity tab
      fieldName: { en: 'Patient name', fr: 'Nom du patient' } as T,
      fieldNamePh: { en: 'Full legal name', fr: 'Nom complet officiel' } as T,
      fieldDob: { en: 'Date of birth', fr: 'Date de naissance' } as T,
      fieldGender: { en: 'Gender', fr: 'Sexe' } as T,
      fieldGenderPh: { en: 'Select gender', fr: 'Choisir le sexe' } as T,
      fieldDentist: { en: 'Assigned dentist', fr: 'Praticien attribué' } as T,
      fieldDentistPh: { en: 'Select dentist', fr: 'Choisir un praticien' } as T,

      // Contact tab
      fieldEmail: { en: 'Email', fr: 'E-mail' } as T,
      fieldEmailPh: { en: 'patient@example.com', fr: 'patient@example.com' } as T,
      fieldPhone: { en: 'Phone', fr: 'Téléphone' } as T,
      fieldPhonePh: { en: '+21612345678', fr: '+21612345678' } as T,
      fieldAddress: { en: 'Address', fr: 'Adresse' } as T,
      fieldAddressPh: {
        en: 'Street, city, postal code',
        fr: 'Rue, ville, code postal',
      } as T,

      // Notes tab
      fieldNotes: { en: 'Internal notes', fr: 'Notes internes' } as T,
      fieldNotesDesc: {
        en: 'Allergies, relevant medical history, anything the planner should know. Visible to the dentist and the planner only.',
        fr: 'Allergies, antécédents médicaux pertinents, toute information utile au planificateur. Visible uniquement par le praticien et le planificateur.',
      } as T,
      fieldNotesPh: { en: 'Notes…', fr: 'Notes…' } as T,

      // Footer
      cancel: { en: 'Cancel', fr: 'Annuler' } as T,
      saveChanges: { en: 'Save changes', fr: 'Enregistrer les modifications' } as T,
      createPatient: { en: 'Create patient', fr: 'Créer le patient' } as T,

      // Inline delete
      deleteBtn: { en: 'Delete patient', fr: 'Supprimer le patient' } as T,
      deleteTitle: { en: 'Delete patient?', fr: 'Supprimer le patient ?' } as T,
      deleteBodyNamed: {
        en: 'This soft-deletes {name}. The record stays in the database but disappears from active patient lists. Existing orders for this patient remain visible.',
        fr: 'Cela supprime {name} en mode douce. La fiche reste en base mais disparaît des listes actives. Les commandes existantes pour ce patient restent visibles.',
      } as T,
      deleteThis: { en: 'this patient', fr: 'ce patient' } as T,
    },
  },

  // ─── Orders page (/dashboard/orders) ────────────────────────────
  // Lives under `ordersPage` (not `orders`) because the `orders` block
  // is already taken by the status-badge labels and the new-order
  // wizard copy — keeping them separate avoids deep namespace clashes.
  ordersPage: {
    // Header strap
    eyebrow: { en: 'Aligner order operations', fr: 'Gestion des commandes d’aligneurs' } as T,
    title: { en: 'Orders', fr: 'Commandes' } as T,
    subtitleAdmin: {
      en: 'Review clinical submissions, dentist ownership, patient records, and uploaded case files from one workspace.',
      fr: 'Examinez les soumissions cliniques, les praticiens responsables, les fiches patient et les fichiers téléversés depuis un seul espace.',
    } as T,
    subtitleDesigner: {
      en: 'Review assigned order cases and attached clinical assets.',
      fr: 'Consultez les commandes qui vous sont attribuées et les pièces cliniques associées.',
    } as T,
    subtitleDentist: {
      en: 'Create treatment drafts, attach scan files, and submit aligner cases for production review.',
      fr: 'Créez des brouillons de traitement, joignez les empreintes et soumettez vos cas d’aligneurs pour validation.',
    } as T,
    newOrder: { en: 'New Order', fr: 'Nouvelle commande' } as T,

    // Status tabs. Final shape: 8 tabs (All + 7 lifecycle phases) so
    // the strip stays readable on a phone. The previous strip listed
    // 10 tabs with two duplicates (PAID vs FABRICATION, PLAN_READY
    // vs APPROVED) that read like the same step from a clinician's
    // perspective — collapsed here so each tab is one clear bucket.
    // Tab labels match the badge labels word-for-word — "In Fabrication"
    // on the badge → "In Fabrication" on the tab, so the user can
    // recognise a row's tab home at a glance.
    tabAll: { en: 'All', fr: 'Toutes' } as T,
    tabDraft: { en: 'Draft', fr: 'Brouillon' } as T,
    tabSubmitted: { en: 'Submitted', fr: 'Soumises' } as T,
    tabTreatmentPlan: { en: 'Treatment plan', fr: 'Plan de traitement' } as T,
    tabQuoteSent: { en: 'Quote sent', fr: 'Devis envoyé' } as T,
    tabInFabrication: { en: 'In Fabrication', fr: 'En fabrication' } as T,
    tabShipped: { en: 'Shipped', fr: 'Expédiée' } as T,
    tabDone: { en: 'Done', fr: 'Terminée' } as T,

    // Toolbar
    searchPh: {
      en: 'Search order code, patient, or dentist…',
      fr: 'Rechercher par code, patient ou praticien…',
    } as T,
    filters: { en: 'Filters', fr: 'Filtres' } as T,
    sort: { en: 'Sort', fr: 'Trier' } as T,
    sortBy: { en: 'Sort by', fr: 'Trier par' } as T,
    refresh: { en: 'Refresh', fr: 'Actualiser' } as T,
    trash: { en: 'Trash', fr: 'Corbeille' } as T,
    activeOrders: { en: 'Active orders', fr: 'Commandes actives' } as T,
    showDeletedTitle: { en: 'Show deleted orders', fr: 'Afficher les commandes supprimées' } as T,
    backToActiveTitle: { en: 'Back to active orders', fr: 'Retour aux commandes actives' } as T,

    // Sort options
    sortNewest: { en: 'Newest first', fr: 'Du plus récent' } as T,
    sortOldest: { en: 'Oldest first', fr: 'Du plus ancien' } as T,
    sortUpdated: { en: 'Recently updated', fr: 'Récemment mis à jour' } as T,
    sortCodeAsc: { en: 'Order code (A–Z)', fr: 'Code commande (A–Z)' } as T,
    sortCodeDesc: { en: 'Order code (Z–A)', fr: 'Code commande (Z–A)' } as T,
    sortStatus: { en: 'Status (A–Z)', fr: 'Statut (A–Z)' } as T,

    // Filter panel
    dentistLabel: { en: 'Dentist', fr: 'Praticien' } as T,
    allDentists: { en: 'All dentists', fr: 'Tous les praticiens' } as T,
    createdFrom: { en: 'Created from', fr: 'Créée du' } as T,
    createdTo: { en: 'Created to', fr: 'Créée au' } as T,
    clearFilters: { en: 'Clear filters', fr: 'Effacer les filtres' } as T,

    // Filter chips
    activeLabel: { en: 'Active:', fr: 'Actifs :' } as T,
    chipStatus: { en: 'Status: {value}', fr: 'Statut : {value}' } as T,
    chipSearch: { en: 'Search: "{value}"', fr: 'Recherche : « {value} »' } as T,
    chipDentist: { en: 'Dentist: {value}', fr: 'Praticien : {value}' } as T,
    chipFrom: { en: 'From {value}', fr: 'À partir du {value}' } as T,
    chipTo: { en: 'To {value}', fr: 'Jusqu’au {value}' } as T,
    chipUnknown: { en: 'Unknown', fr: 'Inconnu' } as T,

    // Trash banner
    trashBannerBody: {
      en: 'Viewing deleted orders. Restore brings them back into the catalogue; Delete forever wipes them and their files from disk — irreversible.',
      fr: 'Affichage des commandes supprimées. La restauration les remet dans le catalogue ; la suppression définitive efface aussi les fichiers du disque — irréversible.',
    } as T,
    backToActive: { en: 'Back to active', fr: 'Retour aux actives' } as T,

    // Bulk action bars
    bulkSelected: {
      en: '{count} order{s} selected',
      fr: '{count} commande(s) sélectionnée(s)',
    } as T,
    bulkSubtext: {
      en: 'Bulk actions are admin-only — every row in the batch is updated inside a single transaction.',
      fr: 'Les actions groupées sont réservées aux administrateurs — chaque ligne du lot est mise à jour dans une seule transaction.',
    } as T,
    bulkMarkFinished: { en: 'Mark as Finished', fr: 'Marquer comme terminée' } as T,
    bulkChangeStatus: { en: 'Change status…', fr: 'Changer le statut…' } as T,
    bulkDeleteSelected: { en: 'Delete selected', fr: 'Supprimer la sélection' } as T,
    cancel: { en: 'Cancel', fr: 'Annuler' } as T,

    // Trash bulk
    trashBulkSelected: {
      en: '{count} deleted order{s} selected',
      fr: '{count} commande(s) supprimée(s) sélectionnée(s)',
    } as T,
    trashBulkSubtext: {
      en: 'Restore brings rows back into the catalogue. Delete forever wipes them and their files from disk — irreversible.',
      fr: 'La restauration remet les lignes dans le catalogue. La suppression définitive efface aussi les fichiers du disque — irréversible.',
    } as T,
    bulkRestoreSelected: { en: 'Restore selected', fr: 'Restaurer la sélection' } as T,
    bulkDeleteForever: { en: 'Delete forever', fr: 'Supprimer définitivement' } as T,

    // Bulk confirm dialogs
    bulkChangeStatusTitle: {
      en: 'Change status of {count} order{s}',
      fr: 'Changer le statut de {count} commande(s)',
    } as T,
    bulkDeleteTitle: {
      en: 'Delete {count} order{s}?',
      fr: 'Supprimer {count} commande(s) ?',
    } as T,
    bulkDeleteBody: {
      en: 'This soft-deletes {count} order{s}. The records stay in the database but disappear from active order lists. Hard-delete remains per-order from the row menu.',
      fr: 'Cela supprime {count} commande(s) en mode douce. Les fiches restent en base mais disparaissent des listes actives. La suppression définitive reste accessible par ligne via le menu.',
    } as T,
    bulkDeleteConfirm: {
      en: 'Delete {count} order{s}',
      fr: 'Supprimer {count} commande(s)',
    } as T,
    bulkRestoreTitle: {
      en: 'Restore {count} order{s}?',
      fr: 'Restaurer {count} commande(s) ?',
    } as T,
    bulkRestoreBody: {
      en: 'The order{s} will reappear in the active orders list. You can soft-delete {them} again later if needed.',
      fr: 'La/Les commande(s) réapparaîtront dans la liste active. Vous pourrez les supprimer à nouveau plus tard si besoin.',
    } as T,
    bulkRestoreConfirm: {
      en: 'Restore {count} order{s}',
      fr: 'Restaurer {count} commande(s)',
    } as T,
    bulkHardTitle: {
      en: 'Delete {count} order{s} forever?',
      fr: 'Supprimer {count} commande(s) définitivement ?',
    } as T,
    bulkHardBody: {
      en: 'This permanently wipes {count} order{s} and {their} attached files from disk. The database rows go too — there is no undo.',
      fr: 'Cela efface définitivement {count} commande(s) et leurs fichiers attachés du disque. Les lignes en base disparaissent aussi — pas de retour en arrière.',
    } as T,

    // Table headers
    colOrder: { en: 'Order', fr: 'Commande' } as T,
    colPatient: { en: 'Patient', fr: 'Patient' } as T,
    colDentistCol: { en: 'Dentist', fr: 'Praticien' } as T,
    colClinical: { en: 'Clinical', fr: 'Clinique' } as T,
    colStatus: { en: 'Status', fr: 'Statut' } as T,
    colCreated: { en: 'Created', fr: 'Créée le' } as T,
    colActions: { en: 'Actions', fr: 'Actions' } as T,

    // Row details
    files: { en: '{count} file{s}', fr: '{count} fichier(s)' } as T,
    noPatient: { en: 'No patient', fr: 'Aucun patient' } as T,
    noPatientSelected: { en: 'No patient selected', fr: 'Aucun patient sélectionné' } as T,
    noDentist: { en: 'No dentist', fr: 'Aucun praticien' } as T,
    archNotSet: { en: 'Arch not set', fr: 'Arcade non définie' } as T,
    stageNotSet: { en: 'Stage not set', fr: 'Phase non définie' } as T,
    deletedPill: { en: 'Deleted', fr: 'Supprimée' } as T,

    // ARIA labels
    openOrderAria: { en: 'Open order {code}', fr: 'Ouvrir la commande {code}' } as T,
    selectOrderAria: { en: 'Select {code}', fr: 'Sélectionner {code}' } as T,
    selectAllAria: { en: 'Select all on page', fr: 'Tout sélectionner sur la page' } as T,
    deselectAllAria: { en: 'Deselect all on page', fr: 'Tout désélectionner sur la page' } as T,
    actionsForAria: { en: 'Actions for {code}', fr: 'Actions pour {code}' } as T,

    // Row actions menu
    deletedSuffix: { en: '· deleted', fr: '· supprimée' } as T,
    viewOrder: { en: 'View order', fr: 'Voir la commande' } as T,
    editOrder: { en: 'Edit order', fr: 'Modifier la commande' } as T,
    deleteOrder: { en: 'Delete order', fr: 'Supprimer la commande' } as T,
    restore: { en: 'Restore', fr: 'Restaurer' } as T,
    deleteForever: { en: 'Delete forever', fr: 'Supprimer définitivement' } as T,
    changeStatusDots: { en: 'Change status…', fr: 'Changer le statut…' } as T,

    // Row confirm dialogs
    deleteOrderTitle: { en: 'Delete order?', fr: 'Supprimer la commande ?' } as T,
    deleteOrderBody: {
      en: 'This will hide {code} from active order lists. The order can still be recovered from the database by an admin.',
      fr: 'Cela masquera {code} des listes actives. La commande peut encore être restaurée par un administrateur depuis la base de données.',
    } as T,
    deleteOrderConfirm: { en: 'Delete', fr: 'Supprimer' } as T,
    hardDeleteTitle: { en: 'Permanently delete order?', fr: 'Supprimer définitivement la commande ?' } as T,
    hardDeleteBody: {
      en: 'This permanently removes {code}, its tooth instructions, file records, and stored files. This cannot be undone.',
      fr: 'Cela supprime définitivement {code}, ses instructions par dent, les enregistrements de fichiers et les fichiers stockés. Cette action est irréversible.',
    } as T,

    // Mobile card
    mobileStage: { en: 'Stage', fr: 'Phase' } as T,
    mobileArch: { en: 'Arch', fr: 'Arcade' } as T,
    mobileDentist: { en: 'Dentist', fr: 'Praticien' } as T,
    notSet: { en: 'Not set', fr: 'Non défini' } as T,

    // Plan badge
    planPending: { en: 'Plan being prepared', fr: 'Plan en préparation' } as T,
    planAwaitingYours: { en: 'Awaiting your review', fr: 'En attente de votre validation' } as T,
    planAwaitingDoctor: { en: 'Awaiting doctor', fr: 'En attente du praticien' } as T,
    planApproved: { en: 'Plan approved', fr: 'Plan approuvé' } as T,
    planReplanning: { en: 'Replanning requested', fr: 'Replanification demandée' } as T,

    // Empty / error / loading
    loadingFailedTitle: { en: 'Orders could not load', fr: 'Impossible de charger les commandes' } as T,
    tryAgain: { en: 'Try again', fr: 'Réessayer' } as T,
    emptyTrashTitle: { en: 'Trash is empty', fr: 'La corbeille est vide' } as T,
    emptyOrdersTitle: { en: 'No orders found', fr: 'Aucune commande trouvée' } as T,
    emptyTrashBody: {
      en: 'There are no soft-deleted orders to review. Newly deleted orders will show up here.',
      fr: 'Aucune commande supprimée à afficher. Les commandes nouvellement supprimées apparaîtront ici.',
    } as T,
    emptyFilteredBody: {
      en: 'No orders match the current filters. Try widening the search or clearing filters.',
      fr: 'Aucune commande ne correspond aux filtres actuels. Essayez d’élargir la recherche ou d’effacer les filtres.',
    } as T,
    emptyNoneBody: {
      en: 'Create a new order to get started.',
      fr: 'Créez une nouvelle commande pour commencer.',
    } as T,

    // Pagination
    pagSummary: {
      en: '{from}–{to} of {total} orders',
      fr: '{from}–{to} sur {total} commandes',
    } as T,
    pagRowsPerPage: { en: 'Rows per page', fr: 'Lignes par page' } as T,
    pagPrevious: { en: 'Previous', fr: 'Précédent' } as T,
    pagNext: { en: 'Next', fr: 'Suivant' } as T,
    pagPageOf: {
      en: 'Page {page} of {total}',
      fr: 'Page {page} sur {total}',
    } as T,

    // Status picker (single + bulk, used inline + via dialog)
    statusPickerTitle: {
      en: 'Change status of {code}',
      fr: 'Changer le statut de {code}',
    } as T,
    statusPickerBody: {
      en: 'Admins can move orders to any lifecycle status. Choose the target phase below — related side-tables (treatment plan, quotation) are NOT modified.',
      fr: 'Les administrateurs peuvent placer la commande à n’importe quelle étape du cycle. Choisissez la phase cible ci-dessous — les tables liées (plan de traitement, devis) ne sont PAS modifiées.',
    } as T,
    targetStatus: { en: 'Target status', fr: 'Statut cible' } as T,
    selectStatus: { en: 'Select status', fr: 'Choisir un statut' } as T,
    applyStatus: { en: 'Apply status', fr: 'Appliquer le statut' } as T,

    // OrderStatusChangeDialog (admin override w/ reason)
    overrideDialogTitle: { en: 'Change order status', fr: 'Changer le statut de la commande' } as T,
    overrideDialogBody: {
      en: 'Admin override for {code}. Use this to roll the order forward past a stuck step or roll backward to fix a mistake. Treatment plan and quotation artefacts are kept — only the status changes.',
      fr: 'Modification administrateur pour {code}. Utilisez-la pour faire avancer la commande au-delà d’une étape bloquée ou pour revenir en arrière en cas d’erreur. Le plan de traitement et le devis sont conservés — seul le statut change.',
    } as T,
    currently: { en: 'Currently', fr: 'Actuellement' } as T,
    willBecome: { en: 'Will become', fr: 'Deviendra' } as T,
    newStatus: { en: 'New status', fr: 'Nouveau statut' } as T,
    reasonLabel: { en: 'Reason', fr: 'Raison' } as T,
    reasonOptional: { en: '(optional, logged)', fr: '(facultatif, consigné)' } as T,
    reasonPh: {
      en: 'e.g. doctor confirmed payment over the phone — rolling to paid',
      fr: 'p. ex. le praticien a confirmé le paiement par téléphone — passage à payée',
    } as T,
    applyChange: { en: 'Apply change', fr: 'Appliquer le changement' } as T,
    phaseSubmission: { en: 'Submission', fr: 'Soumission' } as T,
    phasePlanning: { en: 'Treatment planning', fr: 'Planification' } as T,
    phaseBilling: { en: 'Quote & payment', fr: 'Devis & paiement' } as T,
    phaseProduction: { en: 'Production', fr: 'Production' } as T,
    phaseTerminal: { en: 'Terminal', fr: 'Final' } as T,
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

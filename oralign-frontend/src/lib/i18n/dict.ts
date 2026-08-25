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
// Language the dashboard renders before anything better is known: the
// SSR/first-paint value, and the fallback when a user has no stored
// choice. A signed-in user's `preferredLanguage` still wins once the
// auth provider seeds it.
export const DEFAULT_LANG: Lang = 'en';

type T = Record<Lang, string>;

// Domain dictionaries authored in their own files (one per translation
// work package) and spread into the main object below — same shape,
// just split so several namespaces could be written in parallel
// without touching this file.
import { chromeDomainDict } from './dict.chrome-domain';
import { commerceDomainDict } from './dict.commerce-domain';
import { authDomainDict } from './dict.auth-domain';
import { treatmentDomainDict } from './dict.treatment-domain';
import { blogDomainDict } from './dict.blog-domain';

export const dict = {
  ...chromeDomainDict,
  ...commerceDomainDict,
  ...authDomainDict,
  ...treatmentDomainDict,
  ...blogDomainDict,

  // ─── Generic / cross-cutting ────────────────────────────────────
  common: {
    save: { en: 'Save', fr: 'Enregistrer' } as T,
    // Shared strong confirmation for irreversible deletion (PermanentDeleteDialog)
    permanentDelete: {
      irreversible: {
        en: 'This action cannot be undone. If historical records (orders, quotations, payments, treatment plans) depend on this item, the server will refuse and nothing will be deleted.',
        fr: 'Cette action est irréversible. Si des données historiques (commandes, devis, paiements, plans de traitement) en dépendent, le serveur refusera et rien ne sera supprimé.',
      } as T,
      typeToConfirm: { en: 'Type {word} to confirm', fr: 'Saisissez {word} pour confirmer' } as T,
      confirm: { en: 'Delete forever', fr: 'Supprimer définitivement' } as T,
      working: { en: 'Deleting…', fr: 'Suppression…' } as T,
      blockedTitle: { en: 'Deletion blocked', fr: 'Suppression bloquée' } as T,
    },
    restore: { en: 'Restore', fr: 'Restaurer' } as T,
    showDeleted: { en: 'Show deleted', fr: 'Afficher les éléments supprimés' } as T,
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
      condTmjDislocation: {
        en: 'TMJ disorder',
        fr: 'Troubles de l’articulation temporo-mandibulaire (ATM)',
      } as T,
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
      pickerPlaceholder: {
        en: 'Search by name or phone…',
        fr: 'Rechercher par nom ou téléphone…',
      } as T,
      pickerEmpty: {
        en: 'No patient matches your search.',
        fr: 'Aucun patient ne correspond à votre recherche.',
      } as T,
      pickerLoading: {
        en: 'Loading patients…',
        fr: 'Chargement des patients…',
      } as T,
      pickerChange: { en: 'Change', fr: 'Changer' } as T,
      pickerSelected: { en: 'Selected patient', fr: 'Patient sélectionné' } as T,
      pickerResults: {
        en: '{count} result{s}',
        fr: '{count} résultat(s)',
      } as T,
      // Admin practitioner search picker (reuses pickerChange/pickerResults).
      doctorPickerLabel: { en: 'Pick a practitioner', fr: 'Choisir un praticien' } as T,
      doctorPickerPlaceholder: {
        en: 'Search by name, email or phone…',
        fr: 'Rechercher par nom, e-mail ou téléphone…',
      } as T,
      doctorPickerEmpty: {
        en: 'No practitioner matches your search.',
        fr: 'Aucun praticien ne correspond à votre recherche.',
      } as T,
      doctorPickerLoading: {
        en: 'Loading practitioners…',
        fr: 'Chargement des praticiens…',
      } as T,
      doctorPickerSelected: {
        en: 'Selected practitioner',
        fr: 'Praticien sélectionné',
      } as T,

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
      // Display label only — the stored enum value stays PatientStage.REFINEMENT
      // ('refinement'); the clinic simply calls this phase "Finition"/"Finishing".
      stageRefinement: { en: 'Finishing', fr: 'Finition' } as T,
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
      cbctRequestedHint: {
        en: 'Turn on to attach a CBCT / DICOM bundle (ZIP) for this order.',
        fr: 'Activez pour joindre un volume CBCT / DICOM (ZIP) à cette commande.',
      } as T,
      cbctSupplementNote: {
        en: 'CBCT supplement: {price} — added to the order total.',
        fr: 'Supplément CBCT : {price} — ajouté au total de la commande.',
      } as T,
      stagedLeaveTitle: {
        en: 'Files not uploaded yet',
        fr: 'Fichiers pas encore téléversés',
      } as T,
      stagedLeaveDesc: {
        en: 'You picked {count} file(s) but have not uploaded them. Leaving this step discards them — nothing is sent to the lab.',
        fr: 'Vous avez sélectionné {count} fichier(s) sans les téléverser. Quitter cette étape les abandonne — rien ne part vers le laboratoire.',
      } as T,
      stagedLeaveStay: {
        en: 'Stay and upload',
        fr: 'Rester et téléverser',
      } as T,
      stagedLeaveDiscard: {
        en: 'Discard the files',
        fr: 'Abandonner les fichiers',
      } as T,

      // ── Section headers shown by ClinicalOrderFiles ──────────────
      // The order wizard renders three sub-sections that each have
      // their own intro: patient images (8 slots), radiography (2
      // slots + bulk drop-zone), and STL impressions (4 slots).
      sections: {
        patientImagesTitle: { en: 'Patient images', fr: 'Photos du patient' } as T,
        patientImagesDesc: {
          en: 'Upload each facial and intraoral view. The faint reference shows the expected angle — rotate or flip your photo to match before it uploads.',
          fr: 'Téléversez chaque vue, du sourire à l’intra-oral. La photo de référence indique l’angle attendu — pivotez ou retournez votre image avant le téléversement.',
        } as T,
        radiographyTitle: { en: 'Radiography images', fr: 'Imagerie médicale' } as T,
        radiographyDesc: {
          en: 'Include panoramic and profile radiography files to support the diagnosis.',
          fr: 'Joignez la panoramique et la téléradiographie de profil pour appuyer le diagnostic.',
        } as T,
        stlTitle: { en: 'STL files', fr: 'Fichiers STL' } as T,
        stlDesc: {
          en: 'Upload upper, lower, and occlusion scan files. STL, PLY, and OBJ are supported — up to 1 GB per scan.',
          fr: 'Téléversez les empreintes supérieure, inférieure et d’occlusion. STL, PLY et OBJ acceptés — jusqu’à 1 Go par scan.',
        } as T,
      },

      // ── Individual slot titles ───────────────────────────────────
      // Tunisian-French dental terminology for each photo slot.
      // "Vue" / "Photo" picked per what reads naturally on a card.
      slots: {
        profilePhoto: { en: 'Profile photo', fr: 'Photo de profil' } as T,
        faceRest: { en: 'Face at rest photo', fr: 'Photo du visage au repos' } as T,
        smile: { en: 'Smile photo', fr: 'Photo du sourire' } as T,
        leftLateral: { en: 'Right lateral view', fr: 'Vue latérale droite' } as T,
        frontalOcclusion: { en: 'Frontal occlusion view', fr: 'Vue frontale en occlusion' } as T,
        rightLateral: { en: 'Left lateral view', fr: 'Vue latérale gauche' } as T,
        upperOcclusal: { en: 'Upper occlusal view', fr: 'Vue occlusale supérieure' } as T,
        lowerOcclusal: { en: 'Lower occlusal view', fr: 'Vue occlusale inférieure' } as T,
        panoramic: { en: 'Panoramic radiography', fr: 'Radiographie panoramique' } as T,
        profileTele: { en: 'Profile teleradiography', fr: 'Téléradiographie de profil' } as T,
        upperStl: { en: 'Add Upper STL impression', fr: 'Ajouter empreinte STL supérieure' } as T,
        lowerStl: { en: 'Add Lower STL impression', fr: 'Ajouter empreinte STL inférieure' } as T,
        firstOcclusion: { en: 'Add First occlusion STL', fr: 'Ajouter STL première occlusion' } as T,
        secondOcclusion: { en: 'Add Second occlusion STL', fr: 'Ajouter STL seconde occlusion' } as T,
      },

      // ── Odontogram-selector strings ──────────────────────────────
      // Rendered above the FDI tooth grid in the order wizard +
      // treatment-plan review. Three modes drive different copy:
      //   • attachments   — admin Attachments & IPR panel
      //   • treatment     — planner-side tooth instructions
      //   • selector      — generic doctor-side picker (the default)
      tooth: {
        selectorTitle: {
          en: 'Select tooth-level instructions',
          fr: 'Choisir des instructions par dent',
        } as T,
        selectorHint: {
          en: 'Tap any tooth to assign a color. Each tooth carries one instruction at a time.',
          fr: 'Touchez une dent pour lui attribuer une couleur. Chaque dent porte une seule instruction à la fois.',
        } as T,
        attachmentsTitle: {
          en: 'Attachments & IPR',
          fr: 'Taquets & IPR',
        } as T,
        attachmentsHint: {
          en: 'Tap a tooth to mark an attachment. Tap between teeth to set IPR (mm) and the optional STEP value.',
          fr: 'Touchez une dent pour ajouter un taquet. Touchez entre les dents pour définir l’IPR (mm) et la valeur STEP éventuelle.',
        } as T,
        treatmentTitle: {
          en: 'Treatment odontogram',
          fr: 'Odontogramme de traitement',
        } as T,
        treatmentHint: {
          en: 'Tap a tooth to choose a clinical instruction color. Tap between teeth to set IPR in millimetres and STEP values.',
          fr: 'Touchez une dent pour choisir une couleur d’instruction clinique. Touchez entre les dents pour définir l’IPR en millimètres et les valeurs STEP.',
        } as T,
        hideGuide: { en: 'Hide color guide', fr: 'Masquer la légende' } as T,
        viewGuide: { en: 'View color guide', fr: 'Afficher la légende' } as T,
        fdiHint: {
          en: 'FDI numbering · Press {esc} to close the picker.',
          fr: 'Numérotation FDI · Appuyez sur {esc} pour fermer le sélecteur.',
        } as T,
        toothBadge: { en: 'Tooth {n}', fr: 'Dent {n}' } as T,
        emptyState: {
          en: 'No tooth-level instructions selected yet.',
          fr: 'Aucune instruction par dent sélectionnée pour le moment.',
        } as T,
        extractExclusive: {
          en: 'This tooth is marked for extraction. Remove the extraction before adding another instruction.',
          fr: 'Cette dent est marquée comme extraction. Retirez l’extraction avant d’ajouter une autre instruction.',
        } as T,
        loadingChart: {
          en: 'Loading the dental chart…',
          fr: 'Chargement du schéma dentaire…',
        } as T,
        saving: { en: 'Saving…', fr: 'Enregistrement…' } as T,
      },

      // ── Image-edit dialog (crop / rotate / flip) ────────────────
      // Rendered the moment the doctor picks a photo from their OS
      // file dialog. Every label needs FR; "Adjust …" uses an
      // interpolated slot title so the verb matches the noun.
      imageEdit: {
        title: {
          en: 'Adjust {slot}',
          fr: 'Ajuster {slot}',
        } as T,
        subtitle: {
          en: 'Crop, rotate or flip the photo before it uploads. Changes are applied to the saved file.',
          fr: 'Recadrez, faites pivoter ou retournez la photo avant le téléversement. Les changements sont enregistrés dans le fichier final.',
        } as T,
        cancel: { en: 'Cancel', fr: 'Annuler' } as T,
        reference: { en: 'Reference', fr: 'Référence' } as T,
        referenceHint: {
          en: "Match the patient's view to this orientation.",
          fr: 'Faites correspondre la vue du patient à cette orientation.',
        } as T,
        noReference: { en: 'No reference', fr: 'Pas de référence' } as T,
        crop: { en: 'Crop', fr: 'Recadrer' } as T,
        applyCrop: { en: 'Apply crop', fr: 'Appliquer le recadrage' } as T,
        cancelCrop: { en: 'Cancel crop', fr: 'Annuler le recadrage' } as T,
        rotateLeft: { en: 'Rotate left', fr: 'Tourner à gauche' } as T,
        rotateRight: { en: 'Rotate right', fr: 'Tourner à droite' } as T,
        flipHorizontal: { en: 'Flip H', fr: 'Miroir H' } as T,
        flipVertical: { en: 'Flip V', fr: 'Miroir V' } as T,
        reset: { en: 'Reset', fr: 'Réinitialiser' } as T,
        useImage: { en: 'Use this image', fr: 'Utiliser cette image' } as T,
        zoomIn: { en: 'Zoom in', fr: 'Zoom avant' } as T,
        zoomOut: { en: 'Zoom out', fr: 'Zoom arrière' } as T,
        zoomLabel: { en: 'Zoom', fr: 'Zoom' } as T,
        cropHint: {
          en: 'Drag to draw or move the rectangle, drag the corners to resize. Use the zoom slider above for precision on small details — the editor scrolls when zoomed in.',
          fr: 'Glissez pour tracer ou déplacer le rectangle, attrapez les coins pour le redimensionner. Utilisez le curseur de zoom pour plus de précision — l’éditeur défile une fois zoomé.',
        } as T,
        errorNotReady: {
          en: 'Image not ready yet.',
          fr: 'Image pas encore prête.',
        } as T,
        errorPickRegion: {
          en: 'Pick a crop region first (drag on the image).',
          fr: 'Sélectionnez d’abord une zone à recadrer (glissez sur l’image).',
        } as T,
        errorApplyCrop: {
          en: 'Could not apply crop.',
          fr: 'Impossible d’appliquer le recadrage.',
        } as T,
        errorSaveEdits: {
          en: 'Could not save image edits.',
          fr: 'Impossible d’enregistrer les modifications.',
        } as T,
      },
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
      openBiteAsk: {
        en: 'Is there an open bite to manage?',
        fr: 'Y a-t-il une béance à prendre en charge ?',
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
        en: 'Choose how interproximal reduction should be considered.',
        fr: 'Indiquez comment envisager la réduction interproximale.',
      } as T,
      iprPriorityOpt: { en: 'As a priority', fr: 'En priorité' } as T,
      iprIfNecessaryOpt: { en: 'If necessary', fr: 'Si nécessaire' } as T,
      iprNoneOpt: { en: 'No IPR', fr: 'Pas d’IPR' } as T,

      biteRampsHint: {
        en: 'Where should the planner place bite ramps, if any?',
        fr: 'Où le planificateur doit-il placer des plans de morsure, si nécessaire ?',
      } as T,
      // Bite-plane placement options. Labels only — the STORED values stay
      // the stable English keys (Occlusal stop / Incisors / Molars / Canines)
      // so existing saved orders keep working; only the displayed FR/EN text
      // is remapped to the clinic's four bite-plane locations.
      biteRampsOcclusalStop: {
        en: 'Occlusal molar stop',
        fr: 'Cale molaire occlusale',
      } as T,
      biteRampsIncisors: {
        en: 'Maxillary retro-incisor 12 to 22',
        fr: 'Rétro-incisive maxillaire de 12 à 22',
      } as T,
      biteRampsMolars: {
        en: 'Maxillary retro-incisor 11 to 21',
        fr: 'Rétro-incisive maxillaire de 11 à 21',
      } as T,
      biteRampsCanines: {
        en: 'Palatal surface of the upper canine',
        fr: 'Face palatine de la canine supérieure',
      } as T,

      expansionHint: {
        en: 'Select the segment that needs expansion, or “No expansion” if the arches are well-developed.',
        fr: 'Sélectionnez le segment à expandre, ou « Pas d’expansion » si les arcades sont déjà bien développées.',
      } as T,
      expansionNoneOpt: { en: 'No expansion', fr: 'Pas d’expansion' } as T,
      expansionPriorityOpt: { en: 'As a priority', fr: 'En priorité' } as T,
      expansionIfNecessaryOpt: { en: 'If necessary', fr: 'Si nécessaire' } as T,

      crossbiteAsk: {
        en: 'Is there a crossbite to manage?',
        fr: 'Y a-t-il un articulé inversé à prendre en charge ?',
      } as T,
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
      wizardStepsAria: { en: 'Order wizard steps', fr: 'Étapes de l’assistant de commande' } as T,
      addInstructionsPh: {
        en: 'Add special clinical or lab instructions...',
        fr: 'Ajoutez des instructions cliniques ou de laboratoire…',
      } as T,
      caseNotesPh: {
        en: 'Add final case notes...',
        fr: 'Ajoutez des notes finales sur le cas…',
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
      // Price summary shown on the review step when CBCT is a paid option.
      priceBase: { en: 'Treatment fee', fr: 'Honoraires de traitement' } as T,
      priceCbct: { en: 'CBCT supplement', fr: 'Supplément CBCT' } as T,
      priceTotal: { en: 'Total', fr: 'Total' } as T,
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

    // ── General Terms & Conditions (required before submit) ───────
    terms: {
      prefix: { en: 'I have read and accept the', fr: 'J’ai lu et j’accepte les' } as T,
      link: {
        en: 'General Terms & Conditions',
        fr: 'Conditions générales de vente et d’utilisation',
      } as T,
      suffix: { en: '.', fr: '.' } as T,
    },

    // Final self-verification the doctor must confirm before submitting.
    reviewConfirm: {
      en: 'I have reviewed all the information, files and images attached to my order. I confirm that they are complete, correct and compliant before submitting the order.',
      fr: 'J’ai vérifié l’ensemble des informations, fichiers et images joints à ma commande. Je confirme qu’ils sont complets, corrects et conformes avant la soumission de la commande.',
    } as T,

    // ── Paid-order lock notice ────────────────────────────────────
    paidLock: {
      banner: {
        en: 'This order has been paid and can no longer be edited. Contact an administrator if a change is needed.',
        fr: 'Cette commande a été payée et ne peut plus être modifiée. Contactez un administrateur si une modification est nécessaire.',
      } as T,
    },

    // ── Validation / errors ──────────────────────────────────────
    errors: {
      patientStageRequired: { en: 'Patient stage is required.', fr: 'La phase du patient est obligatoire.' } as T,
      patientRequired: { en: 'Please pick or create a patient first.', fr: 'Veuillez choisir ou créer un patient.' } as T,
      chiefComplaintRequired: { en: 'Please describe the chief complaint.', fr: 'Veuillez décrire le motif de consultation.' } as T,
      archRequired: { en: 'Pick at least one arch to treat.', fr: 'Choisissez au moins une arcade à traiter.' } as T,
      cbctFilesRequired: {
        en: 'Upload the CBCT volume, or turn the CBCT option off.',
        fr: 'Téléversez le volume CBCT, ou désactivez l’option CBCT.',
      } as T,
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

    // Admin / designer bulk export — one ZIP of every order file + data
    // Fiche de commande seule (PDF) — visible aussi par le dentiste.
    sheet: {
      label: { en: 'Order sheet (PDF)', fr: 'Fiche commande (PDF)' } as T,
      preparing: { en: 'Generating the sheet…', fr: 'Génération de la fiche…' } as T,
      success: { en: 'Order sheet downloaded', fr: 'Fiche commande téléchargée' } as T,
      error: {
        en: 'Could not generate the order sheet.',
        fr: 'Impossible de générer la fiche commande.',
      } as T,
    },
    downloadAll: {
      label: { en: 'Download all (ZIP)', fr: 'Tout télécharger (ZIP)' } as T,
      preparing: {
        en: 'Preparing archive…',
        fr: 'Préparation de l’archive…',
      } as T,
      // Shown once bytes start arriving. The archive is streamed with no
      // Content-Length, so we report what has been received rather than
      // an invented percentage.
      downloading: {
        en: 'Downloading archive… {size}',
        fr: 'Téléchargement de l’archive… {size}',
      } as T,
      success: {
        en: 'Archive downloaded',
        fr: 'Archive téléchargée',
      } as T,
      error: {
        en: 'Could not download the archive',
        fr: 'Échec du téléchargement de l’archive',
      } as T,
    },

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
      other: { en: 'DICOM', fr: 'DICOM' } as T,
      dicom: { en: 'DICOM', fr: 'DICOM' } as T,
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
      cbctSupplement: { en: 'CBCT supplement', fr: 'Supplément CBCT' } as T,
      cbctFiles: { en: 'CBCT files', fr: 'Fichiers CBCT' } as T,
      cbctStatus: {
        awaiting: { en: 'Awaiting upload', fr: 'En attente d’envoi' } as T,
        processing: { en: 'Processing', fr: 'Traitement en cours' } as T,
        failed: { en: 'Processing failed', fr: 'Échec du traitement' } as T,
        uploaded: { en: 'Uploaded', fr: 'Téléversés' } as T,
      },
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
      submittedOrders: { en: 'Submitted orders', fr: 'Commandes soumises' } as T,
      submittedHint: {
        en: 'Ready for review or already under review.',
        fr: 'Prêtes à être vérifiées ou déjà en revue.',
      } as T,
      treatmentOrders: { en: 'In treatment planning', fr: 'En planification' } as T,
      treatmentHint: {
        en: 'Cases currently in clinical planning.',
        fr: 'Cas en cours de planification clinique.',
      } as T,
      completedOrders: { en: 'Completed orders', fr: 'Commandes terminées' } as T,
      completedHint: {
        en: 'Finished cases delivered to patients.',
        fr: 'Cas finalisés et livrés aux patients.',
      } as T,
      availableCredits: { en: 'Available credits', fr: 'Crédits disponibles' } as T,
      creditsUnlimited: { en: 'Unlimited', fr: 'Illimité' } as T,
      noActivePack: { en: 'No active pack', fr: 'Aucun forfait actif' } as T,
      creditsRemainingDays: {
        en: '{count} day(s) remaining',
        fr: '{count} jour(s) restant(s)',
      } as T,
      viewPacks: {
        en: 'Open the packs page to review available options.',
        fr: 'Ouvrez la page Forfaits pour consulter les options.',
      } as T,
    },

    // Latest-orders section on the doctor dashboard.
    orders: {
      eyebrow: { en: 'Latest activity', fr: 'Activité récente' } as T,
      title: { en: 'Your orders', fr: 'Vos commandes' } as T,
      subtitle: {
        en: 'Newest updates first. Search, filter, and open the right workflow directly.',
        fr: 'Dernières mises à jour en premier. Recherchez, filtrez et ouvrez directement le bon workflow.',
      } as T,
      newOrder: { en: 'New order', fr: 'Nouvelle commande' } as T,
      searchPlaceholder: {
        en: 'Search order, patient, phone…',
        fr: 'Rechercher commande, patient, téléphone…',
      } as T,
      filterLabel: { en: 'Filter orders', fr: 'Filtrer les commandes' } as T,
      sortLabel: { en: 'Sort orders', fr: 'Trier les commandes' } as T,
      statusTabsAria: { en: 'Filter orders by status', fr: 'Filtrer les commandes par statut' } as T,
      clearFilters: { en: 'Clear filters', fr: 'Effacer les filtres' } as T,
      clearSearch: { en: 'Clear search', fr: 'Effacer la recherche' } as T,
      filters: {
        all: { en: 'All orders', fr: 'Toutes' } as T,
        submitted: { en: 'Submitted', fr: 'Soumises' } as T,
        treatment: { en: 'Treatment', fr: 'Traitement' } as T,
        payment: { en: 'Payment', fr: 'Paiement' } as T,
        production: { en: 'Production', fr: 'Production' } as T,
        completed: { en: 'Completed', fr: 'Terminées' } as T,
      },
      sort: {
        updatedDesc: { en: 'Last updated', fr: 'Mise à jour' } as T,
        createdDesc: { en: 'Newest created', fr: 'Création récente' } as T,
        codeAsc: { en: 'Order code A-Z', fr: 'Code commande A-Z' } as T,
      },
      errorTitle: { en: 'Orders could not load', fr: 'Impossible de charger les commandes' } as T,
      errorDescription: {
        en: 'Please refresh or check your connection.',
        fr: 'Actualisez ou vérifiez votre connexion.',
      } as T,
      emptyTitle: { en: 'No orders found', fr: 'Aucune commande trouvée' } as T,
      emptyDescription: {
        en: 'Try another filter or create the first order for this view.',
        fr: 'Essayez un autre filtre ou créez la première commande pour cette vue.',
      } as T,
      colOrder: { en: 'Order', fr: 'Commande' } as T,
      colPatient: { en: 'Patient', fr: 'Patient' } as T,
      colCaseId: { en: 'Case ID', fr: 'ID du cas' } as T,
      colPractice: { en: 'Practice', fr: 'Cabinet' } as T,
      colDoctor: { en: 'Doctor', fr: 'Praticien' } as T,
      colSubmitTime: { en: 'Submit time', fr: 'Date de soumission' } as T,
      colUpdateTime: { en: 'Update time', fr: 'Date de mise à jour' } as T,
      colCaseStatus: { en: 'Case status', fr: 'Statut du cas' } as T,
      colReviewStatus: { en: 'Review status', fr: 'Statut de revue' } as T,
      colOperation: { en: 'Operation', fr: 'Opérations' } as T,
      colStatus: { en: 'Status', fr: 'Statut' } as T,
      colLastUpdated: { en: 'Last updated', fr: 'Dernière mise à jour' } as T,
      colOpen: { en: 'Open', fr: 'Ouvrir' } as T,
      open: { en: 'Open', fr: 'Ouvrir' } as T,
      contact: { en: 'Contact', fr: 'Contact' } as T,
      openAria: {
        en: 'Open order {code}',
        fr: 'Ouvrir la commande {code}',
      } as T,
      created: { en: 'Created {date}', fr: 'Créée le {date}' } as T,
      noPatient: { en: 'No patient selected', fr: 'Aucun patient sélectionné' } as T,
      noContact: { en: 'No contact', fr: 'Aucun contact' } as T,
      patientAgeYr: { en: 'yr', fr: 'an' } as T,
      patientAgeYrs: { en: 'yrs', fr: 'ans' } as T,
      patientGenderMale: { en: 'Male', fr: 'Homme' } as T,
      patientGenderFemale: { en: 'Female', fr: 'Femme' } as T,
      patientGenderOther: { en: 'Other', fr: 'Autre' } as T,
      notSet: { en: 'Not set', fr: 'Non défini' } as T,
      editShort: { en: 'Edit', fr: 'Modifier' } as T,
      detailShort: { en: 'Detail', fr: 'Détail' } as T,
      paginationSummary: {
        en: '{total} order(s) · page {page} of {totalPages}',
        fr: '{total} commande(s) · page {page} sur {totalPages}',
      } as T,
      previous: { en: 'Previous', fr: 'Précédent' } as T,
      next: { en: 'Next', fr: 'Suivant' } as T,
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
    trash: { en: 'Trash', fr: 'Corbeille' } as T,
    activePatients: { en: 'Active patients', fr: 'Patients actifs' } as T,
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
    deletePermanently: { en: 'Delete permanently', fr: 'Supprimer définitivement' } as T,
    deletePermanentlyTitle: {
      en: 'Permanently delete patient?',
      fr: 'Supprimer définitivement le patient ?',
    } as T,
    deletePermanentlyBody: {
      en: 'This permanently removes {name} from the database. This cannot be undone. The patient must have no orders — delete their orders permanently first.',
      fr: 'Cela supprime définitivement {name} de la base de données. Action irréversible. Le patient ne doit avoir aucune commande — supprimez d’abord ses commandes définitivement.',
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
      profilePhotoLabel: { en: 'Profile photo', fr: 'Photo de profil' } as T,
      profilePhotoHint: {
        en: 'Add a clear face photo so the patient is easy to identify.',
        fr: 'Ajoutez une photo claire du visage pour identifier facilement le patient.',
      } as T,
      uploadProfilePhoto: { en: 'Add photo', fr: 'Ajouter une photo' } as T,
      changeProfilePhoto: { en: 'Change photo', fr: 'Changer la photo' } as T,
      profilePhotoEditorTitle: {
        en: 'Patient profile photo',
        fr: 'Photo de profil du patient',
      } as T,

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
    colCaseId: { en: 'Case ID', fr: 'ID du cas' } as T,
    colPractice: { en: 'Practice', fr: 'Cabinet' } as T,
    colDoctor: { en: 'Doctor', fr: 'Praticien' } as T,
    colSubmitTime: { en: 'Submit time', fr: 'Date de soumission' } as T,
    colUpdateTime: { en: 'Update time', fr: 'Date de mise à jour' } as T,
    colCaseStatus: { en: 'Case status', fr: 'Statut du cas' } as T,
    colReviewStatus: { en: 'Review status', fr: 'Statut de revue' } as T,
    colOperation: { en: 'Operation', fr: 'Opérations' } as T,
    colDentistCol: { en: 'Dentist', fr: 'Praticien' } as T,
    colClinical: { en: 'Clinical', fr: 'Clinique' } as T,
    colStatus: { en: 'Status', fr: 'Statut' } as T,
    colCreated: { en: 'Created', fr: 'Créée le' } as T,
    colActions: { en: 'Actions', fr: 'Actions' } as T,

    // Row details
    files: { en: '{count} file{s}', fr: '{count} fichier(s)' } as T,
    noPatient: { en: 'No patient', fr: 'Aucun patient' } as T,
    noContact: { en: 'No contact', fr: 'Aucun contact' } as T,
    patientAgeYr: { en: 'yr', fr: 'an' } as T,
    patientAgeYrs: { en: 'yrs', fr: 'ans' } as T,
    patientGenderMale: { en: 'Male', fr: 'Homme' } as T,
    patientGenderFemale: { en: 'Female', fr: 'Femme' } as T,
    patientGenderOther: { en: 'Other', fr: 'Autre' } as T,
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
    editShort: { en: 'Edit', fr: 'Modifier' } as T,
    detailShort: { en: 'Detail', fr: 'Détail' } as T,
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
    pagSummaryWithPage: {
      en: '{total} order(s) · page {page} of {totalPages}',
      fr: '{total} commande(s) · page {page} sur {totalPages}',
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

  // ─── ANCHOR · admin invoices ───────────────────────────────────
  // Poste de facturation admin (/dashboard/invoices). Les recus de
  // paiement gardent leurs propres cles dans le cluster payments.
  invoicesAdmin: {
    title: { en: 'Invoices', fr: 'Factures' } as T,
    intro: {
      en: 'Every invoice issued by the company — automatic receipts and manual invoices alike.',
      fr: 'Toutes les factures émises par la société — reçus automatiques et factures manuelles.',
    } as T,
    loading: { en: 'Loading invoices…', fr: 'Chargement des factures…' } as T,
    error: { en: 'Could not load invoices.', fr: 'Impossible de charger les factures.' } as T,
    empty: { en: 'No invoice yet.', fr: 'Aucune facture pour le moment.' } as T,
    emptyFiltered: { en: 'No invoice matches these filters.', fr: 'Aucune facture ne correspond à ces filtres.' } as T,

    colNumber: { en: 'Number', fr: 'Numéro' } as T,
    colClient: { en: 'Client', fr: 'Client' } as T,
    colDate: { en: 'Date', fr: 'Date' } as T,
    colOrder: { en: 'Order', fr: 'Commande' } as T,
    colStatus: { en: 'Status', fr: 'Statut' } as T,
    colHt: { en: 'Net', fr: 'HT' } as T,
    colTva: { en: 'VAT', fr: 'TVA' } as T,
    colTtc: { en: 'Total', fr: 'TTC' } as T,
    colActions: { en: 'Actions', fr: 'Actions' } as T,

    statusDraft: { en: 'Draft', fr: 'Brouillon' } as T,
    statusIssued: { en: 'Issued', fr: 'Émise' } as T,
    statusPaid: { en: 'Paid', fr: 'Payée' } as T,
    statusCancelled: { en: 'Cancelled', fr: 'Annulée' } as T,

    searchPlaceholder: { en: 'Number, client, order…', fr: 'Numéro, client, commande…' } as T,
    allStatuses: { en: 'All statuses', fr: 'Tous les statuts' } as T,
    from: { en: 'From', fr: 'Du' } as T,
    to: { en: 'To', fr: 'Au' } as T,
    thisMonth: { en: 'This month', fr: 'Ce mois-ci' } as T,
    lastMonth: { en: 'Last month', fr: 'Mois dernier' } as T,
    clearFilters: { en: 'Clear', fr: 'Réinitialiser' } as T,
    trash: { en: 'Archived', fr: 'Archivées' } as T,
    refresh: { en: 'Refresh', fr: 'Actualiser' } as T,

    periodTotal: { en: 'Filtered total', fr: 'Total du filtre' } as T,
    // KPI row + status tabs + source badges (redesign)
    tabAll: { en: 'All', fr: 'Toutes' } as T,
    kpiCount: { en: 'Invoices', fr: 'Factures' } as T,
    kpiHt: { en: 'Net total', fr: 'Total HT' } as T,
    kpiTva: { en: 'VAT', fr: 'TVA' } as T,
    kpiTtc: { en: 'Grand total', fr: 'Total TTC' } as T,
    kpiBillableHint: { en: 'excl. cancelled', fr: 'hors annulées' } as T,
    sourceAuto: { en: 'Auto', fr: 'Auto' } as T,
    sourceAutoTitle: {
      en: 'Generated automatically from a payment',
      fr: 'Générée automatiquement depuis un paiement',
    } as T,
    sourceManual: { en: 'Manual', fr: 'Manuelle' } as T,
    sourceManualTitle: {
      en: 'Created by hand from this desk',
      fr: 'Créée à la main depuis cette page',
    } as T,
    period: { en: 'Period', fr: 'Période' } as T,
    periodCount: { en: '{count} invoice(s)', fr: '{count} facture(s)' } as T,

    create: { en: 'New invoice', fr: 'Nouvelle facture' } as T,
    edit: { en: 'Edit', fr: 'Modifier' } as T,
    view: { en: 'View invoice', fr: 'Voir la facture' } as T,
    downloadPdf: { en: 'Download PDF', fr: 'Télécharger le PDF' } as T,
    archive: { en: 'Archive', fr: 'Archiver' } as T,
    restore: { en: 'Restore', fr: 'Restaurer' } as T,
    permanentDelete: { en: 'Delete permanently', fr: 'Supprimer définitivement' } as T,
    permanentTitle: { en: 'Delete this invoice permanently?', fr: 'Supprimer définitivement cette facture ?' } as T,
    permanentBody: {
      en: 'Only a draft can be erased. An invoice that was ever issued stays archived — a fiscal sequence may not have holes.',
      fr: 'Seul un brouillon peut être effacé. Une facture déjà émise reste archivée — une séquence fiscale ne peut pas avoir de trous.',
    } as T,
    selected: { en: '{count} selected', fr: '{count} sélectionnée(s)' } as T,
    exportCsv: { en: 'Export CSV (Excel)', fr: 'Exporter CSV (Excel)' } as T,
    exportZip: { en: 'Export PDFs (ZIP)', fr: 'Exporter les PDF (ZIP)' } as T,
    bulkArchive: { en: 'Archive selection', fr: 'Archiver la sélection' } as T,

    editorCreateTitle: { en: 'New invoice', fr: 'Nouvelle facture' } as T,
    editorEditTitle: { en: 'Invoice {number}', fr: 'Facture {number}' } as T,
    editorIntro: {
      en: 'Totals are always recomputed by the server from the lines below.',
      fr: 'Les totaux sont toujours recalculés par le serveur à partir des lignes ci-dessous.',
    } as T,
    clientSection: { en: 'Client', fr: 'Client' } as T,
    clientSearch: { en: 'Search an existing patient', fr: 'Rechercher un patient existant' } as T,
    clientSearchHint: {
      en: 'Type at least 2 characters. Pick a patient to prefill, or fill the fields by hand.',
      fr: 'Saisissez au moins 2 caractères. Choisissez un patient pour préremplir, ou remplissez les champs à la main.',
    } as T,
    clientSearching: { en: 'Searching…', fr: 'Recherche…' } as T,
    clientNoMatch: { en: 'No patient found — fill the client in by hand.', fr: 'Aucun patient trouvé — saisissez le client à la main.' } as T,
    clientClear: { en: 'Detach', fr: 'Détacher' } as T,
    ordersOf: { en: 'Orders of {name}', fr: 'Commandes de {name}' } as T,
    prefillFromOrder: { en: 'Prefill from this order', fr: 'Préremplir depuis cette commande' } as T,
    noOrders: { en: 'This patient has no order.', fr: 'Ce patient n’a aucune commande.' } as T,

    fieldClientName: { en: 'Name / company', fr: 'Nom / société' } as T,
    fieldEmail: { en: 'Email', fr: 'E-mail' } as T,
    fieldPhone: { en: 'Phone', fr: 'Téléphone' } as T,
    fieldAddress: { en: 'Address', fr: 'Adresse' } as T,
    fieldCity: { en: 'City', fr: 'Ville' } as T,
    fieldCountry: { en: 'Country', fr: 'Pays' } as T,
    fieldTaxId: { en: 'Tax number', fr: 'Matricule fiscal' } as T,
    fieldIssueDate: { en: 'Issue date', fr: 'Date d’émission' } as T,
    fieldDueDate: { en: 'Due date', fr: 'Date d’échéance' } as T,
    fieldNumber: { en: 'Invoice number', fr: 'Numéro de facture' } as T,
    fieldNumberHint: {
      en: 'Leave empty to take the next number in the FAC sequence.',
      fr: 'Laissez vide pour prendre le prochain numéro de la séquence FAC.',
    } as T,
    fieldStatus: { en: 'Status', fr: 'Statut' } as T,
    fieldLanguage: { en: 'PDF language', fr: 'Langue du PDF' } as T,
    fieldNotes: { en: 'Notes', fr: 'Notes' } as T,

    linesSection: { en: 'Lines', fr: 'Lignes' } as T,
    lineDescription: { en: 'Description', fr: 'Description' } as T,
    lineQuantity: { en: 'Qty', fr: 'Qté' } as T,
    lineUnitPrice: { en: 'Unit price', fr: 'Prix unitaire' } as T,
    lineTva: { en: 'VAT %', fr: 'TVA %' } as T,
    lineTotal: { en: 'Net', fr: 'HT' } as T,
    addLine: { en: 'Add a line', fr: 'Ajouter une ligne' } as T,
    removeLine: { en: 'Remove this line', fr: 'Supprimer cette ligne' } as T,
    noLines: { en: 'Add at least one line.', fr: 'Ajoutez au moins une ligne.' } as T,

    totalsSection: { en: 'Totals', fr: 'Totaux' } as T,
    fieldTvaRate: { en: 'VAT rate (%)', fr: 'Taux de TVA (%)' } as T,
    fieldDiscount: { en: 'Discount', fr: 'Remise' } as T,
    fieldStampDuty: { en: 'Stamp duty', fr: 'Droit de timbre' } as T,
    previewHt: { en: 'Net', fr: 'Total HT' } as T,
    previewTva: { en: 'VAT', fr: 'TVA' } as T,
    previewTtc: { en: 'Total', fr: 'Total TTC' } as T,
    previewHint: {
      en: 'Preview — the server recomputes and stores the authoritative figures.',
      fr: 'Aperçu — le serveur recalcule et enregistre les montants faisant foi.',
    } as T,

    auditSection: { en: 'Change log', fr: 'Journal des modifications' } as T,
    auditEmpty: { en: 'No change recorded.', fr: 'Aucune modification enregistrée.' } as T,
    auditBy: { en: 'by {actor}', fr: 'par {actor}' } as T,

    cancel: { en: 'Cancel', fr: 'Annuler' } as T,
    save: { en: 'Save', fr: 'Enregistrer' } as T,
    saving: { en: 'Saving…', fr: 'Enregistrement…' } as T,

    toastCreated: { en: 'Invoice {number} created.', fr: 'Facture {number} créée.' } as T,
    toastUpdated: { en: 'Invoice updated.', fr: 'Facture mise à jour.' } as T,
    toastArchived: { en: 'Invoice archived.', fr: 'Facture archivée.' } as T,
    toastRestored: { en: 'Invoice restored.', fr: 'Facture restaurée.' } as T,
    toastPermanentlyDeleted: { en: 'Invoice permanently deleted.', fr: 'Facture supprimée définitivement.' } as T,
    toastBulkArchived: { en: '{count} invoice(s) archived.', fr: '{count} facture(s) archivée(s).' } as T,
    toastExported: { en: 'Export ready.', fr: 'Export prêt.' } as T,
  },

  // ─── ANCHOR · payments cluster ─────────────────────────────────
  // Reserved for the dedicated /dashboard/payments translation pass.
  // Agent inserts a `paymentsHistory`, `paymentsMine`, `paymentsPending`
  // and `paymentsInvoice` block here.

  // Shared payments vocabulary — used by every page in the
  // /dashboard/payments cluster so a doctor and an admin reading two
  // different surfaces always see the same label for the same enum.
  paymentsCommon: {
    // PaymentRecordStatus → human label. Mirrors orders.statusLabel
    // for the *order* lifecycle; these cover the *payment record*
    // lifecycle and intentionally stay distinct.
    status: {
      success: { en: 'Successful', fr: 'Succès' } as T,
      awaiting_confirmation: {
        en: 'Awaiting confirmation',
        fr: 'En attente de confirmation',
      } as T,
      pending: { en: 'Pending', fr: 'En attente' } as T,
      rejected: { en: 'Rejected', fr: 'Rejetée' } as T,
      failed: { en: 'Failed', fr: 'Échouée' } as T,
      cancelled: { en: 'Cancelled', fr: 'Annulée' } as T,
    },

    // PaymentMethod → human label.
    method: {
      card: { en: 'Card', fr: 'Carte' } as T,
      bank_transfer: { en: 'Bank transfer', fr: 'Virement bancaire' } as T,
      cash: { en: 'Cash', fr: 'Espèces' } as T,
      mock: { en: 'Test (mock)', fr: 'Test (mock)' } as T,
    },

    // Reused widgets / column titles
    columns: {
      date: { en: 'Date', fr: 'Date' } as T,
      doctorPatient: { en: 'Doctor · patient', fr: 'Praticien · patient' } as T,
      order: { en: 'Order', fr: 'Commande' } as T,
      method: { en: 'Method', fr: 'Mode' } as T,
      installment: { en: 'Installment', fr: 'Échéance' } as T,
      amount: { en: 'Amount', fr: 'Montant' } as T,
      status: { en: 'Status', fr: 'Statut' } as T,
      proof: { en: 'Proof', fr: 'Justificatif' } as T,
      actions: { en: 'Actions', fr: 'Actions' } as T,
      doctorSlashPatient: {
        en: 'Doctor / Patient',
        fr: 'Praticien / Patient',
      } as T,
    },

    // Shared action labels
    actions: {
      viewReceipt: {
        en: 'View the doctor-uploaded receipt',
        fr: 'Consulter le reçu téléversé par le praticien',
      } as T,
      view: { en: 'View', fr: 'Consulter' } as T,
      openQuote: { en: 'Open quote', fr: 'Ouvrir le devis' } as T,
      viewInvoice: { en: 'View invoice', fr: 'Voir la facture' } as T,
      previous: { en: 'Previous', fr: 'Précédent' } as T,
      next: { en: 'Next', fr: 'Suivant' } as T,
      refresh: { en: 'Refresh', fr: 'Actualiser' } as T,
    },

    // Empty / loading
    emptyDefault: { en: 'No payments yet.', fr: 'Aucun paiement pour le moment.' } as T,
    submittedShort: { en: 'Submitted {date}', fr: 'Soumis le {date}' } as T,
    invoiceNumberPh: { en: 'FAC-000123', fr: 'FAC-000123' } as T,
    invoiceNumberAria: {
      en: 'Invoice number',
      fr: 'Numéro de facture',
    } as T,
    saveInvoiceAria: {
      en: 'Save invoice number',
      fr: 'Enregistrer le numéro de facture',
    } as T,
    cancelAria: { en: 'Cancel', fr: 'Annuler' } as T,
    editInvoiceAria: {
      en: 'Edit invoice number',
      fr: 'Modifier le numéro de facture',
    } as T,
  },

  // /dashboard/payments/history — the full role-aware payment history
  // page. Used both by admins (sees every payment) and doctors (sees
  // their own).
  paymentsHistory: {
    title: { en: 'Payment history', fr: 'Historique des paiements' } as T,
    subtitleAdmin: {
      en: 'Every payment recorded by the platform — card, bank transfer and cash combined. Search, filter, and sort to find any record across the full history.',
      fr: 'Tous les paiements enregistrés par la plateforme — carte, virement bancaire et espèces réunis. Recherchez, filtrez et triez pour retrouver tout enregistrement dans l’historique complet.',
    } as T,
    subtitleDoctor: {
      en: 'Every payment recorded against your orders, newest first. Search by order code or amount, filter by method or status.',
      fr: 'Tous les paiements enregistrés sur vos commandes, du plus récent au plus ancien. Recherchez par code de commande ou par montant, filtrez par mode ou par statut.',
    } as T,

    searchPhAdmin: {
      en: 'Search order code, doctor, patient, or transaction…',
      fr: 'Rechercher un code de commande, un praticien, un patient ou une transaction…',
    } as T,
    searchPhDoctor: {
      en: 'Search order code or transaction…',
      fr: 'Rechercher un code de commande ou une transaction…',
    } as T,
    filters: { en: 'Filters', fr: 'Filtres' } as T,

    fromDate: { en: 'From date', fr: 'Date de début' } as T,
    toDate: { en: 'To date', fr: 'Date de fin' } as T,
    doctor: { en: 'Doctor', fr: 'Praticien' } as T,
    clearFilters: { en: 'Clear filters', fr: 'Effacer les filtres' } as T,
    methodsCount: {
      en: 'Methods ({count} selected)',
      fr: 'Modes ({count} sélectionné(s))',
    } as T,
    statusCount: {
      en: 'Status ({count} selected)',
      fr: 'Statut ({count} sélectionné(s))',
    } as T,

    active: { en: 'Active:', fr: 'Actifs :' } as T,
    chipSearch: { en: 'Search: "{value}"', fr: 'Recherche : « {value} »' } as T,
    chipMethodsOne: { en: '1 method', fr: '1 mode' } as T,
    chipMethodsMany: { en: '{count} methods', fr: '{count} modes' } as T,
    chipStatusOne: { en: '1 status', fr: '1 statut' } as T,
    chipStatusMany: { en: '{count} statuses', fr: '{count} statuts' } as T,
    chipDoctor: { en: 'Doctor: {name}', fr: 'Praticien : {name}' } as T,
    chipDoctorSelected: { en: 'Selected', fr: 'Sélectionné' } as T,
    chipFrom: { en: 'From {date}', fr: 'Depuis le {date}' } as T,
    chipTo: { en: 'To {date}', fr: 'Jusqu’au {date}' } as T,

    cardTitleAdmin: { en: 'Installment payments', fr: 'Paiements échelonnés' } as T,
    cardTitleDoctor: { en: 'My payments', fr: 'Mes paiements' } as T,
    countEntriesOne: { en: '1 entry', fr: '1 enregistrement' } as T,
    countEntriesMany: { en: '{count} entries', fr: '{count} enregistrements' } as T,
    sortedPrefix: { en: 'Sorted: {label}', fr: 'Trié : {label}' } as T,

    emptyNoMatch: {
      en: 'No payments match these filters.',
      fr: 'Aucun paiement ne correspond à ces filtres.',
    } as T,
    emptyAdmin: {
      en: 'No payments recorded yet.',
      fr: 'Aucun paiement enregistré pour le moment.',
    } as T,
    emptyDoctor: {
      en: 'You have not made any payments yet.',
      fr: 'Vous n’avez encore effectué aucun paiement.',
    } as T,

    errorTitle: { en: 'Could not load payments.', fr: 'Impossible de charger les paiements.' } as T,
    errorStaleBackendTitle: {
      en: 'Backend may need a rebuild.',
      fr: 'Le backend doit peut-être être reconstruit.',
    } as T,
    errorStaleBackendBody: {
      en: "A 400 here typically means the running backend container is an older build that doesn't recognise the new filter fields. Rebuild and restart it:",
      fr: 'Un code 400 ici signifie en général que le conteneur backend en cours d’exécution est une version plus ancienne qui ne reconnaît pas les nouveaux champs de filtre. Reconstruisez-le et redémarrez :',
    } as T,
    errorTryAgain: { en: 'Try again', fr: 'Réessayer' } as T,

    sortBy: { en: 'Sort by', fr: 'Trier par' } as T,
    sort: { en: 'Sort', fr: 'Trier' } as T,
    sortOptions: {
      'date-desc': { en: 'Newest first', fr: 'Plus récents d’abord' } as T,
      'date-asc': { en: 'Oldest first', fr: 'Plus anciens d’abord' } as T,
      'paid-desc': { en: 'Recently paid', fr: 'Récemment payés' } as T,
      'amount-desc': { en: 'Highest amount', fr: 'Montant le plus élevé' } as T,
      'amount-asc': { en: 'Lowest amount', fr: 'Montant le plus bas' } as T,
      'status-asc': { en: 'Status (A→Z)', fr: 'Statut (A→Z)' } as T,
    },

    rowsPerPage: { en: 'Rows per page', fr: 'Lignes par page' } as T,
    paginationRange: {
      en: '{from}–{to} of {total} payments',
      fr: '{from}–{to} sur {total} paiements',
    } as T,
    pageOf: { en: 'Page {page} of {total}', fr: 'Page {page} sur {total}' } as T,

    // Doctor search picker
    pickerSearchPh: { en: 'Search doctor name…', fr: 'Rechercher un praticien…' } as T,
    pickerClearAria: { en: 'Clear search', fr: 'Effacer la recherche' } as T,
    pickerClearDoctorAria: {
      en: 'Clear doctor filter',
      fr: 'Effacer le filtre praticien',
    } as T,
    pickerSearching: { en: 'Searching…', fr: 'Recherche en cours…' } as T,
    pickerNoMatch: {
      en: 'No doctors match "{value}".',
      fr: 'Aucun praticien ne correspond à « {value} ».',
    } as T,
    pickerNoneAvailable: { en: 'No doctors available.', fr: 'Aucun praticien disponible.' } as T,
    pickerShowingTop: {
      en: 'Showing top {count}. Type to narrow.',
      fr: 'Affichage des {count} premiers. Tapez pour affiner.',
    } as T,

    // Treatment-fee sections
    treatmentFeesTitleAdmin: {
      en: 'Treatment fee payments',
      fr: 'Paiements des honoraires de traitement',
    } as T,
    treatmentFeesTitleDoctor: {
      en: 'My treatment fee payments',
      fr: 'Mes paiements d’honoraires de traitement',
    } as T,
    treatmentFeesDescAdmin: {
      en: 'Every treatment-fee payment across the system — card, bank transfer, and cash. Separate from installment payments below.',
      fr: 'Tous les paiements d’honoraires de traitement de la plateforme — carte, virement bancaire et espèces. Distincts des paiements échelonnés ci-dessous.',
    } as T,
    treatmentFeesDescDoctor: {
      en: 'Treatment fees you have paid on your orders — card, bank transfer, and cash. Separate from installment payments below.',
      fr: 'Les honoraires de traitement que vous avez réglés sur vos commandes — carte, virement bancaire et espèces. Distincts des paiements échelonnés ci-dessous.',
    } as T,
    treatmentFeesTotalSuffix: { en: '{count} total', fr: '{count} au total' } as T,
    treatmentFeesEmpty: {
      en: 'No treatment-fee payments recorded yet.',
      fr: 'Aucun paiement d’honoraires de traitement enregistré pour le moment.',
    } as T,
    treatmentFeeInvoiceTitle: {
      en: 'View the treatment-fee invoice',
      fr: 'Voir la facture des honoraires de traitement',
    } as T,
    treatmentFeeInvoiceLabel: { en: 'Invoice', fr: 'Facture' } as T,
    openOrderTitle: { en: 'Open order', fr: 'Ouvrir la commande' } as T,
    openOrderLabel: { en: 'Order', fr: 'Commande' } as T,
  },

  // /dashboard/payments/mine — legacy route that permanent-redirects
  // to /dashboard/payments/history. Kept here for completeness so the
  // anchor reference stays valid; no UI strings to translate.
  paymentsMine: {
    // (intentional placeholder — `mine/page.tsx` only calls `redirect()`)
    placeholder: { en: '', fr: '' } as T,
  },

  // /dashboard/payments/pending — admin queue of payments awaiting
  // confirmation (bank transfers declared by doctors).
  paymentsPending: {
    title: {
      en: 'Pending payment confirmations',
      fr: 'Confirmations de paiement en attente',
    } as T,
    subtitle: {
      en: "Doctor-declared bank transfers awaiting verification — both the per-order treatment fee and individual installments. Confirming a payment runs the SUCCESS transition: for installments the linked step batch unlocks; for treatment fees the order's treatment plan unlocks.",
      fr: 'Virements bancaires déclarés par les praticiens en attente de vérification — qu’il s’agisse des honoraires de traitement ou des échéances. Confirmer un paiement déclenche la transition vers SUCCÈS : pour les échéances, le lot d’étapes lié se déverrouille ; pour les honoraires de traitement, le plan de traitement de la commande se déverrouille.',
    } as T,

    installmentsCardTitle: {
      en: 'Installment payments awaiting confirmation',
      fr: 'Paiements échelonnés en attente de confirmation',
    } as T,
    queueCountOne: { en: '1 payment in queue', fr: '1 paiement en file' } as T,
    queueCountMany: {
      en: '{count} payments in queue',
      fr: '{count} paiements en file',
    } as T,
    queueEmpty: {
      en: 'Nothing to confirm — queue is empty.',
      fr: 'Rien à confirmer — la file est vide.',
    } as T,

    confirm: { en: 'Confirm', fr: 'Confirmer' } as T,
    reject: { en: 'Reject', fr: 'Rejeter' } as T,

    confirmDialogTitle: {
      en: 'Confirm bank transfer',
      fr: 'Confirmer le virement bancaire',
    } as T,
    confirmDialogDesc: {
      en: 'The linked installment will be marked paid and the step batch will unlock. This action is logged with your user id.',
      fr: 'L’échéance correspondante sera marquée comme payée et le lot d’étapes sera déverrouillé. Cette action est consignée avec votre identifiant utilisateur.',
    } as T,
    notesLabel: { en: 'Notes (optional)', fr: 'Notes (facultatif)' } as T,
    notesPh: {
      en: 'e.g. matched on statement line 2026-05-22',
      fr: 'p. ex. ligne du relevé du 2026-05-22 rapprochée',
    } as T,
    cancel: { en: 'Cancel', fr: 'Annuler' } as T,
    confirmPayment: { en: 'Confirm payment', fr: 'Confirmer le paiement' } as T,

    rejectDialogTitle: {
      en: 'Reject bank transfer',
      fr: 'Rejeter le virement bancaire',
    } as T,
    rejectDialogDesc: {
      en: 'The payment will be marked rejected. The doctor can declare a fresh transfer afterwards; previous attempts stay in the audit trail.',
      fr: 'Le paiement sera marqué comme rejeté. Le praticien pourra déclarer un nouveau virement par la suite ; les tentatives précédentes restent dans la piste d’audit.',
    } as T,
    rejectReasonLabel: {
      en: 'Rejection reason *',
      fr: 'Motif du rejet *',
    } as T,
    rejectReasonPh: {
      en: 'Required — shown to the doctor.',
      fr: 'Obligatoire — communiqué au praticien.',
    } as T,
    rejectPayment: { en: 'Reject payment', fr: 'Rejeter le paiement' } as T,

    // Treatment-fee pending queue
    treatmentFeesPendingTitle: {
      en: 'Treatment fees awaiting confirmation',
      fr: 'Honoraires de traitement en attente de confirmation',
    } as T,
    treatmentFeesPendingDesc: {
      en: "Doctor-uploaded bank-transfer receipts for the order's professional fee. Open the receipt to review the proof and confirm in one place.",
      fr: 'Reçus de virement bancaire téléversés par le praticien pour les honoraires de la commande. Ouvrez le reçu pour vérifier la pièce justificative et confirmer en un seul endroit.',
    } as T,
    treatmentFeesPendingCount: {
      en: '{count} pending',
      fr: '{count} en attente',
    } as T,
    treatmentFeesPendingEmpty: {
      en: 'No treatment fees waiting for confirmation.',
      fr: 'Aucun honoraires de traitement en attente de confirmation.',
    } as T,
    reviewAndConfirm: {
      en: 'Review & confirm',
      fr: 'Vérifier & confirmer',
    } as T,
  },

  // /dashboard/payments/[paymentId]/invoice — bilingual receipt PDF
  // preview page.
  paymentsInvoice: {
    backToPayments: {
      en: 'Back to payments',
      fr: 'Retour aux paiements',
    } as T,
    title: { en: 'Invoice', fr: 'Facture' } as T,
    numberLabel: { en: 'No.', fr: 'N°' } as T,
    receiptPreview: {
      en: 'Payment receipt preview.',
      fr: 'Aperçu du reçu de paiement.',
    } as T,
    downloadPdf: { en: 'Download PDF', fr: 'Télécharger le PDF' } as T,
    loading: { en: 'Loading invoice…', fr: 'Chargement de la facture…' } as T,
    errorDefault: {
      en: 'Could not load the invoice PDF.',
      fr: 'Impossible de charger le PDF de la facture.',
    } as T,
    retry: { en: 'Retry', fr: 'Réessayer' } as T,
    previewTitle: { en: 'Invoice preview', fr: 'Aperçu de la facture' } as T,
  },

  // ─── ANCHOR · account cluster ──────────────────────────────────
  // Strings for the /account/* pages: home, profile, clinic,
  // billing-settings, settings — plus the company billing settings
  // form used by the /account/billing-settings page.

  // ── /account home ────────────────────────────────────────────────
  accountHome: {
    title: { en: 'Account', fr: 'Compte' } as T,
    subtitle: {
      en: 'Review your profile details and clinic information.',
      fr: 'Consultez vos informations personnelles et celles de votre cabinet.',
    } as T,
    unableToLoad: { en: 'Unable to load account', fr: 'Impossible de charger le compte' } as T,
    tryAgainLater: { en: 'Please try again later.', fr: 'Veuillez réessayer plus tard.' } as T,

    // AccountOverviewCard
    editProfile: { en: 'Edit Profile', fr: 'Modifier le profil' } as T,
    roleLabel: { en: 'Role', fr: 'Rôle' } as T,
    phoneLabel: { en: 'Phone', fr: 'Téléphone' } as T,
    statusLabel: { en: 'Status', fr: 'Statut' } as T,
    statusActive: { en: 'Active', fr: 'Actif' } as T,
    statusInactive: { en: 'Inactive', fr: 'Inactif' } as T,
    notProvided: { en: 'Not provided', fr: 'Non renseigné' } as T,
    roleAdmin: { en: 'Admin', fr: 'Administrateur' } as T,
    roleSuperAdmin: { en: 'Super Admin', fr: 'Super administrateur' } as T,
    roleDentist: { en: 'Dentist', fr: 'Praticien' } as T,
    roleDesigner: { en: 'Designer', fr: 'Designer' } as T,

    // ClinicOverviewCard
    clinicTitle: { en: 'Clinic', fr: 'Cabinet' } as T,
    clinicCompleteHint: {
      en: 'Complete your clinic profile in settings.',
      fr: 'Complétez le profil de votre cabinet dans les paramètres.',
    } as T,
    clinicInfoHint: {
      en: 'Your clinic information and availability.',
      fr: 'Les informations et la disponibilité de votre cabinet.',
    } as T,
    clinicNameLabel: { en: 'Clinic name', fr: 'Nom du cabinet' } as T,
    addressLabel: { en: 'Address', fr: 'Adresse' } as T,
    workingHoursLabel: { en: 'Working hours', fr: 'Horaires d’ouverture' } as T,

    // Account nav tabs
    tabProfile: { en: 'Profile', fr: 'Profil' } as T,
    tabClinic: { en: 'Clinic', fr: 'Cabinet' } as T,
    tabBilling: { en: 'Billing', fr: 'Facturation' } as T,

    // Working hours list (shared)
    workingHoursNotSet: { en: 'Not set', fr: 'Non défini' } as T,
    days: {
      monday: { en: 'Monday', fr: 'Lundi' } as T,
      tuesday: { en: 'Tuesday', fr: 'Mardi' } as T,
      wednesday: { en: 'Wednesday', fr: 'Mercredi' } as T,
      thursday: { en: 'Thursday', fr: 'Jeudi' } as T,
      friday: { en: 'Friday', fr: 'Vendredi' } as T,
      saturday: { en: 'Saturday', fr: 'Samedi' } as T,
      sunday: { en: 'Sunday', fr: 'Dimanche' } as T,
    },
    daysShort: {
      monday: { en: 'Mon', fr: 'Lun' } as T,
      tuesday: { en: 'Tue', fr: 'Mar' } as T,
      wednesday: { en: 'Wed', fr: 'Mer' } as T,
      thursday: { en: 'Thu', fr: 'Jeu' } as T,
      friday: { en: 'Fri', fr: 'Ven' } as T,
      saturday: { en: 'Sat', fr: 'Sam' } as T,
      sunday: { en: 'Sun', fr: 'Dim' } as T,
    },
    // Working hours editor
    dayOpen: { en: 'Open', fr: 'Ouvert' } as T,
    dayClosed: { en: 'Closed', fr: 'Fermé' } as T,
    dayOpens: { en: 'Opens', fr: 'Ouvre' } as T,
    dayCloses: { en: 'Closes', fr: 'Ferme' } as T,
    dayIsOpenAria: { en: '{day} is open', fr: '{day} est ouvert' } as T,
    dayIsClosedAria: { en: '{day} is closed', fr: '{day} est fermé' } as T,
  },

  // ── /account/profile ─────────────────────────────────────────────
  accountProfile: {
    title: { en: 'Profile', fr: 'Profil' } as T,
    subtitle: {
      en: 'Manage your personal profile details.',
      fr: 'Gérez les informations de votre profil personnel.',
    } as T,
    clinicSettings: { en: 'Clinic settings', fr: 'Paramètres du cabinet' } as T,
    onboardingCompleteTitle: { en: 'Complete your profile', fr: 'Complétez votre profil' } as T,
    onboardingConfirmTitle: { en: 'Confirm your profile', fr: 'Confirmez votre profil' } as T,
    onboardingConfirmBody: {
      en: 'Review your details and click "Save & Continue" to proceed.',
      fr: 'Vérifiez vos informations puis cliquez sur « Enregistrer et continuer » pour poursuivre.',
    } as T,
    onboardingCompleteBody: {
      en: 'Add your phone number and country to continue onboarding.',
      fr: 'Ajoutez votre numéro de téléphone et votre pays pour poursuivre l’intégration.',
    } as T,
    unableToLoad: { en: 'Unable to load profile', fr: 'Impossible de charger le profil' } as T,
    tryAgainLater: { en: 'Please try again later.', fr: 'Veuillez réessayer plus tard.' } as T,

    // Profile form (card)
    cardTitle: { en: 'Profile', fr: 'Profil' } as T,
    cardSubtitle: {
      en: 'Update your personal information and avatar.',
      fr: 'Mettez à jour vos informations personnelles et votre photo.',
    } as T,
    profilePhotoLabel: { en: 'Profile photo', fr: 'Photo de profil' } as T,
    profilePhotoHint: {
      en: 'Pick a square image (max 5 MB). It uploads as soon as you choose the file — no separate save step.',
      fr: 'Choisissez une image carrée (5 Mo max). L’envoi se fait dès la sélection — pas besoin d’étape d’enregistrement.',
    } as T,
    uploadAvatar: { en: 'Upload avatar', fr: 'Téléverser une photo' } as T,
    uploading: { en: 'Uploading…', fr: 'Envoi en cours…' } as T,
    fullNameLabel: { en: 'Full name', fr: 'Nom complet' } as T,
    emailLabel: { en: 'Email', fr: 'E-mail' } as T,
    emailManagedHint: {
      en: 'Email updates are managed by support.',
      fr: 'Les modifications d’e-mail sont gérées par le support.',
    } as T,
    phoneLabel: { en: 'Phone', fr: 'Téléphone' } as T,
    countryLabel: { en: 'Country (ISO code)', fr: 'Pays (code ISO)' } as T,
    saving: { en: 'Saving...', fr: 'Enregistrement…' } as T,
    saveChanges: { en: 'Save changes', fr: 'Enregistrer les modifications' } as T,
    saveAndContinue: { en: 'Save & Continue', fr: 'Enregistrer et continuer' } as T,

    // Toasts (user-facing)
    toastSelectImage: { en: 'Please select an image file.', fr: 'Veuillez sélectionner un fichier image.' } as T,
    toastAvatarTooLarge: { en: 'Avatar must be 5MB or smaller.', fr: 'La photo doit faire 5 Mo maximum.' } as T,
    toastAvatarUpdated: { en: 'Avatar updated.', fr: 'Photo mise à jour.' } as T,
    toastProfileUpdated: { en: 'Profile updated successfully.', fr: 'Modifications enregistrées.' } as T,

    // Security card (on /account/profile)
    securityTitle: { en: 'Security', fr: 'Sécurité' } as T,
    securitySubtitle: {
      en: 'Change your password or request a reset link.',
      fr: 'Modifiez votre mot de passe ou demandez un lien de réinitialisation.',
    } as T,
    currentPassword: { en: 'Current password', fr: 'Mot de passe actuel' } as T,
    newPassword: { en: 'New password', fr: 'Nouveau mot de passe' } as T,
    confirmPassword: { en: 'Confirm new password', fr: 'Confirmer le nouveau mot de passe' } as T,
    updating: { en: 'Updating…', fr: 'Mise à jour…' } as T,
    updatePassword: { en: 'Update password', fr: 'Mettre à jour le mot de passe' } as T,
    forgotTitle: { en: 'Forgot your password?', fr: 'Mot de passe oublié ?' } as T,
    forgotBody: {
      en: 'We’ll send a reset link to {email}.',
      fr: 'Nous enverrons un lien de réinitialisation à {email}.',
    } as T,
    sending: { en: 'Sending…', fr: 'Envoi…' } as T,
    sendResetLink: { en: 'Send reset link', fr: 'Envoyer le lien de réinitialisation' } as T,
  },

  // ── /account/clinic ──────────────────────────────────────────────
  accountClinic: {
    title: { en: 'Clinic', fr: 'Cabinet' } as T,
    subtitle: {
      en: 'Manage your clinic profile and availability.',
      fr: 'Gérez les informations et la disponibilité de votre cabinet.',
    } as T,
    finishSetupTitle: { en: 'Finish clinic setup', fr: 'Terminer la configuration du cabinet' } as T,
    finishSetupBody: {
      en: 'Add clinic details and working hours to complete onboarding.',
      fr: 'Renseignez les informations du cabinet et les horaires d’ouverture pour terminer l’intégration.',
    } as T,
    unableToLoad: { en: 'Unable to load clinic', fr: 'Impossible de charger le cabinet' } as T,
    tryAgainLater: { en: 'Please try again later.', fr: 'Veuillez réessayer plus tard.' } as T,
    accessUnavailableTitle: { en: 'Clinic access unavailable', fr: 'Accès au cabinet indisponible' } as T,
    accessUnavailableBody: {
      en: 'Clinic settings are only available for dentist accounts.',
      fr: 'Les paramètres du cabinet sont réservés aux comptes praticien.',
    } as T,

    // ClinicForm
    cardTitle: { en: 'Clinic', fr: 'Cabinet' } as T,
    cardSubtitle: {
      en: 'Manage your clinic profile details.',
      fr: 'Gérez les informations de votre cabinet.',
    } as T,
    clinicNameLabel: { en: 'Clinic name', fr: 'Nom du cabinet' } as T,
    phoneLabel: { en: 'Phone', fr: 'Téléphone' } as T,
    addressLabel: { en: 'Address', fr: 'Adresse' } as T,
    cityLabel: { en: 'City', fr: 'Ville' } as T,
    countryLabel: { en: 'Country', fr: 'Pays' } as T,
    locationLabel: { en: 'Location', fr: 'Emplacement' } as T,
    descriptionLabel: { en: 'Description', fr: 'Description' } as T,
    // Clinic "Matricule fiscal" (doctor tax id) — printed on invoices.
    taxIdLabel: { en: 'Tax registration number', fr: 'Matricule fiscal' } as T,
    taxIdPlaceholder: { en: '1234567/A/M/000', fr: '1234567/A/M/000' } as T,
    taxIdHelp: {
      en: 'Your clinic tax id (“Matricule fiscal”). Shown on invoices issued to your clinic.',
      fr: 'Le matricule fiscal de votre cabinet. Affiché sur les factures émises à votre cabinet.',
    } as T,
    // Public directory ("Trouver un praticien")
    specialtyLabel: { en: 'Specialty', fr: 'Spécialité' } as T,
    specialtyPlaceholder: {
      en: 'e.g. Orthodontist, General dentist',
      fr: 'ex. Orthodontiste, Dentiste généraliste',
    } as T,
    publicListingLabel: {
      en: 'List my clinic in the public directory',
      fr: 'Afficher mon cabinet dans l’annuaire public',
    } as T,
    publicListingHelp: {
      en: 'When on, patients can find your clinic on the public “Find a practitioner” map and request appointments. Your tax id and private email are never shown.',
      fr: 'Activé, les patients peuvent trouver votre cabinet sur la carte publique « Trouver un praticien » et demander un rendez-vous. Votre matricule fiscal et votre e-mail privé ne sont jamais affichés.',
    } as T,
    saving: { en: 'Saving...', fr: 'Enregistrement…' } as T,
    saveClinicDetails: { en: 'Save clinic details', fr: 'Enregistrer les informations du cabinet' } as T,
    toastClinicCreated: { en: 'Clinic profile created.', fr: 'Profil du cabinet créé.' } as T,

    // ScheduleForm
    scheduleTitle: { en: 'Working hours', fr: 'Horaires d’ouverture' } as T,
    scheduleSubtitle: { en: 'Set your weekly availability.', fr: 'Définissez votre disponibilité hebdomadaire.' } as T,
    scheduleSaveFirstHint: {
      en: 'Save your clinic details first to enable scheduling.',
      fr: 'Enregistrez d’abord les informations du cabinet pour activer la planification.',
    } as T,
    saveSchedule: { en: 'Save schedule', fr: 'Enregistrer les horaires' } as T,
    toastWorkingHoursSaved: { en: 'Working hours saved.', fr: 'Horaires d’ouverture enregistrés.' } as T,
    toastInvalidHours: {
      en: 'Please provide valid working hours (HH:mm).',
      fr: 'Veuillez saisir des horaires valides (HH:mm).',
    } as T,
    toastOpeningBeforeClosing: {
      en: 'Opening time must be before closing time.',
      fr: 'L’heure d’ouverture doit être antérieure à l’heure de fermeture.',
    } as T,
  },

  // ── /account/billing-settings (Company billing settings) ─────────
  accountBillingSettings: {
    title: { en: 'Billing settings', fr: 'Paramètres de facturation' } as T,
    subtitle: {
      en: 'Company-wide configuration used by every quotation PDF.',
      fr: 'Configuration applicable à l’ensemble des devis PDF de la société.',
    } as T,
    adminsOnly: {
      en: 'Only admins can view the company billing settings.',
      fr: 'Seuls les administrateurs peuvent consulter les paramètres de facturation.',
    } as T,

    // Company section
    companyTitle: { en: 'Company', fr: 'Société' } as T,
    companyLogoAlt: { en: 'Company logo', fr: 'Logo de la société' } as T,
    replaceLogo: { en: 'Replace logo', fr: 'Remplacer le logo' } as T,
    uploadLogo: { en: 'Upload logo', fr: 'Téléverser le logo' } as T,
    removeLogo: { en: 'Remove', fr: 'Supprimer' } as T,
    companyName: { en: 'Company name', fr: 'Raison sociale' } as T,
    taxRegistrationNumber: { en: 'Tax registration number', fr: 'Matricule fiscal' } as T,
    phone: { en: 'Phone', fr: 'Téléphone' } as T,
    email: { en: 'Email', fr: 'E-mail' } as T,
    address: { en: 'Address', fr: 'Adresse' } as T,
    addressPlaceholder: { en: 'Street, suite…', fr: 'Rue, suite…' } as T,

    // Legal identity (mentions légales) — powers the public compliance
    // pages required for online-payment validation.
    legalInfoTitle: { en: 'Legal information', fr: 'Informations légales' } as T,
    legalInfoBody: {
      en: 'Shown on the public compliance pages (legal notice, terms of sale). Required for online-payment validation.',
      fr: 'Affichées sur les pages de conformité publiques (mentions légales, conditions de vente). Requises pour la validation du paiement en ligne.',
    } as T,
    tradeName: { en: 'Trade name', fr: 'Nom commercial' } as T,
    legalForm: { en: 'Legal form', fr: 'Forme juridique' } as T,
    registreDeCommerce: { en: 'Trade register (RC)', fr: 'Registre de commerce (RC)' } as T,
    hostingProvider: { en: 'Hosting provider', fr: 'Hébergeur' } as T,
    hostingProviderUrl: { en: 'Hosting provider website', fr: 'Site de l’hébergeur' } as T,
    websiteDomain: { en: 'Website domain', fr: 'Domaine du site web' } as T,

    // Quote defaults
    quoteDefaultsTitle: { en: 'Quote defaults', fr: 'Valeurs par défaut du devis' } as T,
    quoteDefaultsBody: {
      en: 'These values are auto-applied to every new quotation. The admin can still override them per-quote when editing a specific case.',
      fr: 'Ces valeurs sont appliquées automatiquement à chaque nouveau devis. L’administrateur peut les remplacer au cas par cas lors de la modification d’un devis.',
    } as T,
    // Wording preserved from the source — "TVA" is the Tunisian /
    // Maghreb convention so we keep it inside the FR label too.
    defaultTvaLabel: { en: 'Default TVA (%)', fr: 'TVA par défaut (%)' } as T,
    defaultTreatmentFeeLabel: {
      en: 'Default treatment fee ({currency})',
      fr: 'Honoraires de traitement par défaut ({currency})',
    } as T,
    // "Droit de timbre" — Tunisian fiscal stamp added to every invoice
    // total (typically 1.000 TND). Configured here by the admin.
    stampDutyLabel: {
      en: 'Stamp duty ({currency})',
      fr: 'Droit de timbre ({currency})',
    } as T,
    stampDutyPlaceholder: { en: '1.000', fr: '1.000' } as T,
    stampDutyHelp: {
      en: 'Fiscal stamp (“Droit de timbre”) added to every invoice total. Set to 0 to disable.',
      fr: 'Droit de timbre fiscal ajouté au total de chaque facture. Mettez 0 pour le désactiver.',
    } as T,
    // ── CBCT paid supplement ────────────────────────────────────
    cbctEnabledLabel: {
      en: 'CBCT paid supplement',
      fr: 'Supplément CBCT payant',
    } as T,
    cbctEnabledHelp: {
      en: 'When enabled, requesting CBCT on a NEW order adds the supplement below to the professional fee. Existing orders keep their original price.',
      fr: 'Une fois activé, demander un CBCT sur une NOUVELLE commande ajoute le supplément ci-dessous aux honoraires. Les commandes existantes conservent leur prix d’origine.',
    } as T,
    cbctFeeLabel: {
      en: 'CBCT supplement ({currency})',
      fr: 'Supplément CBCT ({currency})',
    } as T,
    cbctFeeHelp: {
      en: 'Charged once per order when the doctor requests CBCT files.',
      fr: 'Facturé une fois par commande lorsque le praticien demande des fichiers CBCT.',
    } as T,
    defaultCurrencyLabel: { en: 'Default currency', fr: 'Devise par défaut' } as T,
    devisPrefixLabel: { en: 'Devis prefix', fr: 'Préfixe du devis' } as T,
    nextQuoteNumberLabel: { en: 'Next quote number', fr: 'Prochain numéro de devis' } as T,

    // Translations
    translationsTitle: { en: 'Legal & footer text', fr: 'Mentions légales & pied de page' } as T,
    translationsBody: {
      en: 'Each language is rendered on the PDF when the admin generates the quote in that language. Empty languages fall back to French.',
      fr: 'Chaque langue est imprimée sur le PDF lorsque l’administrateur génère le devis dans cette langue. Les langues vides reprennent le français par défaut.',
    } as T,
    legalText: { en: 'Legal text — {label}', fr: 'Mentions légales — {label}' } as T,
    footerText: { en: 'Footer text — {label}', fr: 'Pied de page — {label}' } as T,
    legalPlaceholderFr: {
      en: 'Texte légal qui apparaîtra en bas du devis…',
      fr: 'Texte légal qui apparaîtra en bas du devis…',
    } as T,
    legalPlaceholderEn: {
      en: 'Legal text that will appear at the bottom of every quotation…',
      fr: 'Legal text that will appear at the bottom of every quotation…',
    } as T,
    legalPlaceholderAr: {
      en: 'النص القانوني…',
      fr: 'النص القانوني…',
    } as T,
    footerPlaceholderFr: {
      en: 'Merci pour votre confiance.',
      fr: 'Merci pour votre confiance.',
    } as T,
    footerPlaceholderEn: {
      en: 'Thank you for your trust.',
      fr: 'Thank you for your trust.',
    } as T,
    footerPlaceholderAr: {
      en: 'شكراً لثقتكم.',
      fr: 'شكراً لثقتكم.',
    } as T,
    languageFrench: { en: 'Français', fr: 'Français' } as T,
    languageEnglish: { en: 'English', fr: 'Anglais' } as T,
    languageArabic: { en: 'العربية', fr: 'العربية' } as T,

    // Bank details
    bankDetailsTitle: { en: 'Bank details', fr: 'Coordonnées bancaires' } as T,
    bankName: { en: 'Bank name', fr: 'Nom de la banque' } as T,
    accountName: { en: 'Account name', fr: 'Titulaire du compte' } as T,
    rib: { en: 'RIB', fr: 'RIB' } as T,
    iban: { en: 'IBAN', fr: 'IBAN' } as T,
    swift: { en: 'SWIFT', fr: 'SWIFT' } as T,

    // Save
    saveSettings: { en: 'Save settings', fr: 'Enregistrer les paramètres' } as T,
  },

  // ── /account/settings (AccountSettingsContent) ───────────────────
  accountSettings: {
    title: { en: 'Account settings', fr: 'Paramètres du compte' } as T,
    subtitle: {
      en: 'Update your profile, clinic details, and security preferences.',
      fr: 'Mettez à jour votre profil, les informations du cabinet et les préférences de sécurité.',
    } as T,
    unableToLoad: { en: 'Unable to load settings', fr: 'Impossible de charger les paramètres' } as T,
    tryAgainLater: { en: 'Please try again later.', fr: 'Veuillez réessayer plus tard.' } as T,

    // Tabs
    tabProfile: { en: 'Profile', fr: 'Profil' } as T,
    tabClinic: { en: 'Clinic', fr: 'Cabinet' } as T,
    tabSecurity: { en: 'Security', fr: 'Sécurité' } as T,

    // Profile tab
    profileDetailsTitle: { en: 'Profile details', fr: 'Informations du profil' } as T,
    profileDetailsBody: {
      en: 'Keep your personal information up to date.',
      fr: 'Gardez vos informations personnelles à jour.',
    } as T,
    profilePhotoLabel: { en: 'Profile photo', fr: 'Photo de profil' } as T,
    profilePhotoHint: {
      en: 'Upload a square image for best results.',
      fr: 'Téléversez une image carrée pour un meilleur rendu.',
    } as T,
    uploadAvatar: { en: 'Upload avatar', fr: 'Téléverser une photo' } as T,
    reset: { en: 'Reset', fr: 'Réinitialiser' } as T,
    fullNameLabel: { en: 'Full name', fr: 'Nom complet' } as T,
    emailLabel: { en: 'Email', fr: 'E-mail' } as T,
    emailManagedHint: {
      en: 'Email updates are managed by support.',
      fr: 'Les modifications d’e-mail sont gérées par le support.',
    } as T,
    phoneLabel: { en: 'Phone', fr: 'Téléphone' } as T,
    saving: { en: 'Saving...', fr: 'Enregistrement…' } as T,
    saveChanges: { en: 'Save changes', fr: 'Enregistrer les modifications' } as T,

    // Clinic tab
    clinicSettingsTitle: { en: 'Clinic settings', fr: 'Paramètres du cabinet' } as T,
    clinicSettingsBody: {
      en: 'Manage your clinic profile and availability.',
      fr: 'Gérez les informations et la disponibilité de votre cabinet.',
    } as T,
    clinicNameLabel: { en: 'Clinic name', fr: 'Nom du cabinet' } as T,
    clinicPhoneLabel: { en: 'Clinic phone', fr: 'Téléphone du cabinet' } as T,
    addressLabel: { en: 'Address', fr: 'Adresse' } as T,
    workingHoursLabel: { en: 'Working hours', fr: 'Horaires d’ouverture' } as T,
    workingHoursHint: {
      en: 'Set your weekly availability.',
      fr: 'Définissez votre disponibilité hebdomadaire.',
    } as T,
    saveClinic: { en: 'Save clinic settings', fr: 'Enregistrer les paramètres du cabinet' } as T,

    // Security tab — change password card
    changePasswordTitle: { en: 'Change password', fr: 'Changer le mot de passe' } as T,
    changePasswordBody: {
      en: 'Enter your current password to set a new one.',
      fr: 'Saisissez votre mot de passe actuel pour en définir un nouveau.',
    } as T,
    currentPassword: { en: 'Current password', fr: 'Mot de passe actuel' } as T,
    newPassword: { en: 'New password', fr: 'Nouveau mot de passe' } as T,
    confirmPassword: { en: 'Confirm new password', fr: 'Confirmer le nouveau mot de passe' } as T,
    updating: { en: 'Updating...', fr: 'Mise à jour…' } as T,
    updatePassword: { en: 'Update password', fr: 'Mettre à jour le mot de passe' } as T,

    // Security tab — reset link card
    forgotTitle: { en: 'Forgot your password?', fr: 'Mot de passe oublié ?' } as T,
    forgotBody: {
      en: 'We’ll send a password-reset link to {email}.',
      fr: 'Nous enverrons un lien de réinitialisation à {email}.',
    } as T,
    sending: { en: 'Sending…', fr: 'Envoi…' } as T,
    sendResetLink: { en: 'Send reset link', fr: 'Envoyer le lien de réinitialisation' } as T,

    // Toasts
    toastSelectImage: { en: 'Please select an image file.', fr: 'Veuillez sélectionner un fichier image.' } as T,
    toastAvatarTooLarge: { en: 'Avatar must be 5MB or smaller.', fr: 'La photo doit faire 5 Mo maximum.' } as T,
    toastProfileUpdated: { en: 'Profile updated successfully.', fr: 'Modifications enregistrées.' } as T,
    toastClinicCreated: { en: 'Clinic profile created.', fr: 'Profil du cabinet créé.' } as T,
    toastWorkingHoursSaved: { en: 'Working hours saved.', fr: 'Horaires d’ouverture enregistrés.' } as T,
    toastInvalidHours: {
      en: 'Please provide valid working hours (HH:mm).',
      fr: 'Veuillez saisir des horaires valides (HH:mm).',
    } as T,
    toastOpeningBeforeClosing: {
      en: 'Opening time must be before closing time.',
      fr: 'L’heure d’ouverture doit être antérieure à l’heure de fermeture.',
    } as T,
  },

  // ─── ANCHOR · operational cluster ──────────────────────────────
  // Reserved for the dashboard operational pages — notifications,
  // packs admin, media admin, users admin, reports, support, edit
  // order, treatment-fee-invoice.

  notificationsPage: {
    loading: { en: 'Loading notifications…', fr: 'Chargement des notifications…' } as T,
    title: { en: 'Notifications', fr: 'Notifications' } as T,
    intro: {
      en: 'Every alert sent to your account — order updates, payment events, treatment plan messages, and team broadcasts. Unread first, with filters to narrow the view.',
      fr: 'Toutes les alertes envoyées à votre compte — mises à jour de commandes, paiements, messages du plan de traitement et annonces de l’équipe. Les non lus en premier, avec des filtres pour affiner.',
    } as T,
    markAllAsRead: { en: 'Mark all as read', fr: 'Tout marquer comme lu' } as T,
    tabAll: { en: 'All', fr: 'Tous' } as T,
    tabUnread: { en: 'Unread', fr: 'Non lus' } as T,
    tabUnreadCount: { en: 'Unread ({count})', fr: 'Non lus ({count})' } as T,
    tabRead: { en: 'Read', fr: 'Lus' } as T,
    inboxTitle: { en: 'Inbox', fr: 'Boîte de réception' } as T,
    inboxLoading: { en: 'Loading…', fr: 'Chargement…' } as T,
    inboxCount: {
      en: '{shown} of {total} notifications',
      fr: '{shown} sur {total} notifications',
    } as T,
    emptyUnread: { en: 'No unread notifications.', fr: 'Aucune notification non lue.' } as T,
    emptyRead: { en: 'No read notifications yet.', fr: 'Aucune notification lue pour le moment.' } as T,
    emptyAll: { en: 'Your inbox is empty.', fr: 'Votre boîte de réception est vide.' } as T,
    emptyHint: {
      en: 'New activity (orders, payments, treatment plans) will show up here automatically.',
      fr: 'Toute nouvelle activité (commandes, paiements, plans de traitement) apparaîtra ici automatiquement.',
    } as T,
    pageOf: { en: 'Page {page} of {total}', fr: 'Page {page} sur {total}' } as T,
    previous: { en: 'Previous', fr: 'Précédent' } as T,
    next: { en: 'Next', fr: 'Suivant' } as T,
    newBadge: { en: 'New', fr: 'Nouveau' } as T,
    markAsRead: { en: 'Mark as read', fr: 'Marquer comme lu' } as T,
    readLabel: { en: 'Read', fr: 'Lu' } as T,
  },

  packsAdmin: {
    loading: { en: 'Loading packs…', fr: 'Chargement des forfaits…' } as T,
    accessDeniedTitle: { en: 'Packs are not available for this role', fr: 'Forfaits indisponibles pour ce rôle' } as T,
    accessDeniedBody: {
      en: 'Only dentists and admins can open the packs area.',
      fr: 'Seuls les praticiens et les administrateurs peuvent ouvrir l’espace forfaits.',
    } as T,
    title: { en: 'Pack catalogue', fr: 'Catalogue des forfaits' } as T,
    intro: {
      en: 'Commercial bundles attached to quotations. Each pack supports French / English content and pricing per arcade (two arches / single arch).',
      fr: 'Forfaits commerciaux liés aux devis. Chaque forfait gère un contenu français / anglais et une tarification par arcade (deux arcades / arcade unique).',
    } as T,
    showInactive: { en: 'Show inactive', fr: 'Afficher les inactifs' } as T,
    newPack: { en: 'New pack', fr: 'Nouveau forfait' } as T,
    activePacks: { en: 'Active packs', fr: 'Forfaits actifs' } as T,
    countOne: { en: '{count} pack', fr: '{count} forfait' } as T,
    countMany: { en: '{count} packs', fr: '{count} forfaits' } as T,
    emptyTitle: { en: 'No packs yet.', fr: 'Aucun forfait pour le moment.' } as T,
    createFirst: { en: 'Create your first pack', fr: 'Créer votre premier forfait' } as T,
    colName: { en: 'Name', fr: 'Nom' } as T,
    colLimits: { en: 'Limits', fr: 'Limites' } as T,
    colPrice: { en: 'Price', fr: 'Prix' } as T,
    colStatus: { en: 'Status', fr: 'Statut' } as T,
    unlimitedSteps: { en: 'Unlimited steps', fr: 'Étapes illimitées' } as T,
    maxStepsTpl: { en: 'Max {count} steps', fr: 'Max {count} étapes' } as T,
    unlimitedCorrections: { en: 'Unlimited corrections', fr: 'Corrections illimitées' } as T,
    correctionsTpl: { en: '{count} corrections', fr: '{count} corrections' } as T,
    noPriceSet: { en: 'No price set', fr: 'Aucun prix défini' } as T,
    active: { en: 'Active', fr: 'Actif' } as T,
    inactive: { en: 'Inactive', fr: 'Inactif' } as T,
    cardSteps: { en: 'Steps', fr: 'Étapes' } as T,
    cardCorrections: { en: 'Corrections', fr: 'Corrections' } as T,
    cardPrice: { en: 'Price', fr: 'Prix' } as T,
    cardUnlimited: { en: 'Unlimited', fr: 'Illimité' } as T,
    cardMaxTpl: { en: 'Max {count}', fr: 'Max {count}' } as T,
    cardNoPrice: { en: '— no price set', fr: '— aucun prix défini' } as T,
    deleteTitle: { en: 'Delete this pack?', fr: 'Supprimer ce forfait ?' } as T,
    deleteBody: {
      en: 'The pack "{name}" will be soft-deleted and hidden from the catalogue. Quotations that already snapshotted this pack keep working — they don\'t reference the pack row, only a copy of its fields.',
      fr: 'Le forfait « {name} » sera supprimé en douceur et masqué du catalogue. Les devis ayant déjà figé ce forfait restent valides — ils référencent une copie de ses champs, pas la ligne elle-même.',
    } as T,
    cancel: { en: 'Cancel', fr: 'Annuler' } as T,
    delete: { en: 'Delete', fr: 'Supprimer' } as T,
    editPack: { en: 'Edit pack', fr: 'Modifier le forfait' } as T,
    deactivate: { en: 'Deactivate', fr: 'Désactiver' } as T,
    activate: { en: 'Activate', fr: 'Activer' } as T,
    deletePack: { en: 'Delete pack', fr: 'Supprimer le forfait' } as T,
    deletePermanently: { en: 'Delete permanently', fr: 'Supprimer définitivement' } as T,
    deletePermanentlyTitle: {
      en: 'Permanently delete this pack?',
      fr: 'Supprimer définitivement ce forfait ?',
    } as T,
    deletePermanentlyBody: {
      en: 'The pack "{name}" and its prices will be permanently removed. This cannot be undone. Historical quotations keep their saved snapshot.',
      fr: 'Le forfait « {name} » et ses prix seront supprimés définitivement. Cette action est irréversible. Les devis existants conservent leur copie enregistrée.',
    } as T,
    dialogEditTitle: { en: 'Edit pack', fr: 'Modifier le forfait' } as T,
    dialogNewTitle: { en: 'New pack', fr: 'Nouveau forfait' } as T,
    dialogDescription: {
      en: 'Enter the French content (English is optional — it falls back to French when missing). Set the two-arch and/or single-arch price. Everything is saved together.',
      fr: 'Renseignez le contenu en français (l’anglais est facultatif — il bascule vers le français si absent). Définissez le prix deux arcades et/ou arcade unique. Tout est enregistré ensemble.',
    } as T,
    sectionGeneral: { en: 'General information', fr: 'Informations générales' } as T,
    sectionTreatment: { en: 'Treatment', fr: 'Traitement' } as T,
    sectionPricing: { en: 'Pricing', fr: 'Tarification' } as T,
    sectionFinishing: { en: 'Finishing', fr: 'Finition' } as T,
    nameLabel: { en: 'Product name', fr: 'Nom du produit' } as T,
    namePlaceholder: { en: 'e.g. Express Pack', fr: 'p. ex. Forfait Express' } as T,
    namePlaceholderEn: { en: 'e.g. Express Pack', fr: 'p. ex. Express Pack' } as T,
    alignersLabel: { en: 'Aligners per arch', fr: 'Nombre d’aligneurs par arcade' } as T,
    alignersPlaceholder: { en: 'e.g. 24', fr: 'p. ex. 24' } as T,
    alignersRequired: {
      en: 'Enter a number of aligners, or check “Unlimited”.',
      fr: 'Saisissez un nombre d’aligneurs, ou cochez « Illimité ».',
    } as T,
    expirationLabel: {
      en: 'Treatment expiration / duration',
      fr: 'Date d’expiration du traitement',
    } as T,
    expirationPlaceholder: { en: 'e.g. 24 months', fr: 'p. ex. 24 mois' } as T,
    finishingLabel: { en: 'Finishing included', fr: 'Finition incluse' } as T,
    finishingPlaceholder: {
      en: 'e.g. 1 finishing session included',
      fr: 'p. ex. 1 séance de finition incluse',
    } as T,
    priceTwoArchesLabel: { en: 'Two-arch price', fr: 'Prix deux arcades' } as T,
    priceSingleArchLabel: { en: 'Single-arch price', fr: 'Prix arcade unique' } as T,
    priceSingleArchPlaceholder: { en: 'Optional', fr: 'Facultatif' } as T,
    currencyLabel: { en: 'Currency', fr: 'Devise' } as T,
    singleArchOptionalHint: {
      en: 'Leave the single-arch price empty if this pack is only offered for two arches — “Single arch” is then disabled on orders.',
      fr: 'Laissez le prix arcade unique vide si ce forfait n’est proposé que pour deux arcades — « Arcade unique » est alors désactivée sur les commandes.',
    } as T,
    atLeastOnePrice: {
      en: 'At least one price is required (two arches or single arch).',
      fr: 'Au moins un prix est requis (deux arcades ou arcade unique).',
    } as T,
    priceTwoArchShort: { en: '2 arches', fr: '2 arcades' } as T,
    priceSingleArchShort: { en: '1 arch', fr: '1 arcade' } as T,
    descriptionLabel: { en: 'Description', fr: 'Description' } as T,
    descriptionPlaceholder: {
      en: 'Optional — short note shown alongside the pack name.',
      fr: 'Facultatif — courte note affichée à côté du nom du forfait.',
    } as T,
    maxStepsLabel: { en: 'Max steps', fr: 'Étapes max' } as T,
    unlimitedStepsCb: { en: 'Unlimited steps', fr: 'Étapes illimitées' } as T,
    includedCorrectionsLabel: { en: 'Included corrections', fr: 'Corrections incluses' } as T,
    unlimitedCorrectionsCb: { en: 'Unlimited corrections', fr: 'Corrections illimitées' } as T,
    packPriceLabel: { en: 'Pack price', fr: 'Prix du forfait' } as T,
    pricePlaceholder: { en: 'e.g. 1950.000', fr: 'p. ex. 1950.000' } as T,
    priceHelpEdited: {
      en: 'Saving changes the active price. Existing quotations that already snapshotted the old price are unaffected.',
      fr: 'L’enregistrement met à jour le prix actif. Les devis ayant déjà figé l’ancien prix ne sont pas affectés.',
    } as T,
    priceHelpNoneYet: {
      en: 'No price set yet. Enter one to expose this pack on new quotations.',
      fr: 'Aucun prix défini pour l’instant. Saisissez-en un pour afficher ce forfait sur les nouveaux devis.',
    } as T,
    priceHelpCreate: {
      en: 'Optional on create — you can add a price later from the same Edit form.',
      fr: 'Facultatif à la création — vous pourrez ajouter un prix plus tard depuis le formulaire de modification.',
    } as T,
    priceInvalid: {
      en: 'Enter a positive number with up to 3 decimals (e.g. 1950 or 1950.000).',
      fr: 'Saisissez un nombre positif avec jusqu’à 3 décimales (p. ex. 1950 ou 1950.000).',
    } as T,
    activeInCatalogue: { en: 'Active in catalogue', fr: 'Actif au catalogue' } as T,
    activeYes: {
      en: 'Visible to practitioners and selectable on new quotes.',
      fr: 'Visible par les praticiens et sélectionnable sur les nouveaux devis.',
    } as T,
    activeNo: {
      en: 'Hidden from new quotes and the public showcase. Existing quotes that already use this pack are unaffected.',
      fr: 'Masqué des nouveaux devis et de la vitrine publique. Les devis utilisant déjà ce forfait ne sont pas affectés.',
    } as T,
    saveChanges: { en: 'Save changes', fr: 'Enregistrer les modifications' } as T,
    createPack: { en: 'Create pack', fr: 'Créer le forfait' } as T,
  },

  packsDoctor: {
    eyebrow: { en: 'Available packs', fr: 'Forfaits disponibles' } as T,
    title: { en: 'Choose the right pack for your next case', fr: 'Choisissez le bon forfait pour votre prochain cas' } as T,
    intro: {
      en: 'This catalogue is informational. You select the pack inside the new-order workflow, after the clinical case is created.',
      fr: 'Ce catalogue est informatif. La sélection du forfait se fait dans le workflow de nouvelle commande, après la création du cas clinique.',
    } as T,
    newOrder: { en: 'Create an order', fr: 'Créer une commande' } as T,
  },

  mediaAdmin: {
    loading: { en: 'Loading media library…', fr: 'Chargement de la médiathèque…' } as T,
    title: { en: 'Media Management', fr: 'Gestion des médias' } as T,
    intro: {
      en: 'Manage the rotating gallery shown on every doctor\'s dashboard. Separate lists for desktop and mobile are supported.',
      fr: 'Gérez la galerie défilante affichée sur le tableau de bord de chaque praticien. Des listes distinctes pour le bureau et le mobile sont prises en charge.',
    } as T,
    refresh: { en: 'Refresh', fr: 'Actualiser' } as T,
    addSlide: { en: 'Add slide', fr: 'Ajouter une diapositive' } as T,
    tabAll: { en: 'All', fr: 'Tous' } as T,
    tabDesktop: { en: 'Desktop', fr: 'Bureau' } as T,
    tabMobile: { en: 'Mobile', fr: 'Mobile' } as T,
    tabInactive: { en: 'Inactive', fr: 'Inactifs' } as T,
    tabTrash: { en: 'Trash', fr: 'Corbeille' } as T,
    searchPlaceholder: { en: 'Search slides by title…', fr: 'Rechercher des diapositives par titre…' } as T,
    slides: { en: 'Slides', fr: 'Diapositives' } as T,
    totalDescription: {
      en: '{total} total · drag-free reorder with the arrow buttons.',
      fr: '{total} au total · réorganisation sans glisser-déposer via les flèches.',
    } as T,
    loadError: {
      en: 'Could not load the media library. Check your connection and try Refresh.',
      fr: 'Impossible de charger la médiathèque. Vérifiez votre connexion et essayez Actualiser.',
    } as T,
    emptyHint: {
      en: 'No slides yet — click "Add slide" to create the first one.',
      fr: 'Aucune diapositive pour le moment — cliquez sur « Ajouter une diapositive » pour créer la première.',
    } as T,
    activateError: { en: 'Could not activate slide.', fr: 'Impossible d’activer la diapositive.' } as T,
    moveUp: { en: 'Move up', fr: 'Déplacer vers le haut' } as T,
    moveDown: { en: 'Move down', fr: 'Déplacer vers le bas' } as T,
    preview: { en: 'Preview', fr: 'Aperçu' } as T,
    edit: { en: 'Edit', fr: 'Modifier' } as T,
    deactivate: { en: 'Deactivate', fr: 'Désactiver' } as T,
    activate: { en: 'Activate', fr: 'Activer' } as T,
    delete: { en: 'Delete', fr: 'Supprimer' } as T,
    restore: { en: 'Restore', fr: 'Restaurer' } as T,
    badgeTrashed: { en: 'trashed', fr: 'corbeille' } as T,
    previewDesc: {
      en: 'Desktop + mobile preview of how this slide renders on the doctor dashboard.',
      fr: 'Aperçu bureau et mobile de l’affichage de cette diapositive sur le tableau de bord du praticien.',
    } as T,
    previewLabelDesktop: { en: 'Desktop', fr: 'Bureau' } as T,
    previewLabelMobile: { en: 'Mobile', fr: 'Mobile' } as T,
    previewNoDesktop: { en: 'No desktop asset', fr: 'Aucun fichier bureau' } as T,
    previewNoMobile: { en: 'No mobile asset', fr: 'Aucun fichier mobile' } as T,
    deleteTitle: { en: 'Move slide to trash?', fr: 'Déplacer la diapositive vers la corbeille ?' } as T,
    deleteBody: {
      en: '"{title}" will be hidden from the doctor dashboard immediately. You can restore it from the Trash tab.',
      fr: '« {title} » sera immédiatement masquée du tableau de bord du praticien. Vous pourrez la restaurer depuis l’onglet Corbeille.',
    } as T,
    cancel: { en: 'Cancel', fr: 'Annuler' } as T,
    moveToTrash: { en: 'Move to trash', fr: 'Mettre à la corbeille' } as T,
    toastTitleRequired: { en: 'Add a title for the slide.', fr: 'Ajoutez un titre à la diapositive.' } as T,
    toastDeviceRequired: {
      en: 'Pick at least one device target (desktop, mobile).',
      fr: 'Choisissez au moins une cible d’appareil (bureau, mobile).',
    } as T,
    toastUploadRequired: { en: 'Upload a desktop or mobile asset.', fr: 'Téléversez un fichier bureau ou mobile.' } as T,
    toastUrlRequired: {
      en: 'Provide a desktop or mobile external URL.',
      fr: 'Fournissez une URL externe bureau ou mobile.',
    } as T,
    dialogAdd: { en: 'Add slide', fr: 'Ajouter une diapositive' } as T,
    dialogEdit: { en: 'Edit slide', fr: 'Modifier la diapositive' } as T,
    dialogDesc: {
      en: 'Slides appear on the doctor dashboard ordered by the display order you set.',
      fr: 'Les diapositives apparaissent sur le tableau de bord du praticien selon l’ordre d’affichage que vous définissez.',
    } as T,
    fieldTitle: { en: 'Title', fr: 'Titre' } as T,
    fieldTitlePh: {
      en: 'e.g. Spring promotion — 20% off Pro pack',
      fr: 'p. ex. Promotion printemps — 20 % sur le forfait Pro',
    } as T,
    mediaType: { en: 'Media type', fr: 'Type de média' } as T,
    image: { en: 'Image', fr: 'Image' } as T,
    video: { en: 'Video', fr: 'Vidéo' } as T,
    source: { en: 'Source', fr: 'Source' } as T,
    upload: { en: 'Upload', fr: 'Téléverser' } as T,
    externalUrl: { en: 'External URL', fr: 'URL externe' } as T,
    deviceTargets: { en: 'Device targets', fr: 'Cibles d’appareil' } as T,
    deviceHint: {
      en: 'Pick one or both. Desktop and mobile lists are independent so you can ship different counts per surface.',
      fr: 'Choisissez un appareil ou les deux. Les listes bureau et mobile sont indépendantes, vous pouvez ainsi publier des contenus différents pour chaque surface.',
    } as T,
    desktopAsset: { en: 'Desktop asset', fr: 'Fichier bureau' } as T,
    mobileAsset: { en: 'Mobile asset', fr: 'Fichier mobile' } as T,
    desktopUrl: { en: 'Desktop URL', fr: 'URL bureau' } as T,
    mobileUrl: { en: 'Mobile URL', fr: 'URL mobile' } as T,
    linkUrl: { en: 'Click-through URL (optional)', fr: 'URL de redirection (facultatif)' } as T,
    activeRow: { en: 'Active', fr: 'Actif' } as T,
    activeRowHint: {
      en: 'Only active slides appear on the doctor dashboard.',
      fr: 'Seules les diapositives actives apparaissent sur le tableau de bord du praticien.',
    } as T,
    save: { en: 'Save changes', fr: 'Enregistrer les modifications' } as T,
    replace: { en: 'Replace', fr: 'Remplacer' } as T,
    uploadLabel: { en: 'Upload', fr: 'Téléverser' } as T,
    noFile: { en: 'No file', fr: 'Aucun fichier' } as T,
    desktopLabel: { en: 'Desktop', fr: 'Bureau' } as T,
    mobileLabel: { en: 'Mobile', fr: 'Mobile' } as T,
  },

  communityAdmin: {
    loading: { en: 'Loading community stories…', fr: 'Chargement des témoignages…' } as T,
    title: { en: 'Community stories', fr: 'Témoignages de la communauté' } as T,
    intro: {
      en: 'Review patient stories before they appear on the public ORALIGN website.',
      fr: 'Relisez les témoignages avant leur publication sur le site public ORALIGN.',
    } as T,
    pending: { en: 'Pending review', fr: 'En attente' } as T,
    approved: { en: 'Approved', fr: 'Approuvés' } as T,
    rejected: { en: 'Rejected', fr: 'Refusés' } as T,
    empty: { en: 'No stories in this queue.', fr: 'Aucun témoignage dans cette file.' } as T,
    error: { en: 'Could not load community stories.', fr: 'Impossible de charger les témoignages.' } as T,
    approve: { en: 'Approve and publish', fr: 'Approuver et publier' } as T,
    reject: { en: 'Reject', fr: 'Refuser' } as T,
    delete: { en: 'Remove', fr: 'Supprimer' } as T,
    rejectTitle: { en: 'Reject this story?', fr: 'Refuser ce témoignage ?' } as T,
    rejectBody: { en: 'Add an optional internal note for your team.', fr: 'Ajoutez une note interne facultative pour votre équipe.' } as T,
    rejectPlaceholder: { en: 'Reason or moderation note…', fr: 'Motif ou note de modération…' } as T,
    cancel: { en: 'Cancel', fr: 'Annuler' } as T,
    confirmReject: { en: 'Reject story', fr: 'Refuser le témoignage' } as T,
    typeVideo: { en: 'Video story', fr: 'Témoignage vidéo' } as T,
    typePhoto: { en: 'Photo story', fr: 'Témoignage photo' } as T,
    typeText: { en: 'Written story', fr: 'Témoignage écrit' } as T,
    treatmentInProgress: { en: 'In progress', fr: 'En cours' } as T,
    treatmentCompleted: { en: 'Completed', fr: 'Terminé' } as T,
    submittedOn: { en: 'Submitted {date}', fr: 'Envoyé le {date}' } as T,
    contact: { en: 'Contact', fr: 'Contact' } as T,
    experience: { en: 'Experience', fr: 'Expérience' } as T,
    why: { en: 'Why ORALIGN', fr: 'Pourquoi ORALIGN' } as T,
    journey: { en: 'How it went', fr: 'Déroulement' } as T,
    media: { en: 'Attached media', fr: 'Médias joints' } as T,
    toastApproved: { en: 'Story approved and published.', fr: 'Témoignage approuvé et publié.' } as T,
    toastRejected: { en: 'Story rejected.', fr: 'Témoignage refusé.' } as T,
    toastDeleted: { en: 'Story archived.', fr: 'Témoignage archivé.' } as T,
    // Deletion lifecycle: archive → restore → permanent.
    trash: { en: 'Archived', fr: 'Archivés' } as T,
    restore: { en: 'Restore', fr: 'Restaurer' } as T,
    permanentDelete: { en: 'Delete permanently', fr: 'Supprimer définitivement' } as T,
    permanentDeleteTitle: { en: 'Delete this story permanently?', fr: 'Supprimer définitivement ce témoignage ?' } as T,
    permanentDeleteBody: {
      en: 'This erases the story and every photo or video attached to it. It cannot be undone.',
      fr: 'Cette action efface le témoignage et toutes les photos ou vidéos jointes. Elle est irréversible.',
    } as T,
    archivedOn: { en: 'Archived {date}', fr: 'Archivé le {date}' } as T,
    toastRestored: { en: 'Story restored.', fr: 'Témoignage restauré.' } as T,
    toastPermanentlyDeleted: { en: 'Story permanently deleted.', fr: 'Témoignage supprimé définitivement.' } as T,
    add: { en: 'Add story', fr: 'Ajouter un témoignage' } as T,
    edit: { en: 'Edit', fr: 'Modifier' } as T,
    save: { en: 'Save changes', fr: 'Enregistrer les modifications' } as T,
    create: { en: 'Create story', fr: 'Créer le témoignage' } as T,
    refresh: { en: 'Refresh', fr: 'Actualiser' } as T,
    moderation: { en: 'Moderation queue', fr: 'File de modération' } as T,
    noMedia: { en: 'No media attached', fr: 'Aucun média joint' } as T,
    formDescription: { en: 'Add or update the story details. Media is processed and stored securely.', fr: 'Ajoutez ou modifiez les informations. Les médias sont traités et stockés de façon sécurisée.' } as T,
    firstName: { en: 'First name', fr: 'Prénom' } as T,
    lastNameInitial: { en: 'Last-name initial', fr: 'Initiale du nom' } as T,
    phone: { en: 'Phone', fr: 'Téléphone' } as T,
    email: { en: 'Email', fr: 'E-mail' } as T,
    city: { en: 'City', fr: 'Ville' } as T,
    role: { en: 'Audience', fr: 'Profil' } as T,
    adult: { en: 'Adult', fr: 'Adulte' } as T,
    parent: { en: 'Parent', fr: 'Parent' } as T,
    teen: { en: 'Teen', fr: 'Adolescent' } as T,
    childName: { en: 'Child name', fr: 'Nom de l’enfant' } as T,
    childAge: { en: 'Child age', fr: 'Âge de l’enfant' } as T,
    treatmentStatus: { en: 'Treatment status', fr: 'État du traitement' } as T,
    format: { en: 'Story format', fr: 'Format du témoignage' } as T,
    textFormat: { en: 'Written', fr: 'Écrit' } as T,
    photoFormat: { en: 'Photos', fr: 'Photos' } as T,
    videoFormat: { en: 'Video', fr: 'Vidéo' } as T,
    inProgress: { en: 'In progress', fr: 'En cours' } as T,
    completed: { en: 'Completed', fr: 'Terminé' } as T,
    whyPrompt: { en: 'Why ORALIGN?', fr: 'Pourquoi ORALIGN ?' } as T,
    journeyPrompt: { en: 'How did the experience go?', fr: 'Comment s’est déroulée l’expérience ?' } as T,
    satisfiedPrompt: { en: 'What are you most satisfied with?', fr: 'De quoi êtes-vous le plus satisfait ?' } as T,
    messagePrompt: { en: 'Public message', fr: 'Message public' } as T,
    mediaUpload: { en: 'Media files', fr: 'Fichiers média' } as T,
    mediaHint: { en: 'Photos: 1–4 images. Video: one video and an optional cover.', fr: 'Photos : 1 à 4 images. Vidéo : une vidéo et une couverture facultative.' } as T,
    publishOnCreate: { en: 'Publish immediately', fr: 'Publier immédiatement' } as T,
    editFormatHint: { en: 'The format cannot be changed after creation.', fr: 'Le format ne peut pas être modifié après création.' } as T,
    toastCreated: { en: 'Story created.', fr: 'Témoignage créé.' } as T,
    toastUpdated: { en: 'Story updated.', fr: 'Témoignage mis à jour.' } as T,
  },

  usersAdmin: {
    loadingFallback: { en: 'Loading...', fr: 'Chargement…' } as T,
    title: { en: 'Users', fr: 'Utilisateurs' } as T,
    intro: { en: 'Manage system users and their roles', fr: 'Gérez les utilisateurs du système et leurs rôles' } as T,
    addUser: { en: 'Add User', fr: 'Ajouter un utilisateur' } as T,
    error: { en: 'Error', fr: 'Erreur' } as T,
    errorBody: { en: 'Failed to load users', fr: 'Échec du chargement des utilisateurs' } as T,
    retry: { en: 'Retry', fr: 'Réessayer' } as T,
    pendingBannerOne: {
      en: '{count} user awaiting approval',
      fr: '{count} utilisateur en attente d’approbation',
    } as T,
    pendingBannerMany: {
      en: '{count} users awaiting approval',
      fr: '{count} utilisateurs en attente d’approbation',
    } as T,
    pendingBannerSuffix: {
      en: " — they're listed at the top of the table.",
      fr: ' — ils figurent en haut du tableau.',
    } as T,
    tabActive: { en: 'Active Users', fr: 'Utilisateurs actifs' } as T,
    tabDeleted: { en: 'Deleted Users', fr: 'Utilisateurs supprimés' } as T,
    statDeletedTotal: { en: 'Deleted Users', fr: 'Utilisateurs supprimés' } as T,
    statTotal: { en: 'Total Users', fr: 'Total des utilisateurs' } as T,
    statActiveDeleted: { en: 'Active (deleted)', fr: 'Actifs (supprimés)' } as T,
    statActive: { en: 'Active Users', fr: 'Utilisateurs actifs' } as T,
    statBlockedDeleted: { en: 'Blocked (deleted)', fr: 'Bloqués (supprimés)' } as T,
    statBlocked: { en: 'Blocked Users', fr: 'Utilisateurs bloqués' } as T,
    statSelected: { en: 'Selected', fr: 'Sélectionnés' } as T,
    searchDeletedPh: { en: 'Search deleted users...', fr: 'Rechercher des utilisateurs supprimés…' } as T,
    searchPh: { en: 'Search by name or email...', fr: 'Rechercher par nom ou e-mail…' } as T,
    selectedOne: { en: '{count} user selected', fr: '{count} utilisateur sélectionné' } as T,
    selectedMany: { en: '{count} users selected', fr: '{count} utilisateurs sélectionnés' } as T,
    restore: { en: 'Restore', fr: 'Restaurer' } as T,
    permanentlyDelete: { en: 'Permanently Delete', fr: 'Supprimer définitivement' } as T,
    activate: { en: 'Activate', fr: 'Activer' } as T,
    block: { en: 'Block', fr: 'Bloquer' } as T,
    delete: { en: 'Delete', fr: 'Supprimer' } as T,
    clear: { en: 'Clear', fr: 'Effacer' } as T,
    tableTitleDeleted: { en: 'Deleted Users ({total})', fr: 'Utilisateurs supprimés ({total})' } as T,
    tableTitle: { en: 'Users ({total})', fr: 'Utilisateurs ({total})' } as T,
    tableDescDeleted: {
      en: 'A list of deleted users. You can restore or permanently delete them.',
      fr: 'Liste des utilisateurs supprimés. Vous pouvez les restaurer ou les supprimer définitivement.',
    } as T,
    tableDesc: {
      en: 'A list of all users in the system with their details and status.',
      fr: 'Liste de tous les utilisateurs du système avec leurs détails et statut.',
    } as T,
    colUser: { en: 'User', fr: 'Utilisateur' } as T,
    colApproval: { en: 'Approval', fr: 'Approbation' } as T,
    colPhone: { en: 'Phone', fr: 'Téléphone' } as T,
    colRole: { en: 'Role', fr: 'Rôle' } as T,
    colStatus: { en: 'Status', fr: 'Statut' } as T,
    colEmailVerified: { en: 'Email Verified', fr: 'E-mail vérifié' } as T,
    colLastLogin: { en: 'Last Login', fr: 'Dernière connexion' } as T,
    colCreatedAt: { en: 'Created', fr: 'Date de création' } as T,
    colActions: { en: 'Actions', fr: 'Actions' } as T,
    approved: { en: 'Approved', fr: 'Approuvé' } as T,
    rejected: { en: 'Rejected', fr: 'Rejeté' } as T,
    notApproved: { en: 'Not approved', fr: 'Non approuvé' } as T,
    notProvided: { en: 'Not provided', fr: 'Non renseigné' } as T,
    statusActive: { en: 'Active', fr: 'Actif' } as T,
    statusBlocked: { en: 'Blocked', fr: 'Bloqué' } as T,
    verified: { en: 'Verified', fr: 'Vérifié' } as T,
    verifyPending: { en: 'Pending', fr: 'En attente' } as T,
    never: { en: 'Never', fr: 'Jamais' } as T,
    actions: { en: 'Actions', fr: 'Actions' } as T,
    viewDetails: { en: 'View Details', fr: 'Voir les détails' } as T,
    editUser: { en: 'Edit User', fr: 'Modifier l’utilisateur' } as T,
    addClinic: { en: 'Add Clinic', fr: 'Ajouter une clinique' } as T,
    viewClinic: { en: 'View Clinic', fr: 'Voir la clinique' } as T,
    openingHours: { en: 'Opening Hours', fr: 'Horaires d’ouverture' } as T,
    approve: { en: 'Approve', fr: 'Approuver' } as T,
    reject: { en: 'Reject', fr: 'Rejeter' } as T,
    markPending: { en: 'Mark as pending', fr: 'Marquer en attente' } as T,
    restoreUser: { en: 'Restore User', fr: 'Restaurer l’utilisateur' } as T,
    blockUser: { en: 'Block User', fr: 'Bloquer l’utilisateur' } as T,
    activateUser: { en: 'Activate User', fr: 'Activer l’utilisateur' } as T,
    deleteUser: { en: 'Delete User', fr: 'Supprimer l’utilisateur' } as T,
    emptyDeleted: { en: 'No deleted users found', fr: 'Aucun utilisateur supprimé trouvé' } as T,
    emptyActive: { en: 'No users found', fr: 'Aucun utilisateur trouvé' } as T,
    emptyHint: { en: 'Try adjusting your search or filter criteria', fr: 'Essayez d’ajuster votre recherche ou vos filtres' } as T,
    pagShowing: {
      en: 'Showing {from} to {to} of {total} results',
      fr: 'Affichage de {from} à {to} sur {total} résultats',
    } as T,
    previous: { en: 'Previous', fr: 'Précédent' } as T,
    next: { en: 'Next', fr: 'Suivant' } as T,
    bulkDeleteTitle: { en: 'Delete Users', fr: 'Supprimer les utilisateurs' } as T,
    bulkRestoreTitle: { en: 'Restore Users', fr: 'Restaurer les utilisateurs' } as T,
    bulkPermanentTitle: { en: 'Permanently Delete Users', fr: 'Supprimer définitivement les utilisateurs' } as T,
    bulkBlockTitle: { en: 'Block Users', fr: 'Bloquer les utilisateurs' } as T,
    bulkActivateTitle: { en: 'Activate Users', fr: 'Activer les utilisateurs' } as T,
    bulkConfirmOne: {
      en: 'Are you sure you want to {action} {count} user?',
      fr: 'Voulez-vous vraiment {action} {count} utilisateur ?',
    } as T,
    bulkConfirmMany: {
      en: 'Are you sure you want to {action} {count} users?',
      fr: 'Voulez-vous vraiment {action} {count} utilisateurs ?',
    } as T,
    bulkActionDelete: { en: 'delete', fr: 'supprimer' } as T,
    bulkActionRestore: { en: 'restore', fr: 'restaurer' } as T,
    bulkActionPermanent: { en: 'permanently delete', fr: 'supprimer définitivement' } as T,
    bulkActionBlock: { en: 'block', fr: 'bloquer' } as T,
    bulkActionActivate: { en: 'activate', fr: 'activer' } as T,
    bulkIrreversible: { en: ' This action cannot be undone.', fr: ' Cette action est irréversible.' } as T,
    bulkPermanentNote: {
      en: ' The user data will be permanently removed from the database.',
      fr: ' Les données de l’utilisateur seront supprimées définitivement de la base de données.',
    } as T,
    cancel: { en: 'Cancel', fr: 'Annuler' } as T,
    btnDelete: { en: 'Delete', fr: 'Supprimer' } as T,
    btnRestore: { en: 'Restore', fr: 'Restaurer' } as T,
    btnPermanent: { en: 'Permanently Delete', fr: 'Supprimer définitivement' } as T,
    btnBlock: { en: 'Block', fr: 'Bloquer' } as T,
    btnActivate: { en: 'Activate', fr: 'Activer' } as T,
  },

  reportsPage: {
    title: { en: 'Reports', fr: 'Rapports' } as T,
    admin: { en: 'Admin', fr: 'Administrateur' } as T,
    intro: {
      en: 'Exportable platform reports for revenue, doctor performance, and pack activity. The numbers use the same backend aggregates as the Admin Dashboard.',
      fr: 'Rapports exportables couvrant le chiffre d’affaires, la performance des praticiens et l’activité des forfaits. Les chiffres utilisent les mêmes agrégats que le tableau de bord administrateur.',
    } as T,
    refresh: { en: 'Refresh', fr: 'Actualiser' } as T,
    loadError: {
      en: 'Reports could not load. Check that the backend is running and that your account has admin access.',
      fr: 'Impossible de charger les rapports. Vérifiez que le backend est actif et que votre compte dispose des droits administrateur.',
    } as T,
    revenue: { en: 'Revenue', fr: 'Revenu' } as T,
    revenueDetail: { en: 'Collected {amount}', fr: 'Encaissé {amount}' } as T,
    orders: { en: 'Orders', fr: 'Commandes' } as T,
    ordersDetail: { en: '{paid} paid · {unpaid} unpaid', fr: '{paid} payées · {unpaid} non payées' } as T,
    doctors: { en: 'Doctors', fr: 'Praticiens' } as T,
    doctorsDetail: { en: '{count} active', fr: '{count} actifs' } as T,
    conversion: { en: 'Conversion', fr: 'Conversion' } as T,
    conversionDetail: { en: 'AOV {amount}', fr: 'Panier moyen {amount}' } as T,
    revenueReportTitle: { en: 'Revenue report', fr: 'Rapport de revenu' } as T,
    revenueReportDesc: {
      en: 'Daily revenue, order volume, new doctors, and new patients.',
      fr: 'Revenu quotidien, volume de commandes, nouveaux praticiens et nouveaux patients.',
    } as T,
    doctorReportTitle: { en: 'Doctor report', fr: 'Rapport praticiens' } as T,
    doctorReportDesc: {
      en: 'Top doctors by orders, paid orders, revenue, and outstanding balance.',
      fr: 'Meilleurs praticiens par commandes, commandes payées, revenu et solde dû.',
    } as T,
    packReportTitle: { en: 'Pack report', fr: 'Rapport forfaits' } as T,
    packReportDesc: {
      en: 'Pack sales, revenue, collected amount, and current prices.',
      fr: 'Ventes de forfaits, revenu, montant encaissé et prix actuels.',
    } as T,
    csv: { en: 'CSV', fr: 'CSV' } as T,
    topDoctors: { en: 'Top doctors', fr: 'Meilleurs praticiens' } as T,
    topDoctorsDesc: { en: 'Ranked by orders in the selected range.', fr: 'Classés par commandes sur la période sélectionnée.' } as T,
    bestPacks: { en: 'Best-selling packs', fr: 'Forfaits les plus vendus' } as T,
    bestPacksDesc: { en: 'Pack performance in the selected range.', fr: 'Performance des forfaits sur la période sélectionnée.' } as T,
    colDoctor: { en: 'Doctor', fr: 'Praticien' } as T,
    colOrders: { en: 'Orders', fr: 'Commandes' } as T,
    colRevenue: { en: 'Revenue', fr: 'Revenu' } as T,
    colOutstanding: { en: 'Outstanding', fr: 'Solde dû' } as T,
    colPack: { en: 'Pack', fr: 'Forfait' } as T,
    colSold: { en: 'Sold', fr: 'Vendus' } as T,
    colCollected: { en: 'Collected', fr: 'Encaissé' } as T,
    inactive: { en: 'Inactive', fr: 'Inactif' } as T,
    emptyReport: { en: 'No report data in this range.', fr: 'Aucune donnée de rapport sur cette période.' } as T,
  },

  supportAdmin: {
    loading: { en: 'Loading support inbox…', fr: 'Chargement de la boîte d’assistance…' } as T,
    title: { en: 'Support inbox', fr: 'Boîte d’assistance' } as T,
    intro: {
      en: 'Direct doctor ↔ admin support threads. Reply, resolve, assign priority, or move stale threads to trash.',
      fr: 'Conversations directes praticien ↔ administrateur. Répondez, résolvez, attribuez une priorité ou mettez les fils inactifs à la corbeille.',
    } as T,
    tabAll: { en: 'All', fr: 'Tous' } as T,
    tabUnread: { en: 'Unread', fr: 'Non lus' } as T,
    tabOpen: { en: 'Open', fr: 'Ouvert' } as T,
    tabPending: { en: 'Pending', fr: 'En attente' } as T,
    tabResolved: { en: 'Resolved', fr: 'Résolu' } as T,
    tabClosed: { en: 'Closed', fr: 'Fermé' } as T,
    tabTrash: { en: 'Trash', fr: 'Corbeille' } as T,
    searchPlaceholder: {
      en: 'Search doctor, subject, message…',
      fr: 'Rechercher praticien, objet, message…',
    } as T,
    clearSearch: { en: 'Clear search', fr: 'Effacer la recherche' } as T,
    anyPriority: { en: 'Any priority', fr: 'Toutes priorités' } as T,
    refresh: { en: 'Refresh', fr: 'Actualiser' } as T,
    emptyTrash: { en: 'Trash is empty.', fr: 'La corbeille est vide.' } as T,
    emptyMatch: { en: 'No conversations match.', fr: 'Aucune conversation correspondante.' } as T,
    emptyTrashHint: {
      en: 'Soft-deleted conversations show up here.',
      fr: 'Les conversations supprimées en douceur apparaissent ici.',
    } as T,
    emptyHint: {
      en: 'New support threads will appear here automatically.',
      fr: 'Les nouveaux fils d’assistance apparaîtront ici automatiquement.',
    } as T,
    pageInfo: { en: 'Page {page} of {total} · {count} total', fr: 'Page {page} sur {total} · {count} au total' } as T,
    prevPage: { en: 'Previous page', fr: 'Page précédente' } as T,
    nextPage: { en: 'Next page', fr: 'Page suivante' } as T,
    selectConv: { en: 'Select a conversation', fr: 'Sélectionnez une conversation' } as T,
    selectConvHint: {
      en: "Pick a doctor's thread from the list to read it and reply directly.",
      fr: 'Choisissez un fil de praticien dans la liste pour le lire et répondre directement.',
    } as T,
    unknownDoctor: { en: 'Unknown doctor', fr: 'Praticien inconnu' } as T,
    back: { en: 'Back', fr: 'Retour' } as T,
    statusLabel: { en: 'Status', fr: 'Statut' } as T,
    priorityLabel: { en: 'Priority', fr: 'Priorité' } as T,
    markResolved: { en: 'Mark as resolved', fr: 'Marquer comme résolu' } as T,
    deleteConversation: { en: 'Delete conversation', fr: 'Supprimer la conversation' } as T,
    restore: { en: 'Restore', fr: 'Restaurer' } as T,
    convInTrashTitle: { en: 'This conversation is in trash.', fr: 'Cette conversation est dans la corbeille.' } as T,
    convInTrashHint: {
      en: 'Restore it to resume replies, or close this view.',
      fr: 'Restaurez-la pour reprendre les réponses ou fermez cette vue.',
    } as T,
    replyPlaceholder: { en: 'Reply to the doctor…', fr: 'Répondre au praticien…' } as T,
    convClosed: {
      en: 'Conversation is closed. Mark it Open to resume replies.',
      fr: 'La conversation est fermée. Repassez-la sur Ouvert pour reprendre les réponses.',
    } as T,
    deleteTitle: { en: 'Delete this conversation?', fr: 'Supprimer cette conversation ?' } as T,
    deleteBody: {
      en: 'The doctor will no longer be able to send messages to this thread, and it will move to Trash. You can restore it later if needed. Soft delete — messages and attachments stay on disk.',
      fr: 'Le praticien ne pourra plus envoyer de messages dans ce fil, qui sera placé dans la Corbeille. Vous pourrez le restaurer plus tard si besoin. Suppression douce — les messages et pièces jointes restent sur disque.',
    } as T,
    cancel: { en: 'Cancel', fr: 'Annuler' } as T,
    delete: { en: 'Delete', fr: 'Supprimer' } as T,
    attachmentAlt: { en: 'attachment', fr: 'pièce jointe' } as T,
    openAttachment: {
      en: 'Open {name} in full view',
      fr: 'Ouvrir {name} en plein écran',
    } as T,
    imageLoadError: { en: 'Could not load image', fr: 'Impossible de charger l’image' } as T,
    statusOpen: { en: 'open', fr: 'ouvert' } as T,
    statusPending: { en: 'pending', fr: 'en attente' } as T,
    statusResolved: { en: 'resolved', fr: 'résolu' } as T,
    statusClosed: { en: 'closed', fr: 'fermé' } as T,
    priorityLow: { en: 'low', fr: 'basse' } as T,
    priorityNormal: { en: 'normal', fr: 'normale' } as T,
    priorityHigh: { en: 'high', fr: 'haute' } as T,
    priorityUrgent: { en: 'urgent', fr: 'urgente' } as T,
    readMarker: { en: ' · read', fr: ' · lu' } as T,
  },

  orderEdit: {
    notFound: { en: 'Order not found or access is blocked.', fr: 'Commande introuvable ou accès bloqué.' } as T,
  },

  feeInvoicePage: {
    back: { en: 'Back to payments', fr: 'Retour aux paiements' } as T,
    title: { en: 'Treatment fee invoice', fr: 'Facture — Frais de traitement' } as T,
    subtitle: { en: 'Treatment-fee invoice preview.', fr: 'Aperçu de la facture des frais de traitement.' } as T,
    download: { en: 'Download PDF', fr: 'Télécharger le PDF' } as T,
    loading: { en: 'Loading invoice…', fr: 'Chargement de la facture…' } as T,
    loadError: {
      en: 'Could not load the treatment-fee invoice PDF.',
      fr: 'Impossible de charger le PDF de la facture des frais de traitement.',
    } as T,
    retry: { en: 'Retry', fr: 'Réessayer' } as T,
    previewTitle: { en: 'Invoice preview', fr: 'Aperçu de la facture' } as T,
  },

  // ─── Shared UI primitives (pickers, combobox, lightbox) ─────────
  uiBits: {
    select: { en: 'Select…', fr: 'Sélectionner…' } as T,
    search: { en: 'Search…', fr: 'Rechercher…' } as T,
    noMatches: { en: 'No matches', fr: 'Aucun résultat' } as T,
    pickCountry: { en: 'Pick a country', fr: 'Choisissez un pays' } as T,
    noCountriesMatch: { en: 'No countries match', fr: 'Aucun pays ne correspond' } as T,
    pickCity: { en: 'Pick a city', fr: 'Choisissez une ville' } as T,
    chooseCountryFirst: {
      en: 'Choose a country first',
      fr: 'Choisissez d’abord un pays',
    } as T,
    noCitiesMatch: {
      en: 'No matching cities — try a different spelling',
      fr: 'Aucune ville ne correspond — essayez une autre orthographe',
    } as T,
    pickCountryToSeeCities: {
      en: 'Pick a country to see cities',
      fr: 'Choisissez un pays pour voir les villes',
    } as T,
    searchCountry: { en: 'Search country', fr: 'Rechercher un pays' } as T,
    searchPlace: {
      en: 'Search clinic address or place',
      fr: 'Rechercher l’adresse du cabinet ou un lieu',
    } as T,
    noPlacesFound: {
      en: 'No matching places found.',
      fr: 'Aucun lieu correspondant trouvé.',
    } as T,
    cantSearchNow: {
      en: 'Unable to search places right now.',
      fr: 'Recherche de lieux momentanément indisponible.',
    } as T,
    locationSelected: { en: 'Location selected.', fr: 'Emplacement sélectionné.' } as T,
    placeSelected: { en: 'Place selected.', fr: 'Lieu sélectionné.' } as T,
    requestingLocation: {
      en: 'Requesting your location…',
      fr: 'Demande de votre position…',
    } as T,
    notProvided: { en: 'Not provided', fr: 'Non renseigné' } as T,
    closeImageViewer: {
      en: 'Close image viewer',
      fr: 'Fermer la visionneuse d’images',
    } as T,
    toggleSidebar: { en: 'Toggle Sidebar', fr: 'Basculer la barre latérale' } as T,
    close: { en: 'Close', fr: 'Fermer' } as T,
    clearSelection: { en: 'Clear selection', fr: 'Effacer la sélection' } as T,
    clearSearch: { en: 'Clear search', fr: 'Effacer la recherche' } as T,
    sidebarSrTitle: { en: 'Sidebar', fr: 'Barre latérale' } as T,
    sidebarSrDesc: {
      en: 'Displays the mobile sidebar.',
      fr: 'Affiche la barre latérale mobile.',
    } as T,
    // Odontogram IPR note — "Step" prefixes the aligner step number.
    iprStep: { en: 'Step', fr: 'Étape' } as T,
  },

  // ─── App chrome: sidebar nav + user menu ────────────────────────
  chrome: {
    nav: {
      dashboard: { en: 'Dashboard', fr: 'Tableau de bord' } as T,
      users: { en: 'Users', fr: 'Utilisateurs' } as T,
      patients: { en: 'Patients', fr: 'Patients' } as T,
      orders: { en: 'Orders', fr: 'Commandes' } as T,
      packs: { en: 'Packs', fr: 'Packs' } as T,
      pendingPayments: { en: 'Pending payments', fr: 'Paiements en attente' } as T,
      support: { en: 'Support', fr: 'Assistance' } as T,
      mediaManagement: { en: 'Media Management', fr: 'Gestion des médias' } as T,
      blog: { en: 'Blog', fr: 'Blog' } as T,
      community: { en: 'Community stories', fr: 'Témoignages' } as T,
      reports: { en: 'Reports', fr: 'Rapports' } as T,
      settings: { en: 'Settings', fr: 'Paramètres' } as T,
      paymentHistory: { en: 'Payment History', fr: 'Historique des paiements' } as T,
      invoices: { en: 'Invoices', fr: 'Factures' } as T,
      getHelp: { en: 'Get Help', fr: 'Obtenir de l’aide' } as T,
      newOrder: { en: 'New Order', fr: 'Nouvelle commande' } as T,
      newOrderAria: { en: 'Create a new order', fr: 'Créer une nouvelle commande' } as T,
      dashboardHomeAria: {
        en: 'Oralign — Dashboard home',
        fr: 'Oralign — Accueil du tableau de bord',
      } as T,
    },
    userMenu: {
      account: { en: 'Account', fr: 'Compte' } as T,
      billing: { en: 'Billing', fr: 'Facturation' } as T,
      notifications: { en: 'Notifications', fr: 'Notifications' } as T,
      logOut: { en: 'Log out', fr: 'Se déconnecter' } as T,
    },
  },

  // ─── Help / compliance hub (/dashboard/help) ────────────────────
  // The four documents required for online-payment validation, shown
  // as tabs. Company data is pulled from billing settings — never
  // hardcoded — via the shared legal-content builder.
  help: {
    title: { en: 'Help & legal information', fr: 'Aide et informations légales' } as T,
    subtitle: {
      en: 'About us, complaints & refunds, legal notice and terms of sale. Company details are managed in Billing settings.',
      fr: 'Qui sommes-nous, réclamations et remboursements, mentions légales et conditions de vente. Les informations société se gèrent dans les Paramètres de facturation.',
    } as T,
    loading: { en: 'Loading…', fr: 'Chargement…' } as T,
    editInSettings: {
      en: 'Edit company details in Billing settings',
      fr: 'Modifier les informations société dans les Paramètres de facturation',
    } as T,
    tabs: {
      about: { en: 'About us', fr: 'Qui sommes-nous' } as T,
      refunds: { en: 'Complaints & refunds', fr: 'Réclamations & remboursements' } as T,
      legal: { en: 'Legal notice', fr: 'Mentions légales' } as T,
      privacy: { en: 'Privacy policy', fr: 'Confidentialité' } as T,
      termsOfUse: { en: 'Terms of use', fr: 'CGU' } as T,
      terms: { en: 'Order terms', fr: 'Conditions de commande' } as T,
    },
  },

  // ─── Optimized media (variants, ZIP metadata, 3D previews) ──────
  media: {
    view3d: { en: 'View 3D', fr: 'Voir en 3D' } as T,
    loading3d: { en: 'Loading 3D viewer…', fr: 'Chargement de la vue 3D…' } as T,
    rendering3d: { en: 'Preparing the 3D model…', fr: 'Préparation du modèle 3D…' } as T,
    rendering3dHint: {
      en: 'Building the mesh — almost there.',
      fr: 'Construction du maillage — presque terminé.',
    } as T,
    loadingPercent: { en: '{percent}% downloaded', fr: '{percent} % téléchargé' } as T,
    loadingSizeUnknown: { en: 'Downloading…', fr: 'Téléchargement…' } as T,
    optimizing: { en: 'Optimizing…', fr: 'Optimisation…' } as T,
    notProvided: { en: 'Not provided', fr: 'Non fourni' } as T,
    uploadingPct: { en: 'Uploading… {pct}%', fr: 'Téléversement… {pct} %' } as T,
    preview: { en: 'Preview', fr: 'Aperçu' } as T,
    download: { en: 'Download', fr: 'Télécharger' } as T,
    zipArchive: { en: 'ZIP archive', fr: 'Archive ZIP' } as T,
    zipFiles: { en: '{count} files', fr: '{count} fichiers' } as T,
    zipUncompressed: { en: 'Uncompressed: {size}', fr: 'Décompressé : {size}' } as T,
    zipContents: { en: 'Contents', fr: 'Contenu' } as T,
    zipMore: { en: '+ {count} more…', fr: '+ {count} autres…' } as T,
    zipSuspicious: {
      en: 'This archive declares an unusually large content — handle with care.',
      fr: 'Cette archive déclare un contenu inhabituellement volumineux — à manipuler avec prudence.',
    } as T,
    zipNoPreview: {
      en: 'Archives are never opened in the browser — download to view.',
      fr: 'Les archives ne s’ouvrent jamais dans le navigateur — téléchargez pour consulter.',
    } as T,
    stlModel: { en: '3D model', fr: 'Modèle 3D' } as T,
    stlTriangles: { en: '{count} triangles', fr: '{count} triangles' } as T,
    // ── File card actions + states (order files) ────────────────────
    view: { en: 'View', fr: 'Voir' } as T,
    retry: { en: 'Retry', fr: 'Réessayer' } as T,
    fullView: { en: 'Full View', fr: 'Plein écran' } as T,
    replace: { en: 'Replace', fr: 'Remplacer' } as T,
    upload: { en: 'Upload', fr: 'Téléverser' } as T,
    previewUnavailable: { en: 'Preview unavailable', fr: 'Aperçu indisponible' } as T,
    unableToLoadPreview: { en: 'Unable to load preview', fr: 'Impossible de charger l’aperçu' } as T,
    unableToLoadStl: { en: 'Unable to load STL', fr: 'Impossible de charger le STL' } as T,
    noFilesYet: { en: 'No files uploaded yet.', fr: 'Aucun fichier téléversé pour le moment.' } as T,
    filesLoadFailed: { en: 'Failed to load files: {message}', fr: 'Échec du chargement des fichiers : {message}' } as T,
    maxZipHint: {
      en: 'Max 1 GB per ZIP bundle (CBCT / DICOM)',
      fr: 'Max 1 Go par archive ZIP (CBCT / DICOM)',
    } as T,
    maxScanHint: {
      en: 'Max 1 GB per 3D scan (STL / PLY / OBJ)',
      fr: 'Max 1 Go par scan 3D (STL / PLY / OBJ)',
    } as T,
    maxFileHint: { en: 'Max 50 MB per file', fr: 'Max 50 Mo par fichier' } as T,
    // ── Chunked / resumable upload (large CBCT ZIPs) ──────────────
    chunked: {
      preparing: { en: 'Preparing upload…', fr: 'Préparation du téléversement…' } as T,
      uploading: { en: 'Uploading in segments — you can stay on this page', fr: 'Téléversement par segments — vous pouvez rester sur cette page' } as T,
      finalizing: { en: 'Assembling and checking the file…', fr: 'Assemblage et vérification du fichier…' } as T,
      done: { en: 'Upload complete', fr: 'Téléversement terminé' } as T,
      failed: {
        en: 'Upload interrupted. Your progress is saved — resume when ready.',
        fr: 'Téléversement interrompu. Votre progression est enregistrée — reprenez quand vous êtes prêt.',
      } as T,
      resume: { en: 'Resume upload', fr: 'Reprendre le téléversement' } as T,
      tooBig: {
        en: '"{name}" exceeds the 1 GB ZIP limit.',
        fr: '« {name} » dépasse la limite de 1 Go par ZIP.',
      } as T,
    },
    pasteImage: { en: 'Paste image', fr: 'Coller l’image' } as T,
    pasteOver: { en: 'Paste over', fr: 'Coller par-dessus' } as T,
    copy: { en: 'Copy', fr: 'Copier' } as T,
    rotateTooltip: {
      en: 'Rotate or flip the uploaded photo',
      fr: 'Pivoter ou retourner la photo téléversée',
    } as T,
    copyTooltip: {
      en: 'Copy {title} so you can paste it into another slot',
      fr: 'Copier {title} pour le coller dans un autre emplacement',
    } as T,
    pasteTooltip: {
      en: 'Paste the image copied from "{source}"',
      fr: 'Coller l’image copiée depuis « {source} »',
    } as T,
    noStlSelected: { en: 'No STL selected', fr: 'Aucun STL sélectionné' } as T,
    uploadThisStl: { en: 'Upload this STL file', fr: 'Téléverser ce fichier STL' } as T,
    stlFormats: { en: 'STL, PLY, or OBJ', fr: 'STL, PLY ou OBJ' } as T,
    closeHint: {
      en: 'Click outside or press Esc to close',
      fr: 'Cliquez à l’extérieur ou appuyez sur Échap pour fermer',
    } as T,
    closePreview: { en: 'Close preview', fr: 'Fermer l’aperçu' } as T,
    modelBadge: { en: '{ext} model', fr: 'Modèle {ext}' } as T,
    saveDraftFirst: {
      en: 'Save the draft before uploading files',
      fr: 'Enregistrez le brouillon avant de téléverser des fichiers',
    } as T,
    saveDraftFirstDetail: {
      en: 'Files are stored after an order ID exists. Click Continue from the patient step or use Save Draft.',
      fr: 'Les fichiers sont enregistrés une fois la commande créée. Cliquez sur Continuer depuis l’étape patient ou utilisez Enregistrer le brouillon.',
    } as T,
    downloadInstead: { en: 'Download instead', fr: 'Télécharger à la place' } as T,
    dragHint: {
      en: 'Drag to rotate · Scroll to zoom',
      fr: 'Faites glisser pour pivoter · Molette pour zoomer',
    } as T,
    zipAction: {
      uploadedBundleTitle: {
        en: 'Uploaded bundle (.zip) or CBCT (.dcm)',
        fr: 'Archive téléversée (.zip) ou CBCT (.dcm)',
      } as T,
      uploadedBundleDesc: {
        en: 'CBCT volumes and STL / DICOM bundles shipped with this order.',
        fr: 'Volumes CBCT et archives STL / DICOM joints à cette commande.',
      } as T,
      chooseZip: { en: 'Choose ZIP…', fr: 'Choisir un ZIP…' } as T,
      singleDcm: { en: 'Single .dcm', fr: 'Fichier .dcm seul' } as T,
      uploadingFile: { en: 'Uploading {name}', fr: 'Téléversement de {name}' } as T,
      finalising: { en: '· finalising on server…', fr: '· finalisation sur le serveur…' } as T,
      bundleCountOne: { en: '1 bundle file uploaded', fr: '1 fichier d’archive téléversé' } as T,
      bundleCountMany: {
        en: '{count} bundle files uploaded',
        fr: '{count} fichiers d’archive téléversés',
      } as T,
      zipBadge: { en: 'ZIP bundle', fr: 'Archive ZIP' } as T,
      downloadAria: { en: 'Download {name}', fr: 'Télécharger {name}' } as T,
      deleteAria: { en: 'Delete {name}', fr: 'Supprimer {name}' } as T,
      deleteBundleTitle: { en: 'Delete this bundle?', fr: 'Supprimer cette archive ?' } as T,
      deleteBundleDesc: {
        en: 'will be removed from this order. The file is soft-deleted on the server and can be restored by an admin if needed.',
        fr: 'sera retiré de cette commande. Le fichier est supprimé de façon réversible sur le serveur et peut être restauré par un administrateur si nécessaire.',
      } as T,
      deleteFile: { en: 'Delete file', fr: 'Supprimer le fichier' } as T,
      // Freeform bundle uploader (the generic OrderFileUpload, distinct
      // from the localized clinical slots which pass their own titleKey).
      freeformTitle: {
        en: 'Upload a ZIP / CBCT bundle — or any file',
        fr: 'Téléverser une archive ZIP / CBCT — ou tout fichier',
      } as T,
      freeformDesc: {
        en: 'Ship a single ZIP archive (e.g. a CBCT DICOM volume, or a multi-file STL export), or attach files of any type. Every file is scanned for scripts/executables and unsafe names before saving — those are refused.',
        fr: 'Envoyez une seule archive ZIP (p. ex. un volume CBCT DICOM ou un export STL multi-fichiers), ou joignez des fichiers de tout type. Chaque fichier est analysé à la recherche de scripts/exécutables et de noms dangereux avant l’enregistrement — ceux-ci sont refusés.',
      } as T,
      // ── One-to-many staged uploader (one .zip OR several loose files) ──
      chooseFiles: { en: 'Choose files…', fr: 'Choisir des fichiers…' } as T,
      pickerHint: {
        en: 'One ZIP archive, or one or more files of any type. Scripts and programs are blocked.',
        fr: 'Une archive ZIP, ou un ou plusieurs fichiers de tout type. Les scripts et programmes sont bloqués.',
      } as T,
      stagedTitle: { en: 'Ready to upload', fr: 'Prêt à téléverser' } as T,
      addMore: { en: 'Add more', fr: 'Ajouter' } as T,
      upload: { en: 'Upload', fr: 'Téléverser' } as T,
      uploadCount: {
        en: 'Upload {count} file(s)',
        fr: 'Téléverser {count} fichier(s)',
      } as T,
      clearStaged: { en: 'Clear', fr: 'Vider' } as T,
      removeAria: { en: 'Remove {name}', fr: 'Retirer {name}' } as T,
      statusQueued: { en: 'Queued', fr: 'En attente' } as T,
      statusUploading: { en: 'Uploading…', fr: 'Téléversement…' } as T,
      dicomBadge: { en: 'DICOM', fr: 'DICOM' } as T,
      uploadingBatch: {
        en: 'Uploading {count} file(s)…',
        fr: 'Téléversement de {count} fichier(s)…',
      } as T,
      fileBadge: { en: 'File', fr: 'Fichier' } as T,
      mixError: {
        en: 'Upload either one ZIP archive or loose files — not both at once.',
        fr: 'Téléversez soit une archive ZIP, soit des fichiers individuels — pas les deux en même temps.',
      } as T,
      oneZipReplaced: {
        en: 'Only one ZIP archive can be uploaded at a time — keeping the latest.',
        fr: 'Une seule archive ZIP peut être téléversée à la fois — la plus récente est conservée.',
      } as T,
      removeZipFirst: {
        en: 'Remove the staged ZIP archive first to add other files.',
        fr: 'Retirez d’abord l’archive ZIP en attente pour ajouter d’autres fichiers.',
      } as T,
      invalidSkipped: {
        en: 'Unsupported file(s) skipped: {names}. Only .zip and .dcm are allowed.',
        fr: 'Fichier(s) non pris en charge ignoré(s) : {names}. Seuls .zip et .dcm sont autorisés.',
      } as T,
      // ── Content-security pre-check (client-side; the server re-validates) ──
      security: {
        checking: {
          en: 'Checking files for security…',
          fr: 'Vérification de sécurité des fichiers…',
        } as T,
        blockedTitle: {
          en: 'Blocked for security',
          fr: 'Bloqué pour raison de sécurité',
        } as T,
        executable: {
          en: '"{name}" was blocked: it looks like a program/executable, not a scan.',
          fr: '« {name} » a été bloqué : il ressemble à un programme/exécutable, pas à un examen.',
        } as T,
        script: {
          en: '"{name}" was blocked: it contains script/code and cannot be uploaded.',
          fr: '« {name} » a été bloqué : il contient du script/code et ne peut pas être téléversé.',
        } as T,
        mismatch: {
          en: '"{name}" was blocked: its contents do not match a real ZIP archive.',
          fr: '« {name} » a été bloqué : son contenu ne correspond pas à une véritable archive ZIP.',
        } as T,
        blockedType: {
          en: '"{name}" was blocked: scripts and programs cannot be uploaded.',
          fr: '« {name} » a été bloqué : les scripts et programmes ne peuvent pas être téléversés.',
        } as T,
        verifiedBadge: { en: 'Security-checked', fr: 'Vérifié' } as T,
      },
    },
    categories: {
      rightPhoto: { en: 'Right photo', fr: 'Photo droite' } as T,
      frontPhoto: { en: 'Front photo', fr: 'Photo de face' } as T,
      leftPhoto: { en: 'Left photo', fr: 'Photo gauche' } as T,
      upperPhoto: { en: 'Upper photo', fr: 'Photo supérieure' } as T,
      lowerPhoto: { en: 'Lower photo', fr: 'Photo inférieure' } as T,
      opg: { en: 'Orthopantomography', fr: 'Orthopantomogramme' } as T,
      stl: { en: 'STL', fr: 'STL' } as T,
      ply: { en: 'PLY', fr: 'PLY' } as T,
      obj: { en: 'OBJ', fr: 'OBJ' } as T,
      zip: { en: 'ZIP', fr: 'ZIP' } as T,
      pdf: { en: 'PDF', fr: 'PDF' } as T,
      images: { en: 'Images', fr: 'Images' } as T,
      videos: { en: 'Videos', fr: 'Vidéos' } as T,
      other: { en: 'Other', fr: 'Autre' } as T,
    },
    toasts: {
      onlyImagesEditable: {
        en: 'Only images can be rotated or flipped.',
        fr: 'Seules les images peuvent être pivotées ou retournées.',
      } as T,
      editorOpenFailed: {
        en: 'Could not open the editor for this image.',
        fr: 'Impossible d’ouvrir l’éditeur pour cette image.',
      } as T,
      copyFailed: {
        en: 'Could not copy this image.',
        fr: 'Impossible de copier cette image.',
      } as T,
      copied: {
        en: 'Copied "{title}" — pick a slot and paste it.',
        fr: '« {title} » copié — choisissez un emplacement et collez-le.',
      } as T,
      pasted: {
        en: 'Pasted from "{source}" → "{target}".',
        fr: 'Collé depuis « {source} » vers « {target} ».',
      } as T,
    },
  },

  // ─── Toast messages (src/lib/hooks/*) ───────────────────────────
  toasts: {
    account: {
      profileUpdated: { en: 'Profile updated successfully.', fr: 'Profil mis à jour.' } as T,
      clinicUpdated: { en: 'Clinic details updated.', fr: 'Informations du cabinet mises à jour.' } as T,
    },
    blog: {
      created: { en: 'Article created.', fr: 'Article créé.' } as T,
      updated: { en: 'Article updated.', fr: 'Article mis à jour.' } as T,
      deleted: { en: 'Article deleted.', fr: 'Article supprimé.' } as T,
      published: { en: 'Article published.', fr: 'Article publié.' } as T,
      unpublished: { en: 'Article unpublished.', fr: 'Article dépublié.' } as T,
      archived: { en: 'Article archived.', fr: 'Article archivé.' } as T,
      restored: { en: 'Article restored.', fr: 'Article restauré.' } as T,
      permanentlyDeleted: {
        en: 'Article permanently deleted.',
        fr: 'Article supprimé définitivement.',
      } as T,
      imageUploaded: { en: 'Image uploaded.', fr: 'Image téléversée.' } as T,
      error: {
        en: 'Something went wrong with the article. Please try again.',
        fr: 'Une erreur est survenue avec l’article. Veuillez réessayer.',
      } as T,
    },
    auth: {
      accountCreated: {
        en: 'Account created! Please verify your email.',
        fr: 'Compte créé ! Veuillez vérifier votre e-mail.',
      } as T,
      signUpFailed: { en: 'Failed to create account', fr: 'Échec de la création du compte' } as T,
      loggedIn: { en: 'Logged in successfully!', fr: 'Connexion réussie !' } as T,
      invalidCredentials: { en: 'Invalid credentials', fr: 'Identifiants invalides' } as T,
      emailVerified: { en: 'Email verified successfully!', fr: 'E-mail vérifié avec succès !' } as T,
      verifyEmailFailed: { en: 'Failed to verify email', fr: 'Échec de la vérification de l’e-mail' } as T,
      codeResent: {
        en: 'A new verification code has been sent to your email.',
        fr: 'Un nouveau code de vérification a été envoyé à votre adresse e-mail.',
      } as T,
      resendCodeFailed: { en: 'Failed to resend code', fr: 'Échec du renvoi du code' } as T,
      resetLinkSent: {
        en: 'If that email exists, a reset link has been sent. Check your inbox.',
        fr: 'Si cette adresse existe, un lien de réinitialisation a été envoyé. Vérifiez votre boîte de réception.',
      } as T,
      resetEmailFailed: {
        en: 'Failed to send reset email',
        fr: 'Échec de l’envoi de l’e-mail de réinitialisation',
      } as T,
      passwordReset: { en: 'Password reset successfully!', fr: 'Mot de passe réinitialisé avec succès !' } as T,
      resetPasswordFailed: {
        en: 'Failed to reset password',
        fr: 'Échec de la réinitialisation du mot de passe',
      } as T,
      passwordChanged: { en: 'Password changed successfully!', fr: 'Mot de passe modifié avec succès !' } as T,
      changePasswordFailed: {
        en: 'Failed to change password',
        fr: 'Échec de la modification du mot de passe',
      } as T,
      loggedOut: { en: 'Logged out successfully', fr: 'Déconnexion réussie' } as T,
    },
    companyBilling: {
      settingsSaved: {
        en: 'Company billing settings saved.',
        fr: 'Paramètres de facturation enregistrés.',
      } as T,
      logoUploaded: { en: 'Logo uploaded.', fr: 'Logo téléversé.' } as T,
      logoRemoved: { en: 'Logo removed.', fr: 'Logo supprimé.' } as T,
    },
    dentistProfiles: {
      deleted: { en: 'Profile deleted successfully!', fr: 'Profil supprimé.' } as T,
    },
    notifications: {
      markedRead: {
        en: 'Marked {count} as read.',
        fr: '{count} notification(s) marquée(s) comme lue(s).',
      } as T,
    },
    orders: {
      draftSaved: { en: 'Order draft saved', fr: 'Brouillon de commande enregistré' } as T,
      updated: { en: 'Order updated', fr: 'Commande mise à jour' } as T,
      submitted: { en: 'Order submitted', fr: 'Commande envoyée' } as T,
      bankTransferRecorded: {
        en: 'Bank-transfer payment recorded. Upload your receipt next.',
        fr: 'Paiement par virement bancaire enregistré. Téléversez maintenant votre reçu.',
      } as T,
      treatmentFeePaid: { en: 'Treatment fee paid', fr: 'Honoraires de traitement payés' } as T,
      receiptUploaded: {
        en: 'Receipt uploaded. An admin will confirm once funds land.',
        fr: 'Reçu téléversé. Un administrateur confirmera dès réception des fonds.',
      } as T,
      bankTransferConfirmed: { en: 'Bank transfer confirmed', fr: 'Virement bancaire confirmé' } as T,
      statusUpdated: { en: 'Order status updated.', fr: 'Statut de la commande mis à jour.' } as T,
      deleted: { en: 'Order deleted', fr: 'Commande supprimée' } as T,
      permanentlyDeleted: { en: 'Order permanently deleted', fr: 'Commande supprimée définitivement' } as T,
      restored: { en: 'Order restored', fr: 'Commande restaurée' } as T,
      bulkNoChange: {
        en: 'No orders changed — already at the requested status.',
        fr: 'Aucune commande modifiée — déjà au statut demandé.',
      } as T,
      bulkUpdated: { en: '{count} order(s) updated.', fr: '{count} commande(s) mise(s) à jour.' } as T,
      bulkUpdatedSkipped: {
        en: '{count} order(s) updated · {skipped} skipped.',
        fr: '{count} commande(s) mise(s) à jour · {skipped} ignorée(s).',
      } as T,
      bulkDeleted: { en: '{count} order(s) deleted.', fr: '{count} commande(s) supprimée(s).' } as T,
      bulkDeletedSkipped: {
        en: '{count} order(s) deleted · {skipped} skipped.',
        fr: '{count} commande(s) supprimée(s) · {skipped} ignorée(s).',
      } as T,
      bulkRestored: { en: '{count} order(s) restored.', fr: '{count} commande(s) restaurée(s).' } as T,
      bulkRestoredSkipped: {
        en: '{count} order(s) restored · {skipped} skipped.',
        fr: '{count} commande(s) restaurée(s) · {skipped} ignorée(s).',
      } as T,
      bulkPermanentlyDeleted: {
        en: '{count} order(s) permanently deleted.',
        fr: '{count} commande(s) supprimée(s) définitivement.',
      } as T,
      bulkPermanentlyDeletedSkipped: {
        en: '{count} order(s) permanently deleted · {skipped} skipped.',
        fr: '{count} commande(s) supprimée(s) définitivement · {skipped} ignorée(s).',
      } as T,
      odontogramSaved: { en: 'Odontogram saved', fr: 'Odontogramme enregistré' } as T,
      filesUploaded: { en: 'Files uploaded', fr: 'Fichiers téléversés' } as T,
      uploadConnectionLost: {
        en: 'Upload failed — connection lost or too slow. Try again with a stable internet connection.',
        fr: 'Échec du téléversement — connexion perdue ou trop lente. Réessayez avec une connexion internet stable.',
      } as T,
      uploadTooLarge: {
        en: 'File is larger than the 1 GB upload limit. Compress further or split the volume.',
        fr: 'Le fichier dépasse la limite de téléversement de 1 Go. Compressez-le davantage ou divisez le volume.',
      } as T,
      fileDeleted: { en: 'File deleted', fr: 'Fichier supprimé' } as T,
    },
    packs: {
      created: { en: 'Pack created.', fr: 'Forfait créé.' } as T,
      updated: { en: 'Pack updated.', fr: 'Forfait mis à jour.' } as T,
      deleted: { en: 'Pack deleted.', fr: 'Forfait supprimé.' } as T,
      permanentlyDeleted: { en: 'Pack permanently deleted.', fr: 'Forfait supprimé définitivement.' } as T,
      restored: { en: 'Pack restored.', fr: 'Forfait restauré.' } as T,
      activated: { en: 'Pack activated.', fr: 'Forfait activé.' } as T,
      deactivated: { en: 'Pack deactivated.', fr: 'Forfait désactivé.' } as T,
      priceAdded: { en: 'Price added.', fr: 'Tarif ajouté.' } as T,
      priceUpdated: { en: 'Price updated.', fr: 'Tarif mis à jour.' } as T,
      priceArchived: { en: 'Price archived.', fr: 'Tarif archivé.' } as T,
    },
    patients: {
      created: { en: 'Patient created successfully', fr: 'Patient créé' } as T,
      updated: { en: 'Patient updated successfully', fr: 'Patient mis à jour' } as T,
      deleted: { en: 'Patient deleted successfully', fr: 'Patient supprimé' } as T,
      permanentlyDeleted: { en: 'Patient permanently deleted', fr: 'Patient supprimé définitivement' } as T,
      restored: { en: 'Patient restored', fr: 'Patient restauré' } as T,
      bulkDeleted: { en: '{count} patient(s) deleted', fr: '{count} patient(s) supprimé(s)' } as T,
    },
    payments: {
      invoiceNumberUpdated: { en: 'Invoice number updated.', fr: 'Numéro de facture mis à jour.' } as T,
      paymentSuccess: { en: 'Payment successful.', fr: 'Paiement effectué.' } as T,
      paymentPending: {
        en: 'Payment pending — we will confirm shortly.',
        fr: 'Paiement en attente — nous le confirmerons sous peu.',
      } as T,
      paymentFailed: { en: 'Payment failed. Please try again.', fr: 'Échec du paiement. Veuillez réessayer.' } as T,
      bankTransferDeclared: {
        en: 'Bank transfer declared. An admin will confirm it shortly.',
        fr: 'Virement bancaire déclaré. Un administrateur le confirmera sous peu.',
      } as T,
      bankTransferConfirmed: { en: 'Bank transfer confirmed.', fr: 'Virement bancaire confirmé.' } as T,
      bankTransferRejected: { en: 'Bank transfer rejected.', fr: 'Virement bancaire rejeté.' } as T,
      cashRecorded: { en: 'Cash payment recorded.', fr: 'Paiement en espèces enregistré.' } as T,
    },
    quotationPaymentPlan: {
      packAttached: { en: 'Pack attached to quotation.', fr: 'Forfait associé au devis.' } as T,
      planConfigured: { en: 'Payment plan configured.', fr: 'Plan de paiement configuré.' } as T,
      batchDelivered: { en: 'Batch marked as delivered.', fr: 'Lot marqué comme livré.' } as T,
    },
    quotations: {
      draftCreated: { en: 'Quotation draft created.', fr: 'Brouillon de devis créé.' } as T,
      updated: { en: 'Quotation updated.', fr: 'Devis mis à jour.' } as T,
      sent: { en: 'Quotation sent to the doctor.', fr: 'Devis envoyé au praticien.' } as T,
      pdfGenerated: { en: 'Quotation PDF generated.', fr: 'PDF du devis généré.' } as T,
      canceled: {
        en: 'Quotation canceled. You can issue a new one now.',
        fr: 'Devis annulé. Vous pouvez en émettre un nouveau.',
      } as T,
      recalled: {
        en: 'Quote recalled to draft. Edit it and resend.',
        fr: 'Devis rappelé en brouillon. Modifiez-le et renvoyez-le.',
      } as T,
      approved: { en: 'Quotation approved.', fr: 'Devis approuvé.' } as T,
      rejected: { en: 'Quotation rejected.', fr: 'Devis rejeté.' } as T,
    },
    reports: {
      exported: { en: 'Report exported.', fr: 'Rapport exporté.' } as T,
    },
    sliderMedia: {
      added: { en: 'Slide added.', fr: 'Diapositive ajoutée.' } as T,
      updated: { en: 'Slide updated.', fr: 'Diapositive mise à jour.' } as T,
      activated: { en: 'Slide activated.', fr: 'Diapositive activée.' } as T,
      deactivated: { en: 'Slide deactivated.', fr: 'Diapositive désactivée.' } as T,
      reordered: { en: 'Order updated.', fr: 'Ordre mis à jour.' } as T,
      trashed: { en: 'Slide moved to trash.', fr: 'Diapositive placée dans la corbeille.' } as T,
      restored: { en: 'Slide restored.', fr: 'Diapositive restaurée.' } as T,
    },
    support: {
      opened: { en: 'Support conversation opened.', fr: 'Conversation de support ouverte.' } as T,
      statusChanged: { en: 'Conversation marked {status}.', fr: 'Conversation marquée {status}.' } as T,
      status: {
        open: { en: 'open', fr: 'ouverte' } as T,
        pending: { en: 'pending', fr: 'en attente' } as T,
        resolved: { en: 'resolved', fr: 'résolue' } as T,
        closed: { en: 'closed', fr: 'fermée' } as T,
      },
      prioritySet: { en: 'Priority set to {priority}.', fr: 'Priorité définie sur {priority}.' } as T,
      priority: {
        low: { en: 'low', fr: 'basse' } as T,
        normal: { en: 'normal', fr: 'normale' } as T,
        high: { en: 'high', fr: 'haute' } as T,
        urgent: { en: 'urgent', fr: 'urgente' } as T,
      },
      trashed: { en: 'Conversation moved to trash.', fr: 'Conversation placée dans la corbeille.' } as T,
      restored: { en: 'Conversation restored.', fr: 'Conversation restaurée.' } as T,
    },
    treatmentPlans: {
      created: { en: '{name} created.', fr: '{name} créé.' } as T,
      viewerUrlSaved: {
        en: 'Treatment viewer URL saved.',
        fr: 'URL de la visionneuse de traitement enregistrée.',
      } as T,
      readyNewVersion: {
        en: '{name} created and marked ready (replaces the rejected plan).',
        fr: '{name} créé et marqué prêt (remplace le plan rejeté).',
      } as T,
      draftNewVersion: {
        en: '{name} created as an editable draft. Review it, then mark it ready for the doctor.',
        fr: '{name} créé comme brouillon modifiable. Vérifiez-le, puis marquez-le prêt pour le praticien.',
      } as T,
      markedReady: {
        en: 'Plan marked ready for doctor review.',
        fr: 'Plan marqué prêt pour validation par le praticien.',
      } as T,
      approved: { en: 'Treatment plan approved.', fr: 'Plan de traitement approuvé.' } as T,
      rejected: {
        en: 'Treatment plan rejected. Replanning requested.',
        fr: 'Plan de traitement rejeté. Replanification demandée.',
      } as T,
      movementImageUploaded: {
        en: 'Movement table image uploaded.',
        fr: 'Image du tableau des mouvements téléversée.',
      } as T,
      movementImageRemoved: {
        en: 'Movement table image removed.',
        fr: 'Image du tableau des mouvements supprimée.',
      } as T,
      dentalImageUploaded: {
        en: 'Dental treatment table image uploaded.',
        fr: 'Image du tableau de traitement dentaire téléversée.',
      } as T,
      dentalImageRemoved: {
        en: 'Dental treatment table image removed.',
        fr: 'Image du tableau de traitement dentaire supprimée.',
      } as T,
      publicLinkGenerated: {
        en: 'Public viewer link generated.',
        fr: 'Lien public de la visionneuse généré.',
      } as T,
    },
    users: {
      created: { en: 'User created successfully!', fr: 'Utilisateur créé.' } as T,
      deleted: { en: 'User deleted successfully!', fr: 'Utilisateur supprimé.' } as T,
      restored: { en: 'User restored successfully!', fr: 'Utilisateur restauré.' } as T,
      permanentlyDeleted: { en: 'User permanently deleted!', fr: 'Utilisateur supprimé définitivement.' } as T,
      approved: { en: 'User approved.', fr: 'Utilisateur approuvé.' } as T,
      rejected: { en: 'User rejected.', fr: 'Utilisateur rejeté.' } as T,
      setPending: { en: 'User set to pending.', fr: 'Utilisateur remis en attente.' } as T,
    },
    workingHours: {
      deleted: { en: 'Working hours deleted.', fr: 'Horaires de travail supprimés.' } as T,
    },
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

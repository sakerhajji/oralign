import type { Lang } from './dict';

type T = Record<Lang, string>;

/**
 * Patient forms (phone with country), order-wizard metadata labels, native gift note/detail texts —
 * spread into dict (`...patientDeskDomainDict`) by the main dictionary.
 * Same leaf shape as dict.ts: every leaf is `{ en, fr } as T`.
 */
export const patientDeskDomainDict = {
  patientDesk: {
    // components/ui/phone-input.tsx — country picker
    phone: {
      searchNotFound: { en: 'No country found', fr: 'Aucun pays trouvé' } as T,
    },
    // createPatientSchema messages are these keys; the patient sheet and
    // the order wizard's inline form translate them where they render.
    validation: {
      fullName: {
        en: 'Patient name must be at least 2 characters.',
        fr: 'Le nom du patient doit contenir au moins 2 caractères.',
      } as T,
      email: { en: 'Invalid email address.', fr: 'Adresse e-mail invalide.' } as T,
      phone: {
        en: 'Enter a complete phone number with its country code (e.g. +216 22 123 456).',
        fr: 'Saisissez un numéro complet avec son indicatif (ex. +216 22 123 456).',
      } as T,
      otherDetail: {
        en: 'The detail must be 500 characters or fewer.',
        fr: 'Le détail doit contenir 500 caractères au maximum.',
      } as T,
    },
    // Order wizard, review step — "Order metadata" section
    wizardMeta: {
      status: { en: 'Status', fr: 'Statut' } as T,
      draftNotSaved: { en: 'Draft not saved yet', fr: 'Brouillon non enregistré' } as T,
    },

    // ─── Patients page (app/dashboard/patients, components/patients) ───
    title: { en: 'Patients', fr: 'Patients' } as T,
    gender: {
      female: { en: 'Female', fr: 'Femme' } as T,
      male: { en: 'Male', fr: 'Homme' } as T,
      other: { en: 'Other', fr: 'Autre' } as T,
    },
    // View tabs: the whole book, by case state, and the admins' trash
    views: {
      all: { en: 'All', fr: 'Tous' } as T,
      active: { en: 'Active cases', fr: 'Cas en cours' } as T,
      none: { en: 'No order yet', fr: 'Sans commande' } as T,
      trash: { en: 'Trash', fr: 'Corbeille' } as T,
    },
    filters: {
      // Short enough for a phone's search box (same register as the Users page).
      searchPh: {
        en: 'Name, phone, email or order code…',
        fr: 'Nom, tél., e-mail ou code commande…',
      } as T,
      searchAria: { en: 'Search patients', fr: 'Rechercher des patients' } as T,
      period: { en: 'Date added', fr: 'Date d’ajout' } as T,
      periodAll: { en: 'Any date', fr: 'Toutes dates' } as T,
      period7d: { en: 'Added: 7 days', fr: 'Ajout : 7 jours' } as T,
      period30d: { en: 'Added: 30 days', fr: 'Ajout : 30 jours' } as T,
      period12m: { en: 'Added: 12 months', fr: 'Ajout : 12 mois' } as T,
      // Opens the "Du / Au" fields under the toolbar.
      periodCustom: { en: 'Custom dates…', fr: 'Dates personnalisées…' } as T,
      // The chip once a custom period is applied: its days.
      periodRange: { en: 'Added: {range}', fr: 'Ajout : {range}' } as T,
      gender: { en: 'Sex', fr: 'Sexe' } as T,
      genderAll: { en: 'All', fr: 'Tous' } as T,
      dentist: { en: 'Dentist', fr: 'Praticien' } as T,
      dentistAll: { en: 'All dentists', fr: 'Tous les praticiens' } as T,
      clear: { en: 'Clear filters', fr: 'Effacer les filtres' } as T,
    },
    sort: {
      label: { en: 'Sort', fr: 'Trier' } as T,
      recent: { en: 'Newest first', fr: 'Plus récents' } as T,
      oldest: { en: 'Oldest first', fr: 'Plus anciens' } as T,
      name: { en: 'Name A–Z', fr: 'Nom A–Z' } as T,
      nameDesc: { en: 'Name Z–A', fr: 'Nom Z–A' } as T,
      updated: { en: 'Recently updated', fr: 'Modifiés récemment' } as T,
    },
    list: {
      colPatient: { en: 'Patient', fr: 'Patient' } as T,
      colContact: { en: 'Contact', fr: 'Contact' } as T,
      colRecord: { en: 'Current case', fr: 'Cas actuel' } as T,
      colDentist: { en: 'Dentist', fr: 'Praticien' } as T,
      colAdded: { en: 'Added', fr: 'Ajouté le' } as T,
      colTrashed: { en: 'Trashed', fr: 'Mis à la corbeille' } as T,
      colActions: { en: 'Actions', fr: 'Actions' } as T,
      selectPageAria: {
        en: 'Select the patients on this page',
        fr: 'Sélectionner les patients de cette page',
      } as T,
      selectAria: { en: 'Select {name}', fr: 'Sélectionner {name}' } as T,
      actionsAria: { en: 'Actions for {name}', fr: 'Actions pour {name}' } as T,
      age: { en: '{age} years', fr: '{age} ans' } as T,
      noOrder: { en: 'No order yet', fr: 'Aucune commande' } as T,
      ordersMany: { en: '{count} orders', fr: '{count} commandes' } as T,
    },
    actions: {
      newPatient: { en: 'New patient', fr: 'Nouveau patient' } as T,
      newOrder: { en: 'New order', fr: 'Nouvelle commande' } as T,
      edit: { en: 'Edit', fr: 'Modifier' } as T,
      trash: { en: 'Move to trash', fr: 'Mettre à la corbeille' } as T,
      trashBlocked: {
        en: 'Has orders: trash them first',
        fr: 'A des commandes : mettez-les d’abord à la corbeille',
      } as T,
      restore: { en: 'Restore', fr: 'Restaurer' } as T,
      deletePermanently: { en: 'Delete permanently', fr: 'Supprimer définitivement' } as T,
    },
    panel: {
      // The phone sheet's centred heading (the patient's name heads the first card).
      title: { en: 'Patient details', fr: 'Fiche patient' } as T,
      noFacts: { en:'Age and sex not recorded', fr: 'Âge et sexe non renseignés' } as T,
      inTrashSince: {
        en: 'In the trash since {date}',
        fr: 'Dans la corbeille depuis le {date}',
      } as T,
      orders: { en: 'Orders', fr: 'Commandes' } as T,
      ordersError: {
        en: 'Couldn’t load the orders.',
        fr: 'Impossible de charger les commandes.',
      } as T,
      retry: { en: 'Retry', fr: 'Réessayer' } as T,
      noOrders: { en: 'No order for this patient yet.', fr: 'Aucune commande pour ce patient.' } as T,
      orderCreated: { en: 'Created {date}', fr: 'Créée le {date}' } as T,
      contact: { en: 'Contact', fr: 'Coordonnées' } as T,
      phone: { en: 'Phone', fr: 'Téléphone' } as T,
      email: { en: 'Email', fr: 'E-mail' } as T,
      address: { en: 'Address', fr: 'Adresse' } as T,
      profile: { en: 'Profile', fr: 'Profil' } as T,
      dateOfBirth: { en: 'Date of birth', fr: 'Date de naissance' } as T,
      dateOfBirthWithAge: { en: '{date} · {age} years', fr: '{date} · {age} ans' } as T,
      gender: { en: 'Sex', fr: 'Sexe' } as T,
      dentist: { en: 'Dentist', fr: 'Praticien' } as T,
      added: { en: 'Added', fr: 'Ajouté le' } as T,
      updated: { en: 'Last updated', fr: 'Modifié le' } as T,
      clinical: { en: 'Clinical conditions', fr: 'Affections cliniques' } as T,
      noConditions: { en: 'No condition recorded.', fr: 'Aucune affection renseignée.' } as T,
      notes: { en: 'Internal notes', fr: 'Notes internes' } as T,
      noNotes: { en: 'No notes.', fr: 'Aucune note.' } as T,
      trashHintAdmin: {
        en: 'The patient leaves the lists and can be restored from the trash.',
        fr: 'Le patient quitte les listes et reste restaurable depuis la corbeille.',
      } as T,
      trashHintDentist: {
        en: 'The patient leaves your list. An administrator can restore them.',
        fr: 'Le patient quitte votre liste. Un administrateur peut le restaurer.',
      } as T,
      trashBlocked: {
        en: 'Not possible while this patient has orders.',
        fr: 'Impossible tant que ce patient a des commandes.',
      } as T,
    },
    bulk: {
      selectedOne: { en: '1 patient selected', fr: '1 patient sélectionné' } as T,
      selectedMany: { en: '{count} patients selected', fr: '{count} patients sélectionnés' } as T,
      deselect: { en: 'Deselect', fr: 'Désélectionner' } as T,
      trash: { en: 'Move to trash', fr: 'Mettre à la corbeille' } as T,
    },
    confirm: {
      trashTitle: { en: 'Move {name} to the trash?', fr: 'Mettre {name} à la corbeille ?' } as T,
      trashBodyAdmin: {
        en: 'The patient leaves the patient lists. You can restore them from the trash.',
        fr: 'Le patient disparaît des listes. Vous pourrez le restaurer depuis la corbeille.',
      } as T,
      trashBodyDentist: {
        en: 'The patient leaves your list. An administrator can restore them if needed.',
        fr: 'Le patient disparaît de votre liste. Un administrateur peut le restaurer si besoin.',
      } as T,
      bulkTitleOne: { en: 'Move 1 patient to the trash?', fr: 'Mettre 1 patient à la corbeille ?' } as T,
      bulkTitleMany: {
        en: 'Move {count} patients to the trash?',
        fr: 'Mettre {count} patients à la corbeille ?',
      } as T,
      bulkBody: {
        en: 'Patients who still have orders are kept in the list.',
        fr: 'Les patients qui ont encore des commandes restent dans la liste.',
      } as T,
      cancel: { en: 'Cancel', fr: 'Annuler' } as T,
      permanentTitle: {
        en: 'Delete this patient permanently?',
        fr: 'Supprimer ce patient définitivement ?',
      } as T,
      permanentBody: {
        en: '{name} and their record are erased for good. This cannot be undone, and it is refused while orders still reference the patient.',
        fr: '{name} et son dossier sont effacés définitivement. Cette action est irréversible et refusée tant que des commandes font référence à ce patient.',
      } as T,
    },
    empty: {
      filteredTitle: { en: 'No patient matches', fr: 'Aucun patient ne correspond' } as T,
      filteredBody: {
        en: 'Try another search or clear the filters.',
        fr: 'Essayez une autre recherche ou effacez les filtres.',
      } as T,
      firstTitle: { en: 'No patients yet', fr: 'Aucun patient pour l’instant' } as T,
      firstBody: {
        en: 'Add your first patient to start an aligner case.',
        fr: 'Ajoutez votre premier patient pour démarrer un cas d’aligneurs.',
      } as T,
      activeTitle: { en: 'No case in progress', fr: 'Aucun cas en cours' } as T,
      activeBody: {
        en: 'Patients with a submitted order show up here until it ships.',
        fr: 'Les patients dont une commande est soumise apparaissent ici jusqu’à son expédition.',
      } as T,
      noneTitle: { en: 'Every patient has an order', fr: 'Tous les patients ont une commande' } as T,
      noneBody: {
        en: 'Patients without any order show up here.',
        fr: 'Les patients sans aucune commande apparaissent ici.',
      } as T,
      trashTitle: { en: 'The trash is empty', fr: 'La corbeille est vide' } as T,
      trashBody: {
        en: 'Patients moved to the trash show up here.',
        fr: 'Les patients mis à la corbeille apparaissent ici.',
      } as T,
      errorTitle: { en: 'Couldn’t load the patients', fr: 'Impossible de charger les patients' } as T,
      retry: { en: 'Retry', fr: 'Réessayer' } as T,
    },
    noAccess: {
      title: {
        en: 'Patients are managed by dentists and administrators',
        fr: 'Les patients sont gérés par les praticiens et les administrateurs',
      } as T,
      body: {
        en: 'Your role doesn’t give access to the patient list.',
        fr: 'Votre rôle ne donne pas accès à la liste des patients.',
      } as T,
    },
    errors: {
      hasOrders: {
        en: 'This patient still has orders. Move their orders to the trash first.',
        fr: 'Ce patient a encore des commandes. Mettez d’abord ses commandes à la corbeille.',
      } as T,
    },
  },
};

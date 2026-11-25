import type { Lang } from './dict';

type T = Record<Lang, string>;

/**
 * Lab production, technician side (app/dashboard/production except
 * pilotage/, components/production): the queue, the case sheet, the
 * declaration form, "Ma journée" and the finance-free dossier. Spread into
 * dict (`...productionDomainDict`) by the main dictionary; owned by the
 * FE-TECH work package (see production-build/CONTRACT.md).
 * Same leaf shape as dict.ts: every leaf is `{ en, fr } as T`.
 *
 * Never put money vocabulary here ("payé", "paiement", "facture"): a step
 * the lab may not deliver yet is "non libérée", nothing more (owner D1).
 */
export const productionDomainDict = {
  production: {
    title: { en: 'Production', fr: 'Production' } as T,

    nav: {
      backToQueue: { en: 'Production queue', fr: 'File de production' } as T,
      backToCase: { en: 'Back to the case', fr: 'Retour au cas' } as T,
    },

    // ProductionEventType → the act's label (button, history, totals).
    acts: {
      model_printed: { en: 'Models printed', fr: 'Modèles imprimés' } as T,
      aligner_thermoformed: {
        en: 'Aligners thermoformed',
        fr: 'Aligneurs thermoformés',
      } as T,
      aligner_cut: { en: 'Aligners cut', fr: 'Aligneurs découpés' } as T,
      aligner_delivered: { en: 'Aligners delivered', fr: 'Aligneurs livrés' } as T,
    },
    // Column heads of the queue table.
    actsShort: {
      model_printed: { en: 'Printed', fr: 'Imprimés' } as T,
      aligner_thermoformed: { en: 'Thermoformed', fr: 'Thermoformés' } as T,
      aligner_cut: { en: 'Cut', fr: 'Découpés' } as T,
      aligner_delivered: { en: 'Delivered', fr: 'Livrés' } as T,
    },
    // The phone card's four narrow columns.
    actsAbbr: {
      model_printed: { en: 'Print', fr: 'Imp.' } as T,
      aligner_thermoformed: { en: 'Therm.', fr: 'Therm.' } as T,
      aligner_cut: { en: 'Cut', fr: 'Déc.' } as T,
      aligner_delivered: { en: 'Deliv.', fr: 'Livr.' } as T,
    },

    // ProductionArch + the form's "both" choice.
    arches: {
      upper: { en: 'Upper', fr: 'Supérieure' } as T,
      lower: { en: 'Lower', fr: 'Inférieure' } as T,
      both: { en: 'Both arches', fr: 'Les deux arcades' } as T,
    },
    archesShort: {
      upper: { en: 'Up.', fr: 'Sup.' } as T,
      lower: { en: 'Low.', fr: 'Inf.' } as T,
      both: { en: 'Up. + Low.', fr: 'Sup. + Inf.' } as T,
    },

    // DeliveryRecipient → the delivery form's chips.
    recipients: {
      practitioner: { en: 'Practitioner', fr: 'Praticien' } as T,
      courier: { en: 'Courier', fr: 'Coursier' } as T,
      patient: { en: 'Patient', fr: 'Patient' } as T,
    },

    // Supplemental children (OrderType); an initial case has no badge.
    kinds: {
      additional_aligners: { en: 'Additional aligners', fr: 'Aligneurs supplémentaires' } as T,
      replacement: { en: 'Replacement', fr: 'Remplacement' } as T,
      transfer_template: { en: 'Transfer template', fr: 'Gouttière de transfert' } as T,
      warranty: { en: 'Warranty', fr: 'Garantie' } as T,
    },

    // The lab's reading of a case (never the order's payment phases).
    status: {
      to_start: { en: 'To start', fr: 'À démarrer' } as T,
      in_progress: { en: 'In production', fr: 'En fabrication' } as T,
      ready_to_ship: { en: 'Ready to ship', fr: 'Prêt à expédier' } as T,
      shipped: { en: 'Shipped', fr: 'Expédié' } as T,
      delivery_complete: { en: 'Fully delivered', fr: 'Livraison complète' } as T,
      finished: { en: 'Finished', fr: 'Terminé' } as T,
      closed: { en: 'Out of production', fr: 'Hors production' } as T,
    },

    planned: {
      provisional: { en: 'provisional', fr: 'provisoire' } as T,
      provisionalHint: {
        en: 'Estimated from the pack or the case: the approved plan does not give this total yet.',
        fr: 'Estimé depuis le pack ou le cas : le plan approuvé ne donne pas encore ce total.',
      } as T,
      unknown: { en: 'unknown', fr: 'inconnu' } as T,
      notTreated: { en: 'not treated', fr: 'non traitée' } as T,
    },

    progress: {
      cellAria: {
        en: '{act}, {arch}: {done} of {total}',
        fr: '{act}, {arch} : {done} sur {total}',
      } as T,
      cellAriaNoTotal: {
        en: '{act}, {arch}: {done} done, total unknown',
        fr: '{act}, {arch} : {done} faits, total inconnu',
      } as T,
      notTreatedAria: { en: '{arch}: not treated', fr: '{arch} : non traitée' } as T,
    },

    queue: {
      title: { en: 'Production queue', fr: 'File de production' } as T,
      tabs: {
        active: { en: 'In progress', fr: 'En cours' } as T,
        done: { en: 'Done', fr: 'Terminés' } as T,
      },
      searchPh: {
        en: 'Search a reference, a patient or a practitioner',
        fr: 'Rechercher une référence, un patient ou un praticien',
      } as T,
      searchAria: { en: 'Search the cases', fr: 'Rechercher dans les cas' } as T,
      columns: {
        case: { en: 'Case', fr: 'Cas' } as T,
        practitioner: { en: 'Practitioner', fr: 'Praticien' } as T,
        status: { en: 'Status', fr: 'Statut' } as T,
        lastAction: { en: 'Last action', fr: 'Dernière action' } as T,
      },
      supplementalOf: { en: 'follows {code}', fr: 'suite de {code}' } as T,
      lastAction: { en: 'Last action {date}', fr: 'Dernière action le {date}' } as T,
      notStarted: { en: 'Not started yet', fr: 'Pas encore commencé' } as T,
      myDayLink: { en: 'My day', fr: 'Ma journée' } as T,
      updated: { en: 'Updated at {time}', fr: 'Mis à jour à {time}' } as T,
      refresh: { en: 'Refresh', fr: 'Actualiser' } as T,
      empty: {
        activeTitle: { en: 'Nothing to make right now', fr: 'Rien à fabriquer pour le moment' } as T,
        activeBody: {
          en: 'Confirmed cases appear here as soon as they can go into production.',
          fr: 'Les cas confirmés apparaissent ici dès qu’ils peuvent passer en fabrication.',
        } as T,
        doneTitle: { en: 'No finished case yet', fr: 'Aucun cas terminé pour l’instant' } as T,
        doneBody: {
          en: 'Cases you worked on leave the queue once they are delivered or closed.',
          fr: 'Les cas sur lesquels vous avez travaillé arrivent ici une fois livrés ou clôturés.',
        } as T,
        searchTitle: { en: 'No case matches', fr: 'Aucun cas ne correspond' } as T,
        searchBody: {
          en: 'Check the reference or the name, or clear the search.',
          fr: 'Vérifiez la référence ou le nom, ou effacez la recherche.',
        } as T,
        clear: { en: 'Clear the search', fr: 'Effacer la recherche' } as T,
      },
      errorTitle: { en: 'The queue could not be loaded', fr: 'La file n’a pas pu être chargée' } as T,
    },

    sheet: {
      plannedTitle: { en: 'Planned aligners', fr: 'Aligneurs prévus' } as T,
      stepsTitle: { en: 'Steps', fr: 'Étapes' } as T,
      stepsNoSchedule: {
        en: 'No step schedule on this case: every step follows the case.',
        fr: 'Pas d’échelonnement sur ce cas : toutes les étapes suivent le cas.',
      } as T,
      ranges: {
        released: { en: 'released', fr: 'libérées' } as T,
        locked: { en: 'not released', fr: 'non libérées' } as T,
        delivered: { en: 'delivered', fr: 'livrées' } as T,
      },
      range: { en: 'Steps {from}–{to}', fr: 'Étapes {from} à {to}' } as T,
      rangeOne: { en: 'Step {step}', fr: 'Étape {step}' } as T,
      declareTitle: { en: 'Declare', fr: 'Déclarer' } as T,
      next: { en: 'Next: step {step}', fr: 'Prochaine : étape {step}' } as T,
      nextPerArch: {
        en: 'Next: up. {upper} · low. {lower}',
        fr: 'Prochaine : sup. {upper} · inf. {lower}',
      } as T,
      allCovered: { en: 'All planned steps declared', fr: 'Toutes les étapes prévues sont déclarées' } as T,
      historyTitle: { en: 'History', fr: 'Historique' } as T,
      historyEmpty: {
        en: 'Nothing declared on this case yet. The first entry appears here.',
        fr: 'Rien n’est encore déclaré sur ce cas. La première saisie apparaîtra ici.',
      } as T,
      dossierLink: { en: 'Open the case file', fr: 'Ouvrir le dossier' } as T,
      dossierHint: {
        en: 'Patient, plan, photos, x-rays and 3D scans, read-only.',
        fr: 'Patient, plan, photos, radios et empreintes 3D, en lecture seule.',
      } as T,
      cannotDeclare: {
        ORDER_NOT_IN_PRODUCTION: {
          en: 'This case is no longer in production: entries are closed. The history stays available.',
          fr: 'Ce cas n’est plus en production : la saisie est fermée. L’historique reste consultable.',
        } as T,
      },
      loadError: { en: 'The case could not be loaded', fr: 'Le cas n’a pas pu être chargé' } as T,
      notFound: {
        en: 'This case does not exist or was removed.',
        fr: 'Ce cas n’existe pas ou a été retiré.',
      } as T,
    },

    history: {
      steps: { en: 'steps {from}–{to}', fr: 'étapes {from} à {to}' } as T,
      step: { en: 'step {step}', fr: 'étape {step}' } as T,
      quantity: { en: '{count} per arch', fr: '{count} par arcade' } as T,
      quantityOne: { en: 'quantity {count}', fr: 'quantité {count}' } as T,
      performed: { en: '{date} at {time}', fr: '{date} à {time}' } as T,
      by: { en: 'by {name}', fr: 'par {name}' } as T,
      legacy: { en: 'Imported history', fr: 'Historique importé' } as T,
      unknownAuthor: { en: 'deleted account', fr: 'compte supprimé' } as T,
      recordedLater: {
        en: 'entered on {date} at {time}',
        fr: 'saisi le {date} à {time}',
      } as T,
      recipient: { en: 'Handed to {recipient}', fr: 'Remis à : {recipient}' } as T,
      recipientNamed: { en: '{recipient} ({name})', fr: '{recipient} ({name})' } as T,
      cancelled: { en: 'Cancelled', fr: 'Annulée' } as T,
      cancelledBy: {
        en: 'Cancelled on {date} at {time} by {name}',
        fr: 'Annulée le {date} à {time} par {name}',
      } as T,
      cancelledArch: {
        en: '{arch} cancelled on {date} by {name}',
        fr: '{arch} annulée le {date} par {name}',
      } as T,
      reason: { en: 'Reason: {reason}', fr: 'Motif : {reason}' } as T,
      cancel: { en: 'Cancel', fr: 'Annuler' } as T,
      cancelAria: { en: 'Cancel this entry: {summary}', fr: 'Annuler cette saisie : {summary}' } as T,
      roles: {
        technician: { en: 'technician', fr: 'technicienne' } as T,
        admin: { en: 'admin', fr: 'admin' } as T,
        super_admin: { en: 'admin', fr: 'admin' } as T,
        dentist: { en: 'practitioner', fr: 'praticien' } as T,
        designer: { en: 'designer', fr: 'designer' } as T,
      },
    },

    // PRODUCTION_WARNING → a chip in the history, a line in the
    // confirmation step (plain French: what it means, not the code).
    warnings: {
      previous_stage_missing: {
        title: { en: 'Previous step missing', fr: 'Étape précédente manquante' } as T,
        detail: {
          en: 'Some of these steps were not declared at the previous stage yet.',
          fr: 'Une partie de ces étapes n’a pas encore été déclarée à l’étape précédente.',
        } as T,
      },
      already_declared: {
        title: { en: 'Already declared', fr: 'Déjà déclaré' } as T,
        detail: {
          en: 'Some of these steps were already declared for this act (reprint?).',
          fr: 'Une partie de ces étapes est déjà déclarée pour cet acte (réimpression ?).',
        } as T,
      },
      quantity_differs: {
        title: { en: 'Quantity differs', fr: 'Quantité différente' } as T,
        detail: {
          en: 'The quantity is not the number of steps.',
          fr: 'La quantité ne correspond pas au nombre d’étapes.',
        } as T,
      },
      beyond_planned_total: {
        title: { en: 'Beyond the plan', fr: 'Au-delà du prévu' } as T,
        detail: {
          en: 'These steps go past the planned number of aligners.',
          fr: 'Ces étapes dépassent le nombre d’aligneurs prévu.',
        } as T,
      },
      arch_not_treated: {
        title: { en: 'Arch not treated', fr: 'Arcade non traitée' } as T,
        detail: {
          en: 'This arch is not part of the treatment.',
          fr: 'Cette arcade ne fait pas partie du traitement.',
        } as T,
      },
      steps_not_released: {
        title: { en: 'Steps not released', fr: 'Étapes non libérées' } as T,
        detail: {
          en: 'Some of these steps are not released yet.',
          fr: 'Une partie de ces étapes n’est pas encore libérée.',
        } as T,
      },
    },

    form: {
      description: { en: 'Case {code} · {patient}', fr: 'Cas {code} · {patient}' } as T,
      loading: { en: 'Loading the case…', fr: 'Chargement du cas…' } as T,
      arch: { en: 'Arch', fr: 'Arcade' } as T,
      archBoth: { en: 'Both', fr: 'Les deux' } as T,
      archNotTreated: { en: 'not treated', fr: 'non traitée' } as T,
      steps: { en: 'Steps', fr: 'Étapes' } as T,
      from: { en: 'From', fr: 'De' } as T,
      to: { en: 'To', fr: 'À' } as T,
      decrease: { en: 'Lower “{field}”', fr: 'Diminuer « {field} »' } as T,
      increase: { en: 'Raise “{field}”', fr: 'Augmenter « {field} »' } as T,
      nextPerArch: {
        en: 'Next step: up. {upper} · low. {lower}',
        fr: 'Prochaine étape : sup. {upper} · inf. {lower}',
      } as T,
      allCovered: {
        en: 'Every planned step is already declared for this act.',
        fr: 'Toutes les étapes prévues sont déjà déclarées pour cet acte.',
      } as T,
      quantity: { en: 'Quantity', fr: 'Quantité' } as T,
      quantityPerArch: { en: '{count} per arch', fr: '{count} par arcade' } as T,
      quantityTotal: { en: '{count} in all', fr: '{count} au total' } as T,
      quantityEdit: { en: 'Change', fr: 'Modifier' } as T,
      quantityReset: { en: 'From the steps', fr: 'D’après les étapes' } as T,
      quantityLabel: { en: 'Quantity per arch', fr: 'Quantité par arcade' } as T,
      when: { en: 'Date and time', fr: 'Date et heure' } as T,
      now: { en: 'Now', fr: 'Maintenant' } as T,
      whenEdit: { en: 'Change', fr: 'Modifier' } as T,
      whenNow: { en: 'Back to now', fr: 'Revenir à maintenant' } as T,
      day: { en: 'Day', fr: 'Jour' } as T,
      time: { en: 'Time', fr: 'Heure' } as T,
      windowHint: {
        en: 'From {from} to today, Tunis time.',
        fr: 'Du {from} à aujourd’hui, heure de Tunis.',
      } as T,
      note: { en: 'Note', fr: 'Note' } as T,
      noteOptional: { en: 'optional', fr: 'facultative' } as T,
      noteRequired: { en: 'required', fr: 'obligatoire' } as T,
      notePh: {
        en: 'Reprint, breakage, cutting defect…',
        fr: 'Réimpression, casse, défaut de découpe…',
      } as T,
      recipient: { en: 'Handed to', fr: 'Remis à' } as T,
      recipientName: { en: 'Name (optional)', fr: 'Nom (facultatif)' } as T,
      recipientNamePh: { en: 'Courier or person', fr: 'Coursier ou personne' } as T,
      submit: { en: 'Save', fr: 'Enregistrer' } as T,
      submitting: { en: 'Saving…', fr: 'Enregistrement…' } as T,
      close: { en: 'Close', fr: 'Fermer' } as T,
      confirmTitle: { en: 'Check before saving', fr: 'Vérifiez avant d’enregistrer' } as T,
      confirmIntro: {
        en: 'This entry is unusual:',
        fr: 'Cette saisie sort de l’ordinaire :',
      } as T,
      confirmNoteHint: {
        en: 'Say in one sentence why you confirm it.',
        fr: 'Expliquez en une phrase pourquoi vous la confirmez.',
      } as T,
      confirmSubmit: { en: 'Confirm and save', fr: 'Confirmer et enregistrer' } as T,
      confirmBack: { en: 'Change the entry', fr: 'Modifier la saisie' } as T,
      summary: {
        en: '{act} · {arch} · {steps}',
        fr: '{act} · {arch} · {steps}',
      } as T,
      hints: {
        notReleased: {
          en: 'Steps {range} are not released for delivery yet.',
          fr: 'Les étapes {range} ne sont pas encore libérées pour la livraison.',
        } as T,
        beyondTotal: {
          en: 'The plan has {total} aligners on this arch.',
          fr: 'Le plan prévoit {total} aligneurs sur cette arcade.',
        } as T,
      },
      errors: {
        fromAfterTo: {
          en: '“To” must be the same step as “From” or a later one.',
          fr: '« À » doit être égale ou supérieure à « De ».',
        } as T,
        stepRange: { en: 'A step from 1 to 200.', fr: 'Une étape de 1 à 200.' } as T,
        quantityRange: { en: 'A quantity from 1 to 500.', fr: 'Une quantité de 1 à 500.' } as T,
        dayRequired: { en: 'Choose the day.', fr: 'Choisissez le jour.' } as T,
        timeRequired: { en: 'Enter the time (HH:MM).', fr: 'Indiquez l’heure (HH:MM).' } as T,
        dayOutOfWindow: {
          en: 'Choose a day from {from} to {to}.',
          fr: 'Choisissez un jour du {from} au {to}.',
        } as T,
        future: {
          en: 'This time is still to come.',
          fr: 'Cette heure n’est pas encore passée.',
        } as T,
        noteRequired: {
          en: 'The note is required to confirm.',
          fr: 'La note est obligatoire pour confirmer.',
        } as T,
        beyondTotal: {
          en: 'Up to step {total}: the plan has {total} aligners on this arch.',
          fr: 'Jusqu’à l’étape {total} : le plan prévoit {total} aligneurs sur cette arcade.',
        } as T,
      },
      saved: {
        en: 'Saved: {summary}.',
        fr: 'Enregistré : {summary}.',
      } as T,
      replayed: {
        en: 'This entry was already saved.',
        fr: 'Cette saisie était déjà enregistrée.',
      } as T,
    },

    cancel: {
      title: { en: 'Cancel an entry', fr: 'Annuler une saisie' } as T,
      intro: {
        en: 'The entry stays in the history, struck through, with your reason.',
        fr: 'La saisie reste dans l’historique, barrée, avec votre motif.',
      } as T,
      arches: { en: 'Arches to cancel', fr: 'Arcades à annuler' } as T,
      reason: { en: 'Reason', fr: 'Motif' } as T,
      reasonPh: {
        en: 'Wrong steps, wrong case, double entry…',
        fr: 'Erreur d’étapes, mauvais cas, saisie en double…',
      } as T,
      reasonHint: {
        en: '3 to 500 characters. Seen by the lab team only.',
        fr: '3 à 500 caractères. Visible par l’équipe du labo uniquement.',
      } as T,
      submit: { en: 'Cancel the entry', fr: 'Annuler la saisie' } as T,
      submitting: { en: 'Cancelling…', fr: 'Annulation…' } as T,
      keep: { en: 'Keep it', fr: 'Garder' } as T,
      done: { en: 'Entry cancelled.', fr: 'Saisie annulée.' } as T,
      errors: {
        reasonShort: {
          en: 'Give a reason of at least 3 characters.',
          fr: 'Indiquez un motif d’au moins 3 caractères.',
        } as T,
        reasonLong: { en: '500 characters at most.', fr: '500 caractères au maximum.' } as T,
        noArch: { en: 'Choose at least one arch.', fr: 'Choisissez au moins une arcade.' } as T,
      },
    },

    myDay: {
      title: { en: 'My day', fr: 'Ma journée' } as T,
      today: { en: 'Today', fr: 'Aujourd’hui' } as T,
      yesterday: { en: 'Yesterday', fr: 'Hier' } as T,
      choiceAria: { en: 'Day shown', fr: 'Jour affiché' } as T,
      totalsTitle: { en: 'Totals', fr: 'Totaux' } as T,
      entries: { en: '{count} entries', fr: '{count} saisies' } as T,
      entriesOne: { en: '1 entry', fr: '1 saisie' } as T,
      entriesNone: { en: 'no entry', fr: 'aucune saisie' } as T,
      entriesTitle: { en: 'My entries', fr: 'Mes saisies' } as T,
      grouping: {
        en: 'Grouped by the day you entered them.',
        fr: 'Classées selon le jour où vous les avez saisies.',
      } as T,
      emptyToday: {
        en: 'Nothing entered today yet. Open a case from the queue to declare an act.',
        fr: 'Rien de saisi aujourd’hui pour l’instant. Ouvrez un cas depuis la file pour déclarer un acte.',
      } as T,
      emptyYesterday: { en: 'Nothing was entered yesterday.', fr: 'Rien n’a été saisi hier.' } as T,
      errorTitle: { en: 'Your day could not be loaded', fr: 'Votre journée n’a pas pu être chargée' } as T,
      openQueue: { en: 'Open the queue', fr: 'Ouvrir la file' } as T,
    },

    dossier: {
      title: { en: 'Case file', fr: 'Dossier' } as T,
      readOnly: { en: 'Read-only', fr: 'Lecture seule' } as T,
      loadError: { en: 'The case file could not be loaded', fr: 'Le dossier n’a pas pu être chargé' } as T,
      empty: { en: 'Nothing given', fr: 'Non renseigné' } as T,
      patient: {
        title: { en: 'Patient', fr: 'Patient' } as T,
        name: { en: 'Full name', fr: 'Nom complet' } as T,
        gender: { en: 'Sex', fr: 'Sexe' } as T,
        age: { en: 'Age', fr: 'Âge' } as T,
        ageValue: { en: '{age} years', fr: '{age} ans' } as T,
        genders: {
          male: { en: 'Male', fr: 'Homme' } as T,
          female: { en: 'Female', fr: 'Femme' } as T,
          other: { en: 'Other', fr: 'Autre' } as T,
        },
      },
      practitioner: {
        title: { en: 'Practitioner', fr: 'Praticien' } as T,
        name: { en: 'Name', fr: 'Nom' } as T,
        clinic: { en: 'Clinic', fr: 'Cabinet' } as T,
      },
      order: {
        title: { en: 'Request', fr: 'Demande' } as T,
        created: { en: 'Created on', fr: 'Créée le' } as T,
        submitted: { en: 'Submitted on', fr: 'Soumise le' } as T,
        stage: { en: 'Stage', fr: 'Stade' } as T,
        stages: {
          initial: { en: 'Initial treatment', fr: 'Traitement initial' } as T,
          refinement: { en: 'Refinement', fr: 'Affinement' } as T,
          retainer: { en: 'Retainer', fr: 'Contention' } as T,
        },
        arches: { en: 'Treated arches', fr: 'Arcades traitées' } as T,
        totalAligners: { en: 'Aligners on the case', fr: 'Aligneurs du cas' } as T,
        materials: { en: 'Materials', fr: 'Matériaux' } as T,
        cbct: { en: 'CBCT with the scans', fr: 'CBCT joint aux scans' } as T,
        manufacturing: { en: 'Manufacturing requested', fr: 'Fabrication demandée' } as T,
        yes: { en: 'Yes', fr: 'Oui' } as T,
        no: { en: 'No', fr: 'Non' } as T,
        clinicalTitle: { en: 'Clinical instructions', fr: 'Consignes cliniques' } as T,
        clinicalEmpty: {
          en: 'No clinical instruction on this request.',
          fr: 'Aucune consigne clinique sur cette demande.',
        } as T,
        fields: {
          chiefComplaint: { en: 'Reason for consultation', fr: 'Motif de consultation' } as T,
          treatmentPlan: { en: 'Treatment goal', fr: 'Objectif de traitement' } as T,
          dontMoveOption: { en: 'Teeth not to move', fr: 'Dents à ne pas bouger' } as T,
          apRelationship: { en: 'A-P relationship', fr: 'Relation A-P' } as T,
          anteroposteriorRelationship: {
            en: 'Anteroposterior correction',
            fr: 'Correction antéro-postérieure',
          } as T,
          elastics: { en: 'Elastics', fr: 'Élastiques' } as T,
          openBite: { en: 'Open bite', fr: 'Béance' } as T,
          midline: { en: 'Midline', fr: 'Milieu interincisif' } as T,
          ipr: { en: 'IPR', fr: 'RIP' } as T,
          biteRamps: { en: 'Bite ramps', fr: 'Rampes occlusales' } as T,
          expansion: { en: 'Expansion', fr: 'Expansion' } as T,
          crossbite: { en: 'Crossbite', fr: 'Occlusion croisée' } as T,
          spaces: { en: 'Spaces', fr: 'Espaces' } as T,
          extractions: { en: 'Extractions', fr: 'Extractions' } as T,
          specialInstructions: { en: 'Special instructions', fr: 'Instructions particulières' } as T,
          additionalInstructions: {
            en: 'Additional instructions',
            fr: 'Instructions complémentaires',
          } as T,
        },
      },
      teeth: {
        title: { en: 'Tooth instructions', fr: 'Consignes par dent' } as T,
        types: {
          no_attachments: { en: 'No attachments', fr: 'Pas de taquets' } as T,
          do_not_move: { en: 'Do not move', fr: 'Ne pas bouger' } as T,
          no_ipr: { en: 'No IPR', fr: 'Pas de RIP' } as T,
          extract: { en: 'To extract', fr: 'À extraire' } as T,
          attachment: { en: 'Attachment', fr: 'Taquet' } as T,
          ipr_value: { en: 'IPR', fr: 'RIP' } as T,
          precision_cut: { en: 'Precision cut', fr: 'Découpe de précision' } as T,
        },
      },
      plan: {
        title: { en: 'Approved plan', fr: 'Plan approuvé' } as T,
        none: {
          en: 'No approved plan on this case yet.',
          fr: 'Aucun plan approuvé sur ce cas pour l’instant.',
        } as T,
        name: { en: 'Plan', fr: 'Plan' } as T,
        version: { en: 'Version {version}', fr: 'Version {version}' } as T,
        approvedOn: { en: 'Approved on {date}', fr: 'Approuvé le {date}' } as T,
        totals: { en: 'Aligners in the plan', fr: 'Aligneurs du plan' } as T,
        resultView: { en: 'Open the 3D simulation', fr: 'Ouvrir la simulation 3D' } as T,
        movementTable: { en: 'Movement table', fr: 'Tableau des mouvements' } as T,
        dentalTable: { en: 'Dental treatment table', fr: 'Tableau de traitement dentaire' } as T,
        tableError: { en: 'The table could not be loaded.', fr: 'Le tableau n’a pas pu être chargé.' } as T,
        ipr: { en: 'IPR', fr: 'RIP' } as T,
        iprRow: { en: '{from}–{to}: {value} mm', fr: '{from}–{to} : {value} mm' } as T,
        files: { en: 'Plan files', fr: 'Fichiers du plan' } as T,
        noFiles: { en: 'No file attached to the plan.', fr: 'Aucun fichier joint au plan.' } as T,
      },
      files: {
        title: { en: 'Photos, x-rays and scans', fr: 'Photos, radios et empreintes' } as T,
        empty: { en: 'No file on this case.', fr: 'Aucun fichier sur ce cas.' } as T,
        download: { en: 'Download', fr: 'Télécharger' } as T,
        downloadAria: { en: 'Download {name}', fr: 'Télécharger {name}' } as T,
        preview: { en: 'Enlarge {name}', fr: 'Agrandir {name}' } as T,
        view3d: { en: 'View in 3D', fr: 'Voir en 3D' } as T,
        view3dAria: { en: 'View {name} in 3D', fr: 'Voir {name} en 3D' } as T,
        processing: { en: 'Preview on its way', fr: 'Aperçu en préparation' } as T,
        previewError: { en: 'Preview unavailable', fr: 'Aperçu indisponible' } as T,
        downloadError: { en: 'The file could not be downloaded.', fr: 'Le fichier n’a pas pu être téléchargé.' } as T,
        numbered: { en: '{category} {index}', fr: '{category} {index}' } as T,
        categories: {
          right_photo: { en: 'Right side', fr: 'Profil droit' } as T,
          front_photo: { en: 'Front', fr: 'Face' } as T,
          left_photo: { en: 'Left side', fr: 'Profil gauche' } as T,
          upper_photo: { en: 'Upper occlusal', fr: 'Occlusale supérieure' } as T,
          lower_photo: { en: 'Lower occlusal', fr: 'Occlusale inférieure' } as T,
          orthopantomography: { en: 'Panoramic x-ray', fr: 'Radio panoramique' } as T,
          stl: { en: 'STL scan', fr: 'Empreinte STL' } as T,
          ply: { en: 'PLY scan', fr: 'Empreinte PLY' } as T,
          obj: { en: 'OBJ scan', fr: 'Empreinte OBJ' } as T,
          zip: { en: 'Archive', fr: 'Archive' } as T,
          pdf: { en: 'PDF', fr: 'PDF' } as T,
          image: { en: 'Image', fr: 'Image' } as T,
          video: { en: 'Video', fr: 'Vidéo' } as T,
          other: { en: 'Other file (DICOM…)', fr: 'Autre fichier (DICOM…)' } as T,
        },
        planCategories: {
          image: { en: 'Image', fr: 'Image' } as T,
          xray: { en: 'X-ray', fr: 'Radio' } as T,
          stl: { en: 'STL', fr: 'STL' } as T,
          ply: { en: 'PLY', fr: 'PLY' } as T,
          obj: { en: 'OBJ', fr: 'OBJ' } as T,
          zip: { en: 'Archive', fr: 'Archive' } as T,
          pdf: { en: 'PDF', fr: 'PDF' } as T,
          video: { en: 'Video', fr: 'Vidéo' } as T,
          treatment_file: { en: 'Treatment file', fr: 'Fichier de traitement' } as T,
          treatment_result: { en: 'Result', fr: 'Résultat' } as T,
          container: { en: 'Container', fr: 'Conteneur' } as T,
          other: { en: 'Other file', fr: 'Autre fichier' } as T,
        },
      },
      viewer: {
        title: { en: '3D scan', fr: 'Empreinte 3D' } as T,
      },
      supplemental: {
        title: { en: 'Supplemental request', fr: 'Demande complémentaire' } as T,
        fields: {
          reason: { en: 'Reason', fr: 'Motif' } as T,
          reasonDetails: { en: 'Details', fr: 'Précisions' } as T,
          currentAligners: { en: 'Aligner being worn', fr: 'Aligneur porté' } as T,
          currentValue: { en: 'up. {upper} · low. {lower}', fr: 'sup. {upper} · inf. {lower}' } as T,
          passiveOppositeArch: { en: 'Passive aligners on the other arch', fr: 'Aligneurs passifs sur l’autre arcade' } as T,
          newScans: { en: 'New scans', fr: 'Nouvelles empreintes' } as T,
          clinicalObjective: { en: 'Clinical goal', fr: 'Objectif clinique' } as T,
          movementRestriction: { en: 'Teeth kept in place', fr: 'Dents à garder en place' } as T,
          apRight: { en: 'A-P relationship, right', fr: 'Relation A-P, droite' } as T,
          apLeft: { en: 'A-P relationship, left', fr: 'Relation A-P, gauche' } as T,
          apOptions: { en: 'A-P options', fr: 'Options A-P' } as T,
          elasticCutouts: { en: 'Elastic cut-outs', fr: 'Découpes pour élastiques' } as T,
          attachmentPolicy: { en: 'New attachments', fr: 'Nouveaux taquets' } as T,
          existingAttachmentPolicy: { en: 'Existing attachments', fr: 'Taquets en place' } as T,
          iprPolicy: { en: 'IPR', fr: 'RIP' } as T,
          previousIpr: { en: 'Previous IPR', fr: 'RIP précédente' } as T,
          precisionCutPolicy: { en: 'Precision cuts', fr: 'Découpes de précision' } as T,
          residualSpacePolicy: { en: 'Residual spaces', fr: 'Espaces résiduels' } as T,
          upperInstructions: { en: 'Upper arch instructions', fr: 'Consignes arcade supérieure' } as T,
          lowerInstructions: { en: 'Lower arch instructions', fr: 'Consignes arcade inférieure' } as T,
          impressionMethod: { en: 'Impressions', fr: 'Empreintes' } as T,
          replacementRange: { en: 'Aligners to replace', fr: 'Aligneurs à remplacer' } as T,
          replacementValue: { en: '{from} to {to}', fr: 'du {from} au {to}' } as T,
          quantity: { en: 'Quantity', fr: 'Quantité' } as T,
          replacementReason: { en: 'Replacement reason', fr: 'Motif du remplacement' } as T,
          urgency: { en: 'Urgency', fr: 'Urgence' } as T,
          sourcePlan: { en: 'Plan version used', fr: 'Version du plan utilisée' } as T,
          transferPurpose: { en: 'Template purpose', fr: 'Usage de la gouttière' } as T,
          transferNotes: { en: 'Template notes', fr: 'Notes sur la gouttière' } as T,
          defectiveAligners: { en: 'Defective aligners', fr: 'Aligneurs défectueux' } as T,
          defectCategory: { en: 'Defect', fr: 'Défaut' } as T,
          discoveredAt: { en: 'Noticed on', fr: 'Constaté le' } as T,
          lotReference: { en: 'Lot or reference', fr: 'Lot ou référence' } as T,
          comments: { en: 'Comments', fr: 'Commentaires' } as T,
          teeth: { en: 'Teeth marked', fr: 'Dents indiquées' } as T,
          contacts: { en: 'Contacts', fr: 'Contacts' } as T,
          contactRow: { en: '{from}–{to}: {mm} mm', fr: '{from}–{to} : {mm} mm' } as T,
        },
        yes: { en: 'Yes', fr: 'Oui' } as T,
        no: { en: 'No', fr: 'Non' } as T,
        values: {
          reason: {
            finishing: { en: 'Finishing', fr: 'Finitions' } as T,
            tracking_problem: { en: 'Teeth off track', fr: 'Dents hors du plan' } as T,
            treatment_plan_change: { en: 'Change of plan', fr: 'Modification du plan' } as T,
            dental_restoration: { en: 'Dental work since the plan', fr: 'Soins depuis le plan' } as T,
            non_compliance: { en: 'Aligners not worn', fr: 'Aligneurs non portés' } as T,
            other: { en: 'Other', fr: 'Autre' } as T,
          },
          clinicalObjective: {
            adjust_current_position: { en: 'Adjust from the current position', fr: 'Ajuster depuis la position actuelle' } as T,
            preserve_previous_goal: { en: 'Keep the previous goal', fr: 'Garder l’objectif précédent' } as T,
            new_goal: { en: 'New goal', fr: 'Nouvel objectif' } as T,
          },
          teethScope: {
            none: { en: 'None', fr: 'Aucune' } as T,
            selected_teeth: { en: 'The teeth marked', fr: 'Les dents indiquées' } as T,
          },
          apCorrection: {
            maintain: { en: 'Keep as is', fr: 'Garder telle quelle' } as T,
            improve_canine: { en: 'Improve canines', fr: 'Améliorer les canines' } as T,
            improve_canine_molar: { en: 'Improve canines and molars', fr: 'Améliorer canines et molaires' } as T,
            class_one: { en: 'Class I', fr: 'Classe I' } as T,
          },
          apOption: {
            posterior_ipr: { en: 'Posterior IPR', fr: 'RIP postérieure' } as T,
            elastics_simulation: { en: 'Class II/III elastics', fr: 'Élastiques classe II/III' } as T,
            sequential_distalization: { en: 'Sequential distalization', fr: 'Distalisation séquentielle' } as T,
            mandibular_advancement: { en: 'Mandibular advancement', fr: 'Avancée mandibulaire' } as T,
            orthognathic_surgery: { en: 'Orthognathic surgery prep', fr: 'Préparation chirurgicale' } as T,
          },
          attachmentPlan: {
            as_needed: { en: 'Where needed', fr: 'Là où c’est utile' } as T,
            avoid_selected_teeth: { en: 'Not on the teeth marked', fr: 'Pas sur les dents indiquées' } as T,
          },
          existingAttachments: {
            remove_all: { en: 'Remove all', fr: 'Tous retirés' } as T,
            remove_selected: { en: 'Remove the ones marked', fr: 'Retirer ceux indiqués' } as T,
            keep_conventional: { en: 'Keep conventional ones', fr: 'Garder les conventionnels' } as T,
            keep_all: { en: 'Keep all', fr: 'Tous gardés' } as T,
          },
          iprPlan: {
            as_needed: { en: 'Where useful', fr: 'Là où c’est utile' } as T,
            none: { en: 'No IPR', fr: 'Pas de RIP' } as T,
            avoid_selected_teeth: { en: 'Not on the teeth marked', fr: 'Pas sur les dents indiquées' } as T,
          },
          previousIpr: {
            as_prescribed: { en: 'Done as planned', fr: 'Faite comme prévu' } as T,
            none: { en: 'None done', fr: 'Aucune faite' } as T,
            different: { en: 'Done differently', fr: 'Faite autrement' } as T,
          },
          cutoutPlan: {
            none: { en: 'None', fr: 'Aucune' } as T,
            same_as_previous: { en: 'Same as last time', fr: 'Comme la dernière fois' } as T,
            selected_teeth: { en: 'On the teeth marked', fr: 'Sur les dents indiquées' } as T,
          },
          residualSpaces: {
            none: { en: 'None', fr: 'Aucun' } as T,
            close_specified: { en: 'Close them', fr: 'À fermer' } as T,
          },
          impressionMethod: {
            intraoral_scan: { en: 'Intraoral scans', fr: 'Scans intra-oraux' } as T,
            physical_impression: { en: 'Physical impressions', fr: 'Empreintes physiques' } as T,
          },
          replacementReason: {
            lost: { en: 'Lost', fr: 'Perdu' } as T,
            broken: { en: 'Broken', fr: 'Cassé' } as T,
            deformed: { en: 'Deformed', fr: 'Déformé' } as T,
            other: { en: 'Other', fr: 'Autre' } as T,
          },
          urgency: {
            standard: { en: 'Standard', fr: 'Standard' } as T,
            urgent: { en: 'Urgent', fr: 'Urgent' } as T,
          },
          transferPurpose: {
            attachment_placement: { en: 'Placing attachments', fr: 'Pose de taquets' } as T,
            auxiliary_placement: { en: 'Placing auxiliaries', fr: 'Pose d’auxiliaires' } as T,
            attachment_and_auxiliary: { en: 'Attachments and auxiliaries', fr: 'Taquets et auxiliaires' } as T,
            other: { en: 'Other', fr: 'Autre' } as T,
          },
          defect: {
            fit: { en: 'Poor seating', fr: 'Ajustement insuffisant' } as T,
            crack: { en: 'Split or fracture', fr: 'Fêlure ou rupture' } as T,
            deformation: { en: 'Loss of shape', fr: 'Perte de forme' } as T,
            trim: { en: 'Badly cut edge', fr: 'Bord mal découpé' } as T,
            material: { en: 'Material problem', fr: 'Problème de matière' } as T,
            labeling: { en: 'Wrong label', fr: 'Étiquette erronée' } as T,
            other: { en: 'Other', fr: 'Autre' } as T,
          },
          toothPurpose: {
            do_not_move: { en: 'Do not move', fr: 'Ne pas bouger' } as T,
            no_attachment: { en: 'No attachment', fr: 'Pas de taquet' } as T,
            remove_attachment: { en: 'Remove attachment', fr: 'Retirer le taquet' } as T,
            no_ipr: { en: 'No IPR', fr: 'Pas de RIP' } as T,
            cutout: { en: 'Cut-out', fr: 'Découpe' } as T,
            transfer_tray: { en: 'Transfer template', fr: 'Gouttière de transfert' } as T,
          },
          contactPurpose: {
            performed_ipr: { en: 'IPR done', fr: 'RIP faite' } as T,
            residual_space: { en: 'Residual space', fr: 'Espace résiduel' } as T,
          },
        },
      },
    },

    access: {
      title: { en: 'Lab screens', fr: 'Écrans du labo' } as T,
      body: {
        en: 'These screens are for the lab team and the administrators.',
        fr: 'Ces écrans sont réservés à l’équipe du labo et aux administrateurs.',
      } as T,
    },

    retry: { en: 'Try again', fr: 'Réessayer' } as T,

    // ProductionErrorCode → what the technician reads. Neutral wording:
    // no amount, no payment vocabulary.
    errors: {
      STEPS_NOT_RELEASED: {
        en: 'These steps are not released for delivery yet. Please see the administrator.',
        fr: 'Ces étapes ne sont pas encore libérées pour la livraison. Voyez l’administrateur.',
      } as T,
      PRODUCTION_CONFIRM_REQUIRED: {
        en: 'This entry needs your confirmation and a note.',
        fr: 'Cette saisie demande votre confirmation et une note.',
      } as T,
      NOTE_REQUIRED: {
        en: 'Add a note to confirm this entry.',
        fr: 'Ajoutez une note pour confirmer cette saisie.',
      } as T,
      ORDER_NOT_IN_PRODUCTION: {
        en: 'This case is not in production.',
        fr: 'Ce cas n’est pas en production.',
      } as T,
      CANCEL_WINDOW_PASSED: {
        en: 'More than 24 hours have passed: ask an administrator to cancel this entry.',
        fr: 'Plus de 24 heures se sont écoulées : demandez à un administrateur d’annuler cette saisie.',
      } as T,
      CANCEL_NOT_OWN_EVENT: {
        en: 'You can only cancel your own entries.',
        fr: 'Vous ne pouvez annuler que vos propres saisies.',
      } as T,
      STEP_BEYOND_PLANNED_TOTAL: {
        en: 'These steps go past the aligners planned for this arch.',
        fr: 'Ces étapes dépassent les aligneurs prévus pour cette arcade.',
      } as T,
      INVALID_STEP_RANGE: {
        en: '“To” must be the same step as “From” or a later one.',
        fr: '« À » doit être égale ou supérieure à « De ».',
      } as T,
      PERFORMED_AT_OUT_OF_RANGE: {
        en: 'This date is outside the allowed window: not in the future, not before the order, and at most 7 days back for a technician.',
        fr: 'Cette date sort de la période permise : ni dans le futur, ni avant la commande, et 7 jours en arrière au plus pour une technicienne.',
      } as T,
      INVALID_DATE: { en: 'This day does not exist.', fr: 'Ce jour n’existe pas.' } as T,
      INVALID_TIME: { en: 'This time is not valid (HH:MM).', fr: 'Cette heure n’est pas valide (HH:MM).' } as T,
      INVALID_DATE_RANGE: {
        en: 'This period is not valid: it ends before it starts, or it covers more than 366 days.',
        fr: 'Cette période n’est pas valide : elle finit avant de commencer, ou couvre plus de 366 jours.',
      } as T,
      PRODUCTION_IDEMPOTENCY_KEY_REQUIRED: {
        en: 'The entry could not be identified. Close the form and try again.',
        fr: 'La saisie n’a pas pu être identifiée. Fermez le formulaire et réessayez.',
      } as T,
      PRODUCTION_IDEMPOTENCY_KEY_REUSED: {
        en: 'This form was already used for another entry. Close it and start again.',
        fr: 'Ce formulaire a déjà servi pour une autre saisie. Fermez-le et recommencez.',
      } as T,
      NOTICE_NOT_RETRYABLE: {
        en: 'This notice can no longer be resent: it is already on its way or sent. The list was refreshed.',
        fr: 'Cette notification ne peut plus être relancée : elle est déjà en cours ou envoyée. La liste a été actualisée.',
      } as T,
      PASSWORD_CHANGE_REQUIRED: {
        en: 'Choose your own password before you continue.',
        fr: 'Choisissez votre mot de passe avant de continuer.',
      } as T,
      PLAN_TOTALS_REQUIRED: {
        en: 'The plan must give the number of aligners of each treated arch.',
        fr: 'Le plan doit indiquer le nombre d’aligneurs de chaque arcade traitée.',
      } as T,
      TEMPORARY_PASSWORD_TECHNICIAN_ONLY: {
        en: 'A temporary password is for technician accounts only.',
        fr: 'Un mot de passe provisoire est réservé aux comptes technicien.',
      } as T,
      BATCH_NEEDS_NO_DELIVERY: {
        en: 'This batch holds no aligner of the approved plan. It will be marked delivered with the case’s first delivery.',
        fr: 'Ce lot ne contient aucun aligneur du plan approuvé. Il sera marqué livré avec la première livraison du cas.',
      } as T,
      generic: {
        en: 'The entry could not be saved. Try again.',
        fr: 'La saisie n’a pas pu être enregistrée. Réessayez.',
      } as T,
      maybeSaved: {
        en: 'No answer from the server: the entry may have been saved. Try again: it will not be counted twice.',
        fr: 'Pas de réponse du serveur : la saisie a peut-être été enregistrée. Réessayez : elle ne sera pas comptée deux fois.',
      } as T,
    },
  },
};

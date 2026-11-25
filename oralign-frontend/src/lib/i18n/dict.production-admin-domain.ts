import type { Lang } from './dict';

type T = Record<Lang, string>;

/**
 * Lab production, admin desk (app/dashboard/production/pilotage,
 * components/production-admin): journal, monthly recap, progress, anomalies
 * ("Écarts"), CSV export and the notice outbox. Spread into dict
 * (`...productionAdminDomainDict`) by the main dictionary; owned by the
 * FE-ADMIN work package (see production-build/CONTRACT.md).
 * Same leaf shape as dict.ts: every leaf is `{ en, fr } as T`.
 *
 * Act, arch and recipient names are read from `production.*` (one source
 * for every production screen); everything else of the desk lives here.
 * This desk is admin-only: unlike the technician screens it may name the
 * money side of a case ("libéré" = paid batch).
 */
export const productionAdminDomainDict = {
  productionAdmin: {
    title: { en: 'Production oversight', fr: 'Pilotage de la production' } as T,
    subtitle: {
      en: 'What the lab made: the day, the month, every case, the discrepancies and the notices sent to practitioners.',
      fr: 'Ce que le labo a fabriqué : la journée, le mois, chaque cas, les écarts et les notifications aux praticiens.',
    } as T,
    refresh: { en: 'Refresh', fr: 'Actualiser' } as T,
    openQueue: { en: 'Production queue', fr: 'File de production' } as T,

    // Keyed by the desk's ?view= values (CONTRACT.md §6).
    views: {
      journal: { en: 'Daily log', fr: 'Journal' } as T,
      recap: { en: 'Monthly recap', fr: 'Récap mensuel' } as T,
      avancement: { en: 'Progress', fr: 'Avancement' } as T,
      ecarts: { en: 'Discrepancies', fr: 'Écarts' } as T,
      notices: { en: 'Notices', fr: 'Notifications' } as T,
    },
    viewsAria: { en: 'Oversight views', fr: 'Vues du pilotage' } as T,
    // The count beside a tab names its noun for screen readers
    // (`<view>One` / `<view>Other`, picked by format.ts pluralSuffix).
    tabCount: {
      ecartsOne: { en: '{count} discrepancy over the period', fr: '{count} écart sur la période' } as T,
      ecartsOther: { en: '{count} discrepancies over the period', fr: '{count} écarts sur la période' } as T,
      noticesOne: { en: '{count} failed notice', fr: '{count} notification en échec' } as T,
      noticesOther: { en: '{count} failed notices', fr: '{count} notifications en échec' } as T,
    },

    // Theoretical consumption of the recap: one plate per thermoformed
    // aligner, one model per print.
    consumption: {
      title: { en: 'Theoretical consumption', fr: 'Consommation théorique' } as T,
      hint: {
        en: 'One plate per thermoformed aligner, one model per print.',
        fr: 'Une plaque par aligneur thermoformé, un modèle par impression.',
      } as T,
      plates: { en: 'Plates', fr: 'Plaques' } as T,
      models: { en: 'Models', fr: 'Modèles' } as T,
    },

    // The four act figures (journal and recap).
    totals: {
      aria: { en: 'Totals per act', fr: 'Totaux par acte' } as T,
      entriesOne: { en: '{count} entry', fr: '{count} saisie' } as T,
      entriesOther: { en: '{count} entries', fr: '{count} saisies' } as T,
    },

    // Column headers read `production.actsShort` / `production.actsAbbr`:
    // the technician and the desk name an act's column the same way.
    // Warning labels come from `production.warnings.<code>.title` (the
    // same words as the declaration form).
    steps: {
      one: { en: 'Step {n}', fr: 'Étape {n}' } as T,
      range: { en: 'Steps {from}–{to}', fr: 'Étapes {from} à {to}' } as T,
      many: { en: 'Steps {list}', fr: 'Étapes {list}' } as T,
    },

    // Shared column and row words.
    cols: {
      case: { en: 'Case', fr: 'Cas' } as T,
      author: { en: 'Entered by', fr: 'Saisi par' } as T,
      day: { en: 'Day', fr: 'Jour' } as T,
      total: { en: 'Total', fr: 'Total' } as T,
      cancelled: { en: 'Cancelled', fr: 'Annulées' } as T,
      cancelledTiny: { en: 'Canc.', fr: 'Ann.' } as T,
      quantity: { en: 'Qty', fr: 'Qté' } as T,
    },
    rows: {
      deletedAccount: { en: 'Deleted account', fr: 'Compte supprimé' } as T,
      legacy: { en: 'History', fr: 'Historique' } as T,
      deliveredTo: { en: 'Handed to {recipient}', fr: 'Remis à : {recipient}' } as T,
      deliveredToNamed: { en: 'Handed to {recipient} ({name})', fr: 'Remis à : {recipient} ({name})' } as T,
      note: { en: 'Note: {note}', fr: 'Note : {note}' } as T,
      warningsAria: { en: 'Confirmed warnings', fr: 'Avertissements confirmés' } as T,
      cancelledBy: {
        en: 'Cancelled {date} at {time} by {name}',
        fr: 'Annulée le {date} à {time} par {name}',
      } as T,
      reason: { en: 'Reason: {reason}', fr: 'Motif : {reason}' } as T,
      openSheet: { en: 'Open the production sheet of {code}', fr: 'Ouvrir la fiche de production de {code}' } as T,
      showAll: { en: 'Show all {count}', fr: 'Afficher les {count}' } as T,
      showLess: { en: 'Show less', fr: 'Réduire' } as T,
    },

    // ── Journal ────────────────────────────────────────────────────
    journal: {
      dayAria: { en: 'Day of the log', fr: 'Jour du journal' } as T,
      dayLabel: { en: 'Day', fr: 'Jour' } as T,
      previous: { en: 'Previous day', fr: 'Jour précédent' } as T,
      next: { en: 'Next day', fr: 'Jour suivant' } as T,
      today: { en: 'Today', fr: 'Aujourd’hui' } as T,
      byCase: { en: 'By case', fr: 'Par cas' } as T,
      byCaseHint: {
        en: 'Quantities entered for the day, per act. Open a case for its history.',
        fr: 'Quantités saisies ce jour, par acte. Ouvrez un cas pour son historique.',
      } as T,
      byAuthor: { en: 'By person', fr: 'Par personne' } as T,
      byAuthorHint: { en: 'Who entered what.', fr: 'Qui a saisi quoi.' } as T,
      events: { en: 'Entries of the day', fr: 'Saisies du jour' } as T,
      eventsHint: {
        en: 'In the order they were done. A both-arch entry shows once.',
        fr: 'Dans l’ordre où elles ont été faites. Une saisie des deux arcades apparaît une fois.',
      } as T,
      cancelled: { en: 'Cancelled entries', fr: 'Saisies annulées' } as T,
      cancelledHint: {
        en: 'Done that day, then cancelled: they count nowhere.',
        fr: 'Datées de ce jour puis annulées : elles ne comptent nulle part.',
      } as T,
      cancelledNone: { en: 'No entry of this day was cancelled.', fr: 'Aucune saisie de ce jour n’a été annulée.' } as T,
      emptyTitle: { en: 'Nothing entered that day', fr: 'Aucune saisie ce jour-là' } as T,
      emptyBody: {
        en: 'No act was entered for {day}. Pick another day with the arrows.',
        fr: 'Aucun acte n’a été saisi pour le {day}. Choisissez un autre jour avec les flèches.',
      } as T,
      loadFailed: { en: 'Could not load the log.', fr: 'Impossible de charger le journal.' } as T,
    },

    // ── Recap and the shared period (recap + discrepancies) ─────────
    period: {
      aria: { en: 'Period', fr: 'Période' } as T,
      label: { en: 'Period', fr: 'Période' } as T,
      thisMonth: { en: 'This month', fr: 'Ce mois' } as T,
      lastMonth: { en: 'Last month', fr: 'Mois précédent' } as T,
      month: { en: 'Another month', fr: 'Autre mois' } as T,
      monthAria: { en: 'Pick a month', fr: 'Choisir un mois' } as T,
      custom: { en: 'Custom', fr: 'Personnalisée' } as T,
      span: { en: 'From {from} to {to} · {days} days', fr: 'Du {from} au {to} · {days} jours' } as T,
      oneDay: { en: '{day} · 1 day', fr: 'Le {day} · 1 jour' } as T,
      tooLong: {
        en: 'A period covers at most 366 days.',
        fr: 'Une période couvre au plus 366 jours.',
      } as T,
    },
    recap: {
      chartTitle: { en: 'Per day', fr: 'Par jour' } as T,
      chartActAria: { en: 'Act shown in the chart', fr: 'Acte affiché dans le graphique' } as T,
      chartSummary: {
        en: '{act} per day from {from} to {to}: {total} in all, at most {max} on {maxDay}.',
        fr: '{act} par jour du {from} au {to} : {total} au total, au plus {max} le {maxDay}.',
      } as T,
      chartEmpty: { en: '{act}: none over the period.', fr: '{act} : aucun sur la période.' } as T,
      byDay: { en: 'Day by day', fr: 'Jour par jour' } as T,
      byDayHint: {
        en: 'Quantities per act. A day without entries shows 0; cancelled entries count apart.',
        fr: 'Quantités par acte. Un jour sans saisie affiche 0 ; les saisies annulées sont comptées à part.',
      } as T,
      byAuthor: { en: 'By person', fr: 'Par personne' } as T,
      byCase: { en: 'By case', fr: 'Par cas' } as T,
      byCaseHint: { en: 'Cases with entries over the period.', fr: 'Cas ayant des saisies sur la période.' } as T,
      futureNote: {
        en: 'The period ends after today: the days to come are not listed.',
        fr: 'La période se termine après aujourd’hui : les jours à venir ne sont pas listés.',
      } as T,
      emptyTitle: { en: 'Nothing entered over the period', fr: 'Aucune saisie sur la période' } as T,
      emptyBody: {
        en: 'No act was entered from {from} to {to}.',
        fr: 'Aucun acte n’a été saisi du {from} au {to}.',
      } as T,
      loadFailed: { en: 'Could not load the recap.', fr: 'Impossible de charger le récap.' } as T,
    },
    exportCsv: {
      button: { en: 'Export', fr: 'Exporter' } as T,
      menuLabel: { en: 'CSV for Excel · {range}', fr: 'CSV pour Excel · {range}' } as T,
      detail: { en: 'Every entry', fr: 'Détail des saisies' } as T,
      detailHint: {
        en: 'One line per entry, cancelled and imported ones flagged.',
        fr: 'Une ligne par saisie, annulées et historique signalées.',
      } as T,
      daily: { en: 'Totals per day', fr: 'Totaux par jour' } as T,
      dailyHint: {
        en: 'One line per day, with the consumption and a total line.',
        fr: 'Une ligne par jour, avec la consommation et une ligne de total.',
      } as T,
      done: { en: 'Export downloaded.', fr: 'Export téléchargé.' } as T,
      working: { en: 'Preparing the export…', fr: 'Préparation de l’export…' } as T,
    },

    // ── Progress ("Avancement") ──────────────────────────────────────
    progress: {
      searchPlaceholder: { en: 'Reference, patient or practitioner', fr: 'Référence, patient ou praticien' } as T,
      searchAria: { en: 'Search the cases', fr: 'Rechercher un cas' } as T,
      stateAria: { en: 'Which cases', fr: 'Quels cas' } as T,
      states: {
        all: { en: 'All', fr: 'Tous' } as T,
        active: { en: 'In production', fr: 'En production' } as T,
        done: { en: 'Done', fr: 'Terminés' } as T,
      },
      colArch: { en: 'Arch', fr: 'Arcade' } as T,
      colPlanned: { en: 'Planned', fr: 'Prévu' } as T,
      colRemaining: { en: 'Left', fr: 'Reste' } as T,
      colActivity: { en: 'Activity', fr: 'Activité' } as T,
      first: { en: 'Started {day}', fr: 'Début le {day}' } as T,
      last: { en: 'Last act {day}', fr: 'Dernier acte le {day}' } as T,
      noActivity: { en: 'Nothing entered yet', fr: 'Aucune saisie' } as T,
      provisional: { en: 'prov.', fr: 'prov.' } as T,
      provisionalPack: {
        en: 'Provisional total: the pack’s maximum (no approved plan with totals).',
        fr: 'Total provisoire : le maximum du pack (pas de plan approuvé chiffré).',
      } as T,
      provisionalCase: {
        en: 'Provisional total: the order’s aligner count (no approved plan with totals).',
        fr: 'Total provisoire : le nombre d’aligneurs de la commande (pas de plan approuvé chiffré).',
      } as T,
      unknownTotal: { en: 'Planned total unknown', fr: 'Total prévu inconnu' } as T,
      notTreated: { en: 'Not treated', fr: 'Non traitée' } as T,
      inQueue: { en: 'In the queue', fr: 'En file' } as T,
      complete: { en: 'Fully delivered', fr: 'Livraison complète' } as T,
      emptyTitle: { en: 'No case in production yet', fr: 'Aucun cas en production pour l’instant' } as T,
      emptyBody: {
        en: 'Cases appear here once they reach fabrication or have a released batch.',
        fr: 'Les cas apparaissent ici dès qu’ils passent en fabrication ou ont un lot libéré.',
      } as T,
      noMatchTitle: { en: 'No case matches', fr: 'Aucun cas ne correspond' } as T,
      noMatchBody: { en: 'Change the search or the filter.', fr: 'Modifiez la recherche ou le filtre.' } as T,
      clear: { en: 'Clear the filters', fr: 'Effacer les filtres' } as T,
      loadFailed: { en: 'Could not load the progress.', fr: 'Impossible de charger l’avancement.' } as T,
    },

    // ── Discrepancies ("Écarts") ─────────────────────────────────────
    anomalies: {
      filterAria: { en: 'Kind of discrepancy', fr: 'Type d’écart' } as T,
      // A finding's `detail`, by kind (the notices reuse notices.skipReasons).
      detail: {
        act: { en: 'Act: {act}', fr: 'Acte : {act}' } as T,
        stageSkipped: {
          en: '{act} without “{previous}” on these steps',
          fr: '{act} sans « {previous} » sur ces étapes',
        } as T,
        coverageStarted: {
          en: 'Coverage started on {date} at {time}',
          fr: 'Couverture démarrée le {date} à {time}',
        } as T,
        batch: { en: 'Batch of steps {from} to {to}', fr: 'Lot des étapes {from} à {to}' } as T,
      },
      all: { en: 'All', fr: 'Tous' } as T,
      // PRODUCTION_ANOMALY → a short name and what it means, in plain words.
      kinds: {
        stage_skipped: {
          title: { en: 'Stage skipped', fr: 'Étape sautée' } as T,
          body: {
            en: 'A later act covers steps the previous act does not (cut without thermoforming, delivered without cutting…). An entry may be missing.',
            fr: 'Un acte couvre des étapes que l’acte précédent ne couvre pas (découpé sans thermoformage, livré sans découpe…). Une saisie manque peut-être.',
          } as T,
        },
        duplicate_declaration: {
          title: { en: 'Entered twice', fr: 'Saisie en double' } as T,
          body: {
            en: 'Steps entered a second time for the same act, after confirmation: a reprint, a re-cut or a second delivery. Check it was a remake.',
            fr: 'Des étapes saisies une seconde fois pour le même acte, après confirmation : réimpression, nouvelle découpe ou seconde livraison. Vérifiez qu’il s’agit d’une refabrication.',
          } as T,
        },
        unreleased_delivery: {
          title: { en: 'Delivered before release', fr: 'Livré avant libération' } as T,
          body: {
            en: 'An administrator confirmed the delivery of steps whose batch was not paid yet. The batch turns delivered once it is paid.',
            fr: 'Un administrateur a confirmé la livraison d’étapes dont le lot n’était pas encore payé. Le lot passera livré une fois payé.',
          } as T,
        },
        confirmed_warning: {
          title: { en: 'Warning confirmed', fr: 'Avertissement confirmé' } as T,
          body: {
            en: 'An entry was saved despite a warning, with a note: previous stage missing, other quantity, beyond the planned total, untreated arch…',
            fr: 'Une saisie enregistrée malgré un avertissement, avec une note : étape précédente manquante, autre quantité, au-delà du total prévu, arcade non traitée…',
          } as T,
        },
        cancelled_event: {
          title: { en: 'Entry cancelled', fr: 'Saisie annulée' } as T,
          body: {
            en: 'An entry of the period was cancelled. Its reason shows here only: the practitioner never sees it.',
            fr: 'Une saisie de la période a été annulée. Son motif n’apparaît qu’ici : le praticien ne le voit jamais.',
          } as T,
        },
        notice_failed: {
          title: { en: 'Notice failed', fr: 'Notification en échec' } as T,
          body: {
            en: 'Sending to the practitioner failed five times. Fix the cause, then resend it from the Notices tab.',
            fr: 'L’envoi au praticien a échoué cinq fois. Corrigez la cause, puis relancez-la depuis l’onglet Notifications.',
          } as T,
        },
        notice_skipped: {
          title: { en: 'Notice not sent', fr: 'Notification non envoyée' } as T,
          body: {
            en: 'The notice could not leave: e-mail is not set up on the server, or the practitioner has no address. Resend it once fixed.',
            fr: 'La notification n’a pas pu partir : l’e-mail n’est pas configuré sur le serveur, ou le praticien n’a pas d’adresse. Relancez-la une fois corrigé.',
          } as T,
        },
        finished_incomplete: {
          title: { en: 'Finished, not fully delivered', fr: 'Terminé, livraison incomplète' } as T,
          body: {
            en: 'The case is closed while a treated arch is not fully delivered.',
            fr: 'Le cas est clôturé alors qu’une arcade traitée n’est pas entièrement livrée.',
          } as T,
        },
        planned_total_unknown: {
          title: { en: 'Planned total unknown', fr: 'Total prévu inconnu' } as T,
          body: {
            en: 'A treated arch has no approved plan with totals, no pack and no aligner count: what is left cannot be computed.',
            fr: 'Une arcade traitée n’a ni plan approuvé chiffré, ni pack, ni nombre d’aligneurs : le reste à faire ne peut pas être calculé.',
          } as T,
        },
        coverage_started_by_cancelled_delivery: {
          title: { en: 'Coverage started by a cancelled delivery', fr: 'Couverture démarrée par une livraison annulée' } as T,
          body: {
            en: 'The case’s coverage window started on a delivery that was cancelled since. Check its start date.',
            fr: 'La période de couverture du cas a démarré sur une livraison annulée depuis. Vérifiez sa date de début.',
          } as T,
        },
        batch_kept_after_cancel: {
          title: { en: 'Batch kept delivered', fr: 'Lot resté livré' } as T,
          body: {
            en: 'A delivery was cancelled on a finished case: its batch stayed delivered. Check the batch in the quotation.',
            fr: 'Une livraison a été annulée sur un cas terminé : son lot est resté livré. Vérifiez le lot dans le devis.',
          } as T,
        },
      },
      openSheet: { en: 'Production sheet', fr: 'Fiche de production' } as T,
      openOrder: { en: 'Order', fr: 'Commande' } as T,
      seeNotices: { en: 'See the notices', fr: 'Voir les notifications' } as T,
      emptyTitle: { en: 'No discrepancy over the period', fr: 'Aucun écart sur la période' } as T,
      emptyBody: {
        en: 'Everything entered from {from} to {to} is consistent.',
        fr: 'Tout ce qui a été saisi du {from} au {to} est cohérent.',
      } as T,
      kindEmpty: { en: 'No discrepancy of this kind over the period.', fr: 'Aucun écart de ce type sur la période.' } as T,
      // A long block shows its newest rows first, then 50 more per click.
      showMore: { en: 'Show more', fr: 'Afficher plus' } as T,
      shownOf: { en: '{shown} of {total} shown', fr: '{shown} sur {total} affichés' } as T,
      loadFailed: { en: 'Could not load the discrepancies.', fr: 'Impossible de charger les écarts.' } as T,
    },

    // ── Notices (outbox) ─────────────────────────────────────────────
    notices: {
      statusAria: { en: 'Notice status', fr: 'Statut des notifications' } as T,
      all: { en: 'All', fr: 'Toutes' } as T,
      statuses: {
        pending: { en: 'Waiting', fr: 'En attente' } as T,
        sending: { en: 'Sending', fr: 'En cours d’envoi' } as T,
        sent: { en: 'Sent', fr: 'Envoyée' } as T,
        failed: { en: 'Failed', fr: 'Échouée' } as T,
        skipped: { en: 'Not sent', fr: 'Non envoyée' } as T,
      },
      // Plural forms for the filter chips.
      statusesMany: {
        pending: { en: 'Waiting', fr: 'En attente' } as T,
        sending: { en: 'Sending', fr: 'En cours d’envoi' } as T,
        sent: { en: 'Sent', fr: 'Envoyées' } as T,
        failed: { en: 'Failed', fr: 'Échouées' } as T,
        skipped: { en: 'Not sent', fr: 'Non envoyées' } as T,
      },
      channels: {
        in_app: { en: 'In the app', fr: 'Dans l’application' } as T,
        email: { en: 'E-mail', fr: 'E-mail' } as T,
      },
      kinds: {
        delivered: { en: 'Delivery', fr: 'Livraison' } as T,
        correction: { en: 'Correction', fr: 'Correction' } as T,
      },
      skipReasons: {
        not_configured: { en: 'E-mail is not set up on the server', fr: 'E-mail non configuré sur le serveur' } as T,
        no_recipient: { en: 'The practitioner has no e-mail address', fr: 'Le praticien n’a pas d’adresse e-mail' } as T,
        cancelled_before_send: { en: 'Delivery cancelled before sending', fr: 'Livraison annulée avant l’envoi' } as T,
        original_not_sent: { en: 'The original notice was never sent', fr: 'La notification d’origine n’est jamais partie' } as T,
      },
      colOrder: { en: 'Order', fr: 'Commande' } as T,
      colChannel: { en: 'Channel', fr: 'Canal' } as T,
      colStatus: { en: 'Status', fr: 'Statut' } as T,
      colAttempts: { en: 'Attempts', fr: 'Tentatives' } as T,
      colDetail: { en: 'Detail', fr: 'Détail' } as T,
      colDates: { en: 'Dates', fr: 'Dates' } as T,
      colAction: { en: 'Action', fr: 'Action' } as T,
      attempts: { en: '{count} of {max}', fr: '{count} sur {max}' } as T,
      created: { en: 'Created {date}', fr: 'Créée le {date}' } as T,
      due: { en: 'Due {date}', fr: 'Prévue le {date}' } as T,
      sent: { en: 'Sent {date}', fr: 'Envoyée le {date}' } as T,
      to: { en: 'To {address}', fr: 'À {address}' } as T,
      retry: { en: 'Resend', fr: 'Relancer' } as T,
      retrying: { en: 'Resending…', fr: 'Relance…' } as T,
      retryAria: { en: 'Resend the {channel} notice of {code}', fr: 'Relancer la notification {channel} de {code}' } as T,
      retried: {
        en: 'Notice resent: it is back in the sending queue.',
        fr: 'Notification relancée : elle repart dans la file d’envoi.',
      } as T,
      emptyTitle: { en: 'No notice yet', fr: 'Aucune notification pour l’instant' } as T,
      emptyBody: {
        en: 'Each delivery entered tells the practitioner by e-mail and in the app; those notices show here.',
        fr: 'Chaque livraison saisie prévient le praticien par e-mail et dans l’application ; ces notifications apparaissent ici.',
      } as T,
      noMatchTitle: { en: 'No notice with this status', fr: 'Aucune notification avec ce statut' } as T,
      showAll: { en: 'Show every notice', fr: 'Afficher toutes les notifications' } as T,
      loadFailed: { en: 'Could not load the notices.', fr: 'Impossible de charger les notifications.' } as T,
    },

    // The error codes themselves read from `production.errors.*` (one
    // mapping with the technician screens, lib/production/errors.ts).
    errors: {
      retry: { en: 'Try again', fr: 'Réessayer' } as T,
    },
  },
};

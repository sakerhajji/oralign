import type { Lang } from './dict';

type T = Record<Lang, string>;

/**
 * The 403 ACCOUNT_DORMANT text. The server's own message is French only,
 * so the API client (lib/api/client.ts, which has no t() in scope) puts
 * this one, in the dashboard language, on the refused response; every
 * toast and inline error then reads it. Neutral on purpose: a dentist
 * reads it about his own account, an admin about the practitioner he
 * acts for. Also in the dictionary as `accountActivity.errors.dormant`.
 */
export const ACCOUNT_DORMANT_ERROR_COPY = {
  en: 'This practitioner account is inactive: no order has been submitted for several months. It must be reactivated before any new order.',
  fr: 'Ce compte praticien est inactif : aucune commande n’a été soumise depuis plusieurs mois. Il doit être réactivé avant toute nouvelle commande.',
} as T;

/**
 * Doctor inactivity (spec §5): the « Activité » section of the user
 * detail sheet (status, last submitted order, deadline, Réactiver with a
 * reason, the event journal), the « Activité » filter, badges and counter
 * of the users desk, the doctor dashboard banner, the gate of
 * /dashboard/orders/new, the wizard and supplemental notices, and the
 * ACCOUNT_DORMANT copy. Owned by P-E (doctor-inactivity). Dates are
 * Africa/Tunis days (lib/account-activity).
 *
 * Wording: « inactif » is the dormancy of the rule (no submitted order
 * for months: ordering closed, hidden from the directory); « bloqué » is
 * the admin lockout (isActive). Never mix the two.
 *
 * A unique top-level namespace (`accountActivity`), spread into dict
 * (`...accountActivityDomainDict`) by the main dictionary, which
 * shallow-spreads its domains, so no other file may use this key. Same
 * leaf shape as dict.ts: every leaf is `{ en, fr } as T`. Counted labels
 * come in `…One` / `…Many` pairs (see `useCountLabel`).
 */
export const accountActivityDomainDict = {
  accountActivity: {
    status: {
      active: { en: 'Active', fr: 'Actif' } as T,
      warned: { en: 'Inactive soon', fr: 'Bientôt inactif' } as T,
      inactive: { en: 'Inactive', fr: 'Inactif' } as T,
    },

    // ── Users desk: badges, filter, counter ──────────────────────────────
    badge: {
      inactive: { en: 'Inactive', fr: 'Inactif' } as T,
      inactiveTitle: {
        en: 'No order submitted for months: creating and submitting orders is suspended until an admin reactivates the account.',
        fr: 'Aucune commande soumise depuis plusieurs mois : création et soumission de commandes suspendues jusqu’à la réactivation du compte.',
      } as T,
      warned: { en: 'Inactive on {date}', fr: 'Inactif le {date}' } as T,
      warnedTitle: {
        en: 'Without a submitted order by {date}, the account becomes inactive.',
        fr: 'Sans commande soumise d’ici le {date}, le compte passera en inactif.',
      } as T,
    },
    list: {
      lastOrder: { en: 'Last order: {date}', fr: 'Dernière commande : {date}' } as T,
      noOrder: { en: 'No order submitted', fr: 'Aucune commande soumise' } as T,
    },
    filter: {
      label: { en: 'Activity', fr: 'Activité' } as T,
      all: { en: 'All activity', fr: 'Toute activité' } as T,
      active: { en: 'Active', fr: 'Actifs' } as T,
      warned: { en: 'Inactive soon', fr: 'Bientôt inactifs' } as T,
      inactive: { en: 'Inactive', fr: 'Inactifs' } as T,
    },
    stats: {
      dormant: { en: 'Inactive practitioners', fr: 'Praticiens inactifs' } as T,
      dormantDetail: {
        en: 'No order submitted for months',
        fr: 'Sans commande soumise depuis des mois',
      } as T,
      show: { en: 'Show inactive practitioners', fr: 'Afficher les praticiens inactifs' } as T,
    },

    // ── User sheet → Account → Activité ──────────────────────────────────
    section: {
      title: { en: 'Activity', fr: 'Activité' } as T,
      statusLabel: { en: 'Activity status', fr: 'Statut d’activité' } as T,
      lastOrder: { en: 'Last submitted order', fr: 'Dernière commande soumise' } as T,
      noOrder: { en: 'None yet', fr: 'Aucune pour l’instant' } as T,
      anchor: { en: 'Period starts', fr: 'Début du délai' } as T,
      deadline: { en: 'Becomes inactive on', fr: 'Passage en inactif le' } as T,
      deadlineInOne: { en: 'in {count} day', fr: 'dans {count} jour' } as T,
      deadlineInMany: { en: 'in {count} days', fr: 'dans {count} jours' } as T,
      inactiveSince: { en: 'Inactive since', fr: 'Inactif depuis le' } as T,
      reactivatedAt: { en: 'Last reactivation', fr: 'Dernière réactivation' } as T,
      ruleOff: {
        en: 'The inactivity rule is switched off (billing settings): no warning is sent and no account becomes inactive.',
        fr: 'La règle d’inactivité est désactivée (paramètres de facturation) : aucun avertissement n’est envoyé et aucun compte ne passe en inactif.',
      } as T,
      notConcerned: {
        en: 'The rule only runs for approved, unblocked practitioner accounts.',
        fr: 'La règle ne s’applique qu’aux comptes praticiens approuvés et non bloqués.',
      } as T,
      dormantExplain: {
        en: 'The practitioner keeps access to the account, payments, plan approvals and messages, but can no longer create or submit orders, and no longer appears in the public directory.',
        fr: 'Le praticien garde l’accès à son espace, à ses paiements, à la validation de ses plans et à ses échanges, mais ne peut plus créer ni soumettre de commande et n’apparaît plus dans l’annuaire public.',
      } as T,
      warnedExplain: {
        en: 'Without a new submitted order by this date, the account becomes inactive. The practitioner is warned by e-mail and in the app 30 and 7 days before.',
        fr: 'Sans nouvelle commande soumise d’ici cette date, le compte passera en inactif. Le praticien est prévenu par e-mail et dans l’application 30 puis 7 jours avant.',
      } as T,
      reactivate: { en: 'Reactivate the account', fr: 'Réactiver le compte' } as T,
    },
    reactivate: {
      title: { en: 'Reactivate {name}?', fr: 'Réactiver {name} ?' } as T,
      description: {
        en: 'The practitioner can create and submit orders again and reappears in the public directory if listed there. A new inactivity period starts today, and the practitioner is told by e-mail.',
        fr: 'Le praticien pourra de nouveau créer et soumettre des commandes, et réapparaîtra dans l’annuaire public s’il y est inscrit. Un nouveau délai d’inactivité démarre aujourd’hui ; le praticien est prévenu par e-mail.',
      } as T,
      reasonLabel: { en: 'Reason for the reactivation', fr: 'Motif de la réactivation' } as T,
      reasonHint: {
        en: 'Kept in the account history, never shown to the practitioner.',
        fr: 'Conservé dans l’historique du compte, jamais montré au praticien.',
      } as T,
      reasonPlaceholder: {
        en: 'E.g. the practitioner resumes cases in January.',
        fr: 'Ex. : le praticien reprend ses cas en janvier.',
      } as T,
      counter: { en: '{count} / {max}', fr: '{count} / {max}' } as T,
      tooShort: {
        en: 'Give a reason of at least {min} characters.',
        fr: 'Indiquez un motif d’au moins {min} caractères.',
      } as T,
      tooLong: {
        en: 'The reason cannot exceed {max} characters.',
        fr: 'Le motif ne peut pas dépasser {max} caractères.',
      } as T,
      confirm: { en: 'Reactivate', fr: 'Réactiver' } as T,
      pending: { en: 'Reactivating…', fr: 'Réactivation…' } as T,
      cancel: { en: 'Cancel', fr: 'Annuler' } as T,
      success: { en: '{name} is reactivated.', fr: 'Le compte de {name} est réactivé.' } as T,
    },
    journal: {
      title: { en: 'Account history', fr: 'Historique du compte' } as T,
      empty: {
        en: 'Nothing recorded yet: warnings, inactivity, reactivations and blocks will show here.',
        fr: 'Rien pour l’instant : les avertissements, passages en inactif, réactivations et blocages apparaîtront ici.',
      } as T,
      loadError: {
        en: 'The account history could not be loaded.',
        fr: 'Impossible de charger l’historique du compte.',
      } as T,
      retry: { en: 'Retry', fr: 'Réessayer' } as T,
      system: { en: 'Automatic daily check', fr: 'Contrôle quotidien automatique' } as T,
      by: { en: 'By {name}', fr: 'Par {name}' } as T,
      reason: { en: 'Reason: {reason}', fr: 'Motif : {reason}' } as T,
      announced: { en: 'Announced date: {date}', fr: 'Date annoncée : {date}' } as T,
      newer: { en: 'Newer', fr: 'Plus récents' } as T,
      older: { en: 'Older', fr: 'Plus anciens' } as T,
      page: { en: 'Page {page} of {total}', fr: 'Page {page} sur {total}' } as T,
      aria: { en: 'Account history', fr: 'Historique du compte' } as T,
    },
    events: {
      warning_30d: { en: '30-day warning sent', fr: 'Avertissement à 30 jours envoyé' } as T,
      warning_7d: { en: '7-day warning sent', fr: 'Avertissement à 7 jours envoyé' } as T,
      deactivated: { en: 'Became inactive', fr: 'Passé en inactif' } as T,
      reactivated: { en: 'Reactivated', fr: 'Réactivé' } as T,
      blocked: { en: 'Blocked', fr: 'Bloqué' } as T,
      unblocked: { en: 'Unblocked', fr: 'Débloqué' } as T,
    },

    // ── Doctor dashboard banner ──────────────────────────────────────────
    banner: {
      dormantTitle: { en: 'Your account is inactive', fr: 'Votre compte est inactif' } as T,
      dormantBody: {
        en: 'No order has been submitted for several months. Creating and submitting orders is suspended and your practice no longer appears in the public directory. Your ongoing treatments, payments and messages stay available.',
        fr: 'Aucune commande n’a été soumise depuis plusieurs mois. La création et la soumission de commandes sont suspendues et votre cabinet n’apparaît plus dans l’annuaire public. Vos traitements en cours, vos paiements et vos échanges restent accessibles.',
      } as T,
      dormantSince: { en: 'Inactive since {date}.', fr: 'Inactif depuis le {date}.' } as T,
      dormantHow: {
        en: 'To order again, ask the Oralign team to reactivate your account.',
        fr: 'Pour commander de nouveau, demandez à l’équipe Oralign de réactiver votre compte.',
      } as T,
      warnedTitle: {
        en: 'Your account will become inactive on {date}',
        fr: 'Votre compte deviendra inactif le {date}',
      } as T,
      warnedBody: {
        en: 'No order has been submitted recently. Submit an order by this date to keep ordering and stay listed in the practitioner directory.',
        fr: 'Aucune commande n’a été soumise récemment. Soumettez une commande d’ici cette date pour continuer à commander et rester visible dans l’annuaire des praticiens.',
      } as T,
      contact: { en: 'Contact Oralign', fr: 'Contacter Oralign' } as T,
      newOrder: { en: 'Create an order', fr: 'Créer une commande' } as T,
    },

    // ── /dashboard/orders/new for a dormant doctor ───────────────────────
    gate: {
      title: { en: 'Ordering is suspended', fr: 'Création de commandes suspendue' } as T,
      body: {
        en: 'Your account is inactive because no order has been submitted for several months. To create orders again, ask the Oralign team to reactivate it.',
        fr: 'Votre compte est inactif faute de commande soumise depuis plusieurs mois. Pour créer de nouveau des commandes, demandez à l’équipe Oralign de le réactiver.',
      } as T,
      keeps: {
        en: 'You can still follow your treatments, settle your payments, approve your plans and talk to the team.',
        fr: 'Vous pouvez toujours suivre vos traitements, régler vos paiements, valider vos plans et échanger avec l’équipe.',
      } as T,
      contact: { en: 'Contact Oralign', fr: 'Contacter Oralign' } as T,
      back: { en: 'Back to the dashboard', fr: 'Retour au tableau de bord' } as T,
    },

    // ── Order wizard / supplemental requests ─────────────────────────────
    wizard: {
      blockedTitle: { en: 'Submission unavailable', fr: 'Soumission impossible pour le moment' } as T,
      blockedSelf: {
        en: 'Your account is inactive: this draft is kept, and you can submit it as soon as the Oralign team reactivates your account.',
        fr: 'Votre compte est inactif : ce brouillon est conservé et vous pourrez le soumettre dès que l’équipe Oralign aura réactivé votre compte.',
      } as T,
      blockedAdmin: {
        en: 'This practitioner is inactive: reactivate the account from Users before submitting this order.',
        fr: 'Ce praticien est inactif : réactivez son compte depuis Utilisateurs avant de soumettre cette commande.',
      } as T,
      dentistDormant: {
        en: 'This practitioner is inactive: reactivate the account from Users before creating an order.',
        fr: 'Ce praticien est inactif : réactivez son compte depuis Utilisateurs avant de lui créer une commande.',
      } as T,
      dentistOption: { en: '{name} (inactive)', fr: '{name} (inactif)' } as T,
      openUsers: { en: 'Open Users', fr: 'Ouvrir Utilisateurs' } as T,
    },
    supplemental: {
      blocked: {
        en: 'Your account is inactive: new requests are suspended until the Oralign team reactivates it.',
        fr: 'Votre compte est inactif : les nouvelles demandes sont suspendues jusqu’à sa réactivation par l’équipe Oralign.',
      } as T,
      submitBlocked: {
        en: 'Your account is inactive: this request stays a draft, and you can send it as soon as the Oralign team reactivates your account.',
        fr: 'Votre compte est inactif : cette demande reste en brouillon et vous pourrez l’envoyer dès que l’équipe Oralign aura réactivé votre compte.',
      } as T,
    },

    // ── Other "new order" entry points (sidebar, packs page) ─────────────
    ordering: {
      blocked: {
        en: 'Your account is inactive: creating orders is suspended until the Oralign team reactivates it.',
        fr: 'Votre compte est inactif : la création de commandes est suspendue jusqu’à sa réactivation par l’équipe Oralign.',
      } as T,
    },

    // ── API refusal (403 ACCOUNT_DORMANT), see ACCOUNT_DORMANT_ERROR_COPY ─
    errors: {
      dormant: ACCOUNT_DORMANT_ERROR_COPY,
    },
  },
};

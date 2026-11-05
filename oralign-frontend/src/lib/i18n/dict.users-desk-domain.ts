import type { Lang } from './dict';

type T = Record<Lang, string>;

/**
 * Admin Users page (list, search, filters, stats, gift control in the user sheet) —
 * spread into dict (`...usersDeskDomainDict`) by the main dictionary.
 * Same leaf shape as dict.ts: every leaf is `{ en, fr } as T`.
 * Counted labels come in `…One` / `…Many` pairs (see `useCountLabel`).
 */
export const usersDeskDomainDict = {
  usersDesk: {
    subtitle: {
      en: 'Accounts, roles, approvals and each practitioner’s Oralign gift.',
      fr: 'Comptes, rôles, approbations et cadeau Oralign de chaque praticien.',
    } as T,
    toastSelfKept: {
      en: 'Your own account was kept: you cannot delete it.',
      fr: 'Votre propre compte a été conservé : vous ne pouvez pas le supprimer.',
    } as T,

    tabs: {
      accounts: { en: 'Accounts', fr: 'Comptes' } as T,
      deleted: { en: 'Deleted', fr: 'Supprimés' } as T,
    },

    // Overview figures (GET /users/stats — the whole base, not the page)
    stats: {
      aria: { en: 'Users overview', fr: 'Vue d’ensemble des utilisateurs' } as T,
      total: { en: 'Users', fr: 'Utilisateurs' } as T,
      dentistsOne: { en: '{count} practitioner', fr: '{count} praticien' } as T,
      dentistsMany: { en: '{count} practitioners', fr: '{count} praticiens' } as T,
      adminsOne: { en: '{count} admin', fr: '{count} admin' } as T,
      adminsMany: { en: '{count} admins', fr: '{count} admins' } as T,
      active: { en: 'Active accounts', fr: 'Comptes actifs' } as T,
      blockedOne: { en: '{count} blocked', fr: '{count} bloqué' } as T,
      blockedMany: { en: '{count} blocked', fr: '{count} bloqués' } as T,
      pending: { en: 'Awaiting approval', fr: 'En attente d’approbation' } as T,
      pendingDetail: { en: 'Accounts to review', fr: 'Comptes à valider' } as T,
      giftAvailable: { en: 'Oralign gifts available', fr: 'Cadeaux Oralign disponibles' } as T,
      giftUsedOne: { en: '{count} already used', fr: '{count} déjà utilisé' } as T,
      giftUsedMany: { en: '{count} already used', fr: '{count} déjà utilisés' } as T,
    },

    pending: {
      hint: {
        en: 'Approve them to open their access to the platform.',
        fr: 'Approuvez-les pour leur ouvrir l’accès à la plateforme.',
      } as T,
      show: { en: 'Show pending accounts', fr: 'Voir les comptes en attente' } as T,
    },

    filters: {
      searchPh: {
        en: 'Name, email, phone or clinic…',
        fr: 'Nom, e-mail, tél. ou cabinet…',
      } as T,
      searchDeletedPh: {
        en: 'Search deleted accounts…',
        fr: 'Rechercher parmi les comptes supprimés…',
      } as T,
      searchAria: { en: 'Search users', fr: 'Rechercher des utilisateurs' } as T,
      clearSearch: { en: 'Clear search', fr: 'Effacer la recherche' } as T,
      updating: { en: 'Updating results…', fr: 'Mise à jour des résultats…' } as T,
      role: { en: 'Role', fr: 'Rôle' } as T,
      roleAll: { en: 'All roles', fr: 'Tous les rôles' } as T,
      status: { en: 'Status', fr: 'Statut' } as T,
      statusAll: { en: 'All statuses', fr: 'Tous les statuts' } as T,
      statusActive: { en: 'Active', fr: 'Actifs' } as T,
      statusBlocked: { en: 'Blocked', fr: 'Bloqués' } as T,
      approval: { en: 'Approval', fr: 'Approbation' } as T,
      approvalAll: { en: 'All approvals', fr: 'Toutes les approbations' } as T,
      approvalPending: { en: 'Awaiting approval', fr: 'En attente' } as T,
      approvalApproved: { en: 'Approved', fr: 'Approuvés' } as T,
      approvalRejected: { en: 'Rejected', fr: 'Rejetés' } as T,
      gift: { en: 'Oralign gift', fr: 'Cadeau Oralign' } as T,
      giftAll: { en: 'Gift: all', fr: 'Cadeau : tous' } as T,
      giftAvailable: { en: 'Gift: available', fr: 'Cadeau : disponible' } as T,
      giftUsed: { en: 'Gift: used', fr: 'Cadeau : utilisé' } as T,
      clear: { en: 'Clear filters', fr: 'Effacer les filtres' } as T,
    },

    list: {
      usersOne: { en: '{count} user', fr: '{count} utilisateur' } as T,
      usersMany: { en: '{count} users', fr: '{count} utilisateurs' } as T,
      deletedOne: { en: '{count} deleted account', fr: '{count} compte supprimé' } as T,
      deletedMany: { en: '{count} deleted accounts', fr: '{count} comptes supprimés' } as T,
      selectPage: { en: 'Select this page', fr: 'Sélectionner cette page' } as T,
      selectUser: { en: 'Select {name}', fr: 'Sélectionner {name}' } as T,
      colAccount: { en: 'Account', fr: 'Compte' } as T,
      colGift: { en: 'Oralign gift', fr: 'Cadeau Oralign' } as T,
      emailVerified: { en: 'Email verified', fr: 'E-mail vérifié' } as T,
      emailUnverified: { en: 'Email not verified', fr: 'E-mail non vérifié' } as T,
      lastLogin: { en: 'Last login: {date}', fr: 'Connexion : {date}' } as T,
      neverLoggedIn: { en: 'Never signed in', fr: 'Jamais connecté' } as T,
      created: { en: 'Created {date}', fr: 'Créé le {date}' } as T,
      open: { en: 'Open', fr: 'Ouvrir' } as T,
      openUser: { en: 'Open {name}’s profile', fr: 'Ouvrir la fiche de {name}' } as T,
      emptyFiltered: {
        en: 'No user matches these filters.',
        fr: 'Aucun utilisateur ne correspond à ces filtres.',
      } as T,
      loadError: {
        en: 'The users could not be loaded.',
        fr: 'Impossible de charger les utilisateurs.',
      } as T,
    },

    pagination: {
      aria: { en: 'Pagination', fr: 'Pagination' } as T,
      goTo: { en: 'Go to page {page}', fr: 'Aller à la page {page}' } as T,
      pageOf: { en: '{page} / {total}', fr: '{page} / {total}' } as T,
    },

    // Oralign gift: list badge + the "Cadeau Oralign" block of the user sheet
    gift: {
      available: { en: 'Gift available', fr: 'Cadeau disponible' } as T,
      used: { en: 'Gift used', fr: 'Cadeau utilisé' } as T,
      usedCase: { en: 'Gift used: case {code}', fr: 'Cadeau utilisé : cas {code}' } as T,
      manage: { en: 'Oralign gift', fr: 'Cadeau Oralign' } as T,
      title: { en: 'Oralign gift', fr: 'Cadeau Oralign' } as T,
      switchLabel: { en: 'Gift used', fr: 'Cadeau utilisé' } as T,
      switchHint: {
        en: 'On: the gift has been used. Off: it will be offered on the next case this practitioner submits.',
        fr: 'Activé : le cadeau a été utilisé. Désactivé : il sera offert sur le prochain cas soumis par ce praticien.',
      } as T,
      statusUsedOn: { en: 'Used on {date}', fr: 'Utilisé le {date}' } as T,
      statusOnCase: { en: 'on case', fr: 'sur le cas' } as T,
      statusManual: {
        en: '(marked by hand, no case attached)',
        fr: '(marqué manuellement, sans cas associé)',
      } as T,
      statusAvailable: {
        en: 'Available: it will be offered on the next submitted case.',
        fr: 'Disponible : sera offert sur le prochain cas soumis.',
      } as T,
      previousCase: { en: 'Last gift given on case', fr: 'Dernier cadeau offert sur le cas' } as T,
      archivedCase: { en: '(archived)', fr: '(archivé)' } as T,
      offerOff: {
        en: 'The Oralign gift offer is switched off (Settings → Billing): no gift is given while it stays off.',
        fr: 'L’offre Cadeau Oralign est désactivée (Paramètres → Facturation) : aucun cadeau n’est offert tant qu’elle reste désactivée.',
      } as T,
      toastUsed: { en: 'Gift marked as used.', fr: 'Cadeau marqué comme utilisé.' } as T,
      toastAvailable: {
        en: 'Gift available again: it will be offered on the next case.',
        fr: 'Cadeau de nouveau disponible : il sera offert sur le prochain cas.',
      } as T,
    },

    create: {
      emailInvalid: { en: 'Invalid email address', fr: 'Adresse e-mail invalide' } as T,
      passwordHint: {
        en: 'At least 8 characters. Share it with the user securely.',
        fr: 'Au moins 8 caractères. Transmettez-le à l’utilisateur de façon sécurisée.',
      } as T,
    },
  },
};

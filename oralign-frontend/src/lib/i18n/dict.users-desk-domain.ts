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
    // Bulk delete / restore / status run by an admin: super admin accounts
    // in the selection are left as they are (the API counts them).
    toastSuperAdminsSparedOne: {
      en: '{count} super admin account was left unchanged: only a super admin can change it.',
      fr: '{count} compte super administrateur n’a pas été modifié : seul un super administrateur peut le faire.',
    } as T,
    toastSuperAdminsSparedMany: {
      en: '{count} super admin accounts were left unchanged: only a super admin can change them.',
      fr: '{count} comptes super administrateur n’ont pas été modifiés : seul un super administrateur peut le faire.',
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
      techniciansOne: { en: '{count} technician', fr: '{count} technicienne' } as T,
      techniciansMany: { en: '{count} technicians', fr: '{count} techniciennes' } as T,
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
      mustChangePassword: { en: 'Password to change', fr: 'Mot de passe à changer' } as T,
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
      generateLabel: {
        en: 'Generate a temporary password',
        fr: 'Générer un mot de passe temporaire',
      } as T,
      generateHint: {
        en: 'Oralign creates a strong password and shows it once. The account must choose its own at the first sign-in.',
        fr: 'Oralign crée un mot de passe solide et l’affiche une seule fois. Le compte devra choisir le sien à la première connexion.',
      } as T,
      technicianNote: {
        en: 'Lab account: the production screens only, never any financial data. The email is verified and the account approved at once; no email is sent to her.',
        fr: 'Compte labo : les seuls écrans de production, sans aucune donnée financière. L’e-mail est validé et le compte approuvé d’office ; aucun e-mail ne lui est envoyé.',
      } as T,
      createdTitle: { en: 'Account created', fr: 'Compte créé' } as T,
      createdDesc: {
        en: '{name} signs in with {email} and this temporary password.',
        fr: '{name} se connecte avec {email} et ce mot de passe temporaire.',
      } as T,
      done: { en: 'Done', fr: 'Terminé' } as T,
    },

    // The generated password, shown once (create dialog and user sheet)
    tempPassword: {
      label: { en: 'Temporary password', fr: 'Mot de passe temporaire' } as T,
      copy: { en: 'Copy', fr: 'Copier' } as T,
      copied: { en: 'Copied', fr: 'Copié' } as T,
      copiedAnnounce: {
        en: 'Temporary password copied.',
        fr: 'Mot de passe temporaire copié.',
      } as T,
      copyFailed: {
        en: 'Copy failed: select the password and copy it by hand.',
        fr: 'Copie impossible : sélectionnez le mot de passe et copiez-le à la main.',
      } as T,
      onceTitle: {
        en: 'It will not be shown again',
        fr: 'Il ne sera plus affiché',
      } as T,
      onceNote: {
        en: 'Give it to {name} in person, not by email. At the first sign-in {name} chooses a personal password.',
        fr: 'Remettez-le à {name} en main propre, pas par e-mail. À la première connexion, {name} choisira un mot de passe personnel.',
      } as T,
    },

    // User sheet: password handover and the "password to change" state
    access: {
      issueAction: {
        en: 'New temporary password',
        fr: 'Nouveau mot de passe temporaire',
      } as T,
      issueHint: {
        en: 'Forgotten password or new tablet: generate a temporary password, shown once. Her old password stops working.',
        fr: 'Mot de passe oublié ou nouvelle tablette : générez un mot de passe temporaire, affiché une seule fois. L’ancien ne fonctionnera plus.',
      } as T,
      confirmTitle: {
        en: 'Generate a new temporary password?',
        fr: 'Générer un nouveau mot de passe temporaire ?',
      } as T,
      confirmDesc: {
        en: '{name}’s current password stops working and her open sessions are signed out. She will choose a new password at her next sign-in.',
        fr: 'Le mot de passe actuel de {name} ne fonctionnera plus et ses sessions ouvertes seront fermées. Elle choisira un nouveau mot de passe à sa prochaine connexion.',
      } as T,
      confirm: { en: 'Generate', fr: 'Générer' } as T,
      issuing: { en: 'Generating…', fr: 'Génération…' } as T,
      issued: {
        en: 'New temporary password generated.',
        fr: 'Nouveau mot de passe temporaire généré.',
      } as T,
      technicianOnly: {
        en: 'Only a technician account can receive a temporary password.',
        fr: 'Seul un compte de technicienne peut recevoir un mot de passe temporaire.',
      } as T,
      ownPassword: {
        en: 'Your own password is changed from your account, with your current password.',
        fr: 'Votre propre mot de passe se change depuis votre compte, avec votre mot de passe actuel.',
      } as T,
      ownPasswordLink: { en: 'Open my account', fr: 'Ouvrir mon compte' } as T,
      passwordLabel: { en: 'Password', fr: 'Mot de passe' } as T,
      passwordTemporary: {
        en: 'Temporary: to change at the next sign-in',
        fr: 'Temporaire : à changer à la prochaine connexion',
      } as T,
    },
  },
};

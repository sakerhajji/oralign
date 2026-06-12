import type { Lang } from './dict';

type T = Record<Lang, string>;

/**
 * Admin dashboard widgets, notification bell, doctor support chat —
 * spread into dict (`...chromeDomainDict`) by the main dictionary.
 *
 * Same leaf shape as dict.ts: every leaf is `{ en, fr } as T`.
 * Generic labels (Retry, Back, Loading…) intentionally live in
 * `common.*` / `dashboard.*` and are reused at the call sites, not
 * duplicated here.
 */
export const chromeDomainDict = {
  // ─── Admin dashboard (+ /dashboard role dispatcher page) ────────
  adminDashboard: {
    title: { en: 'Admin dashboard', fr: 'Tableau de bord administrateur' } as T,
    subtitle: {
      en: 'Real-time platform metrics — revenue, orders, doctors, packs.',
      fr: 'Indicateurs de la plateforme en temps réel — chiffre d’affaires, commandes, praticiens, forfaits.',
    } as T,
    refreshAria: { en: 'Refresh dashboard', fr: 'Actualiser le tableau de bord' } as T,
    errorTitle: {
      en: 'Dashboard data could not load',
      fr: 'Impossible de charger les données du tableau de bord',
    } as T,
    errorGeneric: {
      en: 'The backend did not respond. Make sure the API is running and your account has admin access.',
      fr: 'Le serveur n’a pas répondu. Vérifiez que l’API est démarrée et que votre compte dispose d’un accès administrateur.',
    } as T,

    // Strings used by the /dashboard role dispatcher page.
    pageLoading: {
      en: 'Loading your dashboard…',
      fr: 'Chargement de votre tableau de bord…',
    } as T,
    noRoleView: {
      en: 'No dashboard view is configured for your role yet.',
      fr: 'Aucune vue de tableau de bord n’est encore configurée pour votre rôle.',
    } as T,

    // KPI tiles — labels that don't already exist in dashboard.kpi.*
    kpi: {
      totalRevenueRange: {
        en: 'Total revenue (range)',
        fr: 'Chiffre d’affaires total (période)',
      } as T,
      unpaidAmount: { en: 'Unpaid: {amount}', fr: 'Impayé : {amount}' } as T,
      revenueThisMonth: {
        en: 'Revenue this month',
        fr: 'Chiffre d’affaires du mois',
      } as T,
      vsLastMonth: { en: 'vs last month', fr: 'vs mois précédent' } as T,
      todayAmount: { en: 'Today: {amount}', fr: 'Aujourd’hui : {amount}' } as T,
      prevMonthAmount: {
        en: 'Previous month: {amount}',
        fr: 'Mois précédent : {amount}',
      } as T,
      avgOrderValue: {
        en: 'Average order value',
        fr: 'Valeur moyenne par commande',
      } as T,
      conversion: { en: 'Conversion {pct}%', fr: 'Conversion {pct} %' } as T,
      conversionDetail: {
        en: 'Paid quotations ÷ total quotations',
        fr: 'Devis payés ÷ total des devis',
      } as T,
      pendingCount: { en: '{count} pending', fr: '{count} en attente' } as T,
      failedRejected: {
        en: 'Failed: {failed} · Rejected: {rejected}',
        fr: 'Échoués : {failed} · Rejetés : {rejected}',
      } as T,
      totalDoctors: { en: 'Total doctors', fr: 'Total des praticiens' } as T,
      activeInactive: {
        en: 'Active {active} · Inactive {inactive}',
        fr: 'Actifs {active} · Inactifs {inactive}',
      } as T,
      newInRange: {
        en: '+{count} new in range',
        fr: '+{count} nouveaux sur la période',
      } as T,
      newDoctorsRange: {
        en: 'New doctors (range)',
        fr: 'Nouveaux praticiens (période)',
      } as T,
      patientsInRange: {
        en: '+{count} in range',
        fr: '+{count} sur la période',
      } as T,
      activePacks: { en: 'Active packs', fr: 'Forfaits actifs' } as T,
      topPack: { en: 'Top: {name}', fr: 'Top : {name}' } as T,
      noBestSeller: {
        en: 'No best-seller yet',
        fr: 'Pas encore de meilleure vente',
      } as T,
      soldRevenue: {
        en: '{count} sold · {amount}',
        fr: '{count} vendus · {amount}',
      } as T,
      todayInRange: {
        en: 'Today: {today} · In range: {range}',
        fr: 'Aujourd’hui : {today} · Sur la période : {range}',
      } as T,
      unpaidBalance: {
        en: 'Unpaid balance: {amount}',
        fr: 'Solde impayé : {amount}',
      } as T,
      completedPayments: {
        en: 'Completed payments',
        fr: 'Paiements effectués',
      } as T,
      failedCount: { en: 'Failed: {count}', fr: 'Échoués : {count}' } as T,
      pendingDetail: { en: 'Pending: {count}', fr: 'En attente : {count}' } as T,
    },

    // Revenue & orders trend chart
    trend: {
      title: {
        en: 'Revenue & orders trend',
        fr: 'Évolution du chiffre d’affaires et des commandes',
      } as T,
      subtitle: {
        en: 'Daily buckets within the selected range.',
        fr: 'Agrégats quotidiens sur la période sélectionnée.',
      } as T,
      empty: {
        en: 'No data in this range.',
        fr: 'Aucune donnée sur cette période.',
      } as T,
      // Series names shown in the chart tooltip.
      seriesRevenue: { en: 'revenue', fr: 'chiffre d’affaires' } as T,
      seriesOrders: { en: 'orders', fr: 'commandes' } as T,
    },

    // Top performing doctors card
    topDoctors: {
      title: {
        en: 'Top performing doctors',
        fr: 'Praticiens les plus performants',
      } as T,
      subtitle: {
        en: 'Switch tabs to rank by orders, paid orders, or outstanding balance.',
        fr: 'Changez d’onglet pour classer par commandes, commandes payées ou solde dû.',
      } as T,
      tabOrders: { en: 'By orders', fr: 'Par commandes' } as T,
      tabPaid: { en: 'By paid orders', fr: 'Par commandes payées' } as T,
      tabOutstanding: { en: 'Outstanding', fr: 'Solde dû' } as T,
      empty: {
        en: 'Nothing to show in this range.',
        fr: 'Rien à afficher sur cette période.',
      } as T,
      ordersCount: { en: '{count} orders', fr: '{count} commande(s)' } as T,
      paidCount: { en: '{count} paid', fr: '{count} payée(s)' } as T,
      unpaid: { en: 'unpaid', fr: 'impayé' } as T,
    },

    // Best-selling packs table
    bestPacks: {
      title: { en: 'Best-selling packs', fr: 'Forfaits les plus vendus' } as T,
      subtitle: {
        en: 'Ranked by quotations sent in the selected range.',
        fr: 'Classés selon les devis envoyés sur la période sélectionnée.',
      } as T,
      empty: {
        en: 'No pack activity in this range.',
        fr: 'Aucune activité de forfait sur cette période.',
      } as T,
      colPack: { en: 'Pack', fr: 'Forfait' } as T,
      colSold: { en: 'Sold', fr: 'Vendus' } as T,
      colRevenue: { en: 'Revenue', fr: 'Chiffre d’affaires' } as T,
      colCollected: { en: 'Collected', fr: 'Encaissé' } as T,
      colCurrentPrice: { en: 'Current price', fr: 'Prix actuel' } as T,
      inactive: { en: 'inactive', fr: 'inactif' } as T,
    },
  },

  // ─── Shared dashboard widgets ────────────────────────────────────
  widgets: {
    // Date-range picker (admin dashboard header)
    rangePicker: {
      range: { en: 'Range', fr: 'Période' } as T,
      presetToday: { en: 'Today', fr: 'Aujourd’hui' } as T,
      preset7d: { en: 'Last 7 days', fr: '7 derniers jours' } as T,
      preset30d: { en: 'Last 30 days', fr: '30 derniers jours' } as T,
      preset90d: { en: 'Last 90 days', fr: '90 derniers jours' } as T,
      presetMonth: { en: 'This month', fr: 'Ce mois-ci' } as T,
      presetYear: { en: 'This year', fr: 'Cette année' } as T,
      presetCustom: { en: 'Custom', fr: 'Personnalisée' } as T,
      fromDate: { en: 'From date', fr: 'Date de début' } as T,
      toDate: { en: 'To date', fr: 'Date de fin' } as T,
      reset: { en: 'Reset', fr: 'Réinitialiser' } as T,
    },

    // Doctor-dashboard hero carousel
    slider: {
      learnMore: { en: 'Learn more', fr: 'En savoir plus' } as T,
      prevSlide: { en: 'Previous slide', fr: 'Diapositive précédente' } as T,
      nextSlide: { en: 'Next slide', fr: 'Diapositive suivante' } as T,
    },
  },

  // ─── Header notification bell ────────────────────────────────────
  notifBell: {
    bellAria: {
      en: 'Notifications ({count} unread)',
      fr: 'Notifications ({count} non lue(s))',
    } as T,
    title: { en: 'Notifications', fr: 'Notifications' } as T,
    unreadOne: { en: '1 unread update', fr: '1 mise à jour non lue' } as T,
    unreadMany: {
      en: '{count} unread updates',
      fr: '{count} mises à jour non lues',
    } as T,
    allCaughtUp: { en: 'You are all caught up', fr: 'Vous êtes à jour' } as T,
    markAll: { en: 'Mark all', fr: 'Tout marquer comme lu' } as T,
    recentActivity: { en: 'Recent activity', fr: 'Activité récente' } as T,
    latestCount: { en: '{count} latest', fr: '{count} dernières' } as T,
    inboxEmpty: { en: 'Inbox empty', fr: 'Boîte vide' } as T,
    emptyTitle: { en: 'Nothing here yet.', fr: 'Rien pour le moment.' } as T,
    emptyHint: {
      en: "You'll see new orders, payment updates, and treatment messages in this panel.",
      fr: 'Les nouvelles commandes, les mises à jour de paiement et les messages de traitement s’afficheront ici.',
    } as T,
    viewAll: {
      en: 'View all notifications',
      fr: 'Voir toutes les notifications',
    } as T,
    newBadge: { en: 'New', fr: 'Nouveau' } as T,
  },

  // ─── Doctor-side floating support chat ──────────────────────────
  supportChat: {
    launcherAria: {
      en: 'Open support chat',
      fr: 'Ouvrir la messagerie d’assistance',
    } as T,
    launcherAriaUnread: {
      en: 'Open support chat ({count} unread)',
      fr: 'Ouvrir la messagerie d’assistance ({count} non lus)',
    } as T,
    title: { en: 'Support', fr: 'Assistance' } as T,
    closePanelAria: {
      en: 'Close support panel',
      fr: 'Fermer le panneau d’assistance',
    } as T,
    startNew: {
      en: 'Start a new conversation',
      fr: 'Démarrer une nouvelle conversation',
    } as T,
    emptyTitle: {
      en: 'No conversations yet.',
      fr: 'Aucune conversation pour le moment.',
    } as T,
    // The bold "Start a new conversation" in the middle reuses
    // `supportChat.startNew`; these are the plain-text halves.
    emptyHintPrefix: { en: 'Click ', fr: 'Cliquez sur ' } as T,
    emptyHintSuffix: {
      en: ' to send your first message to the support team.',
      fr: ' pour envoyer votre premier message à l’équipe d’assistance.',
    } as T,
    threadFallback: { en: 'Support thread', fr: 'Fil d’assistance' } as T,

    // SupportConversationStatus enum → human label (keyed by enum value).
    status: {
      open: { en: 'Open', fr: 'Ouvert' } as T,
      pending: { en: 'Pending', fr: 'En attente' } as T,
      resolved: { en: 'Resolved', fr: 'Résolu' } as T,
      closed: { en: 'Closed', fr: 'Fermé' } as T,
    },
    statusLine: { en: 'Status: {status}', fr: 'Statut : {status}' } as T,

    // New-conversation form
    newConvTitle: { en: 'New conversation', fr: 'Nouvelle conversation' } as T,
    subjectLabel: { en: 'Subject (optional)', fr: 'Objet (facultatif)' } as T,
    subjectPlaceholder: {
      en: 'e.g. Cannot regenerate PDF in Arabic',
      fr: 'ex. Impossible de régénérer le PDF en arabe',
    } as T,
    describeLabel: {
      en: 'Describe your problem',
      fr: 'Décrivez votre problème',
    } as T,
    describePlaceholder: {
      en: 'Tell us what happened. You can attach a screenshot below.',
      fr: 'Expliquez-nous ce qui s’est passé. Vous pouvez joindre une capture d’écran ci-dessous.',
    } as T,
    tip: {
      en: 'Tip: include the order code, patient name, or page URL where the problem happened so support can act faster.',
      fr: 'Astuce : indiquez le code de commande, le nom du patient ou l’URL de la page concernée pour que l’assistance puisse intervenir plus rapidement.',
    } as T,
    sendToSupport: { en: 'Send to support', fr: 'Envoyer à l’assistance' } as T,
    toastEmpty: {
      en: 'Type a message or attach an image.',
      fr: 'Saisissez un message ou joignez une image.',
    } as T,

    // Active thread
    deletedNotice: {
      en: 'This support conversation has been closed or removed by admin.',
      fr: 'Cette conversation d’assistance a été fermée ou supprimée par l’administrateur.',
    } as T,
    backToList: {
      en: 'Back to conversations',
      fr: 'Retour aux conversations',
    } as T,
    closedNotice: {
      en: 'This conversation is closed. Start a new one to keep talking.',
      fr: 'Cette conversation est fermée. Démarrez-en une nouvelle pour poursuivre l’échange.',
    } as T,
    composerPlaceholder: { en: 'Type a message…', fr: 'Écrivez votre message…' } as T,

    // Composer / attachments
    attachmentFallback: { en: 'attachment', fr: 'pièce jointe' } as T,
    removeAttachment: {
      en: 'Remove attachment',
      fr: 'Retirer la pièce jointe',
    } as T,
    attachScreenshot: {
      en: 'Attach screenshot',
      fr: 'Joindre une capture d’écran',
    } as T,
    attachTitle: {
      en: 'Attach screenshot (PNG, JPG, WebP up to 10 MB) — you can also paste with Ctrl+V',
      fr: 'Joindre une capture d’écran (PNG, JPG, WebP jusqu’à 10 Mo) — vous pouvez aussi coller avec Ctrl+V',
    } as T,
    sendMessageAria: { en: 'Send message', fr: 'Envoyer le message' } as T,
    kbdSend: { en: 'send', fr: 'envoyer' } as T,
    kbdNewline: { en: 'new line', fr: 'saut de ligne' } as T,
    kbdPaste: { en: 'paste image', fr: 'coller une image' } as T,
    toastPasted: {
      en: 'Image pasted from clipboard.',
      fr: 'Image collée depuis le presse-papiers.',
    } as T,
    toastBadType: {
      en: 'Only PNG, JPG, JPEG, or WebP images are supported.',
      fr: 'Seules les images PNG, JPG, JPEG ou WebP sont prises en charge.',
    } as T,
    toastTooLarge: {
      en: 'Image too large (max 10 MB).',
      fr: 'Image trop volumineuse (10 Mo max).',
    } as T,

    // Message bubble
    openImageAria: {
      en: 'Open {name} in full view',
      fr: 'Ouvrir {name} en plein écran',
    } as T,
    imageError: {
      en: 'Could not load image',
      fr: 'Impossible de charger l’image',
    } as T,
    readReceipt: { en: 'read', fr: 'lu' } as T,
  },
};

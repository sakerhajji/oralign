import type { Lang } from './dict';

type T = Record<Lang, string>;

/** Quote/fee dialogs, zip dialog, new-order page, my-payments, users admin — spread into dict. */
export const commerceDomainDict = {
  // ─── Quote surface (quote-review.tsx + quote-pack-panel.tsx) ─────
  quoteUi: {
    // quote-pack-panel.tsx — admin "attach pack" card
    attachPack: {
      title: { en: 'Choose a pack', fr: 'Choisir un pack' } as T,
      desc: {
        en: 'Start here — pick the commercial pack. Its price is snapshotted onto the quote, so later catalogue edits won’t change this quotation.',
        fr: 'Commencez ici — sélectionnez le pack commercial. Son prix est figé sur le devis : les modifications ultérieures du catalogue n’affecteront pas ce devis.',
      } as T,
      packLabel: { en: 'Pack', fr: 'Pack' } as T,
      packPlaceholder: { en: 'Pick a pack…', fr: 'Sélectionner un pack…' } as T,
      noActivePack: {
        en: 'No active pack — create one in /dashboard/packs first.',
        fr: 'Aucun pack actif — créez-en d’abord un dans /dashboard/packs.',
      } as T,
      activePrice: { en: 'Active price', fr: 'Prix actif' } as T,
      noActivePrice: {
        en: 'No active price configured',
        fr: 'Aucun prix actif configuré',
      } as T,
      attachBtn: { en: 'Attach pack', fr: 'Associer le pack' } as T,
      archModeLabel: { en: 'Arcade mode', fr: 'Mode d’arcade' } as T,
      twoArches: { en: 'Two arches', fr: 'Deux arcades' } as T,
      singleArch: { en: 'Single arch', fr: 'Arcade unique' } as T,
      singleArchUnavailable: {
        en: 'Single arch is not available for this pack.',
        fr: 'Arcade unique non disponible pour ce forfait.',
      } as T,
    },

    // quote-pack-panel.tsx — pack snapshot summary
    snapshot: {
      packFallback: { en: 'Pack', fr: 'Pack' } as T,
      twoArches: { en: 'Two arches', fr: 'Deux arcades' } as T,
      singleArch: { en: 'Single arch', fr: 'Arcade unique' } as T,
      unlimitedSteps: { en: 'Unlimited steps', fr: 'Étapes illimitées' } as T,
      maxSteps: { en: 'Max {n} steps', fr: '{n} étapes max' } as T,
      unlimitedCorrections: {
        en: 'unlimited corrections',
        fr: 'corrections illimitées',
      } as T,
      correctionsCount: { en: '{n} corrections', fr: '{n} corrections' } as T,
      totalPrice: { en: 'Total price', fr: 'Prix total' } as T,
    },

    // quote-pack-panel.tsx — plan builder (admin)
    plan: {
      title: { en: 'Payment plan', fr: 'Plan de paiement' } as T,
      // Description wraps the bold total: "<before> <total> <after>"
      descBefore: { en: 'Split the', fr: 'Répartissez le total de' } as T,
      descAfter: {
        en: 'total into tranches. Each tranche unlocks a range of treatment steps once it’s paid. Amounts are calculated for you — fine-tune any row if you need to.',
        fr: 'en échéances. Chaque échéance débloque une plage d’étapes de traitement une fois payée. Les montants sont calculés automatiquement — ajustez chaque ligne si nécessaire.',
      } as T,
      payInFull: { en: 'Pay in full', fr: 'Paiement intégral' } as T,
      splitTranches: { en: 'Split into tranches', fr: 'Fractionner en échéances' } as T,
      trancheCount: { en: 'Number of tranches', fr: 'Nombre d’échéances' } as T,
      oneFewerAria: { en: 'One fewer tranche', fr: 'Une échéance de moins' } as T,
      oneMoreAria: { en: 'One more tranche', fr: 'Une échéance de plus' } as T,
      splitEvenly: { en: 'Split evenly', fr: 'Répartir équitablement' } as T,
      colAmount: { en: 'Amount ({currency})', fr: 'Montant ({currency})' } as T,
      colSteps: { en: 'Steps unlocked', fr: 'Étapes débloquées' } as T,
      colAvailableFrom: { en: 'Available from', fr: 'Disponible à partir du' } as T,
      colDueDate: { en: 'Due date', fr: 'Date d’échéance' } as T,
      firstStepAria: {
        en: 'Tranche {n} first step',
        fr: 'Échéance {n} — première étape',
      } as T,
      lastStepAria: {
        en: 'Tranche {n} last step',
        fr: 'Échéance {n} — dernière étape',
      } as T,
      tranchesTotal: { en: 'Tranches total', fr: 'Total des échéances' } as T,
      rebalance: { en: 'Rebalance', fr: 'Rééquilibrer' } as T,
      errSum: {
        en: 'Tranche amounts ({sum}) must add up to the total ({total}).',
        fr: 'La somme des échéances ({sum}) doit être égale au total ({total}).',
      } as T,
      errPositive: {
        en: 'Tranche {n}: amount must be positive.',
        fr: 'Échéance {n} : le montant doit être positif.',
      } as T,
      errRange: {
        en: 'Tranche {n}: from-step must be ≤ to-step.',
        fr: 'Échéance {n} : l’étape de début doit être ≤ à l’étape de fin.',
      } as T,
      errMax: {
        en: 'Tranche {n}: to-step exceeds pack max ({max}).',
        fr: 'Échéance {n} : l’étape de fin dépasse le maximum du pack ({max}).',
      } as T,
      errOverlap: {
        en: 'Step ranges overlap between tranches.',
        fr: 'Les plages d’étapes se chevauchent entre les échéances.',
      } as T,
      errMinTwo: {
        en: 'Splitting into tranches needs at least two of them.',
        fr: 'Le paiement fractionné nécessite au moins deux échéances.',
      } as T,
      saveBtn: { en: 'Save plan', fr: 'Enregistrer le plan' } as T,
    },

    // QuoteInstallment status → badge label
    installmentStatus: {
      paid: { en: 'Paid', fr: 'Payée' } as T,
      overdue: { en: 'Overdue', fr: 'En retard' } as T,
      cancelled: { en: 'Cancelled', fr: 'Annulée' } as T,
      pending: { en: 'Pending', fr: 'En attente' } as T,
    },

    // QuoteStepBatch status → badge label
    batchStatus: {
      delivered: { en: 'Delivered', fr: 'Livré' } as T,
      unlocked: { en: 'Unlocked', fr: 'Débloqué' } as T,
      locked: { en: 'Locked', fr: 'Verrouillé' } as T,
    },

    // quote-pack-panel.tsx — admin plan view
    adminPlan: {
      title: { en: 'Tranches & deliveries', fr: 'Échéances et livraisons' } as T,
      // Description wraps the bold route: "<before> <route><after>" —
      // `descAfter` carries its own leading space in EN so the FR
      // variant can end with a bare period (no space before it).
      descBefore: {
        en: 'Confirm cash payments inline; unlocked batches get a "Mark delivered" button. Bank transfers come in through the',
        fr: 'Confirmez les paiements en espèces directement ; les lots débloqués affichent un bouton « Marquer comme livré ». Les virements bancaires arrivent via la file',
      } as T,
      descAfter: { en: ' queue.', fr: '.' } as T,
      colAmount: { en: 'Amount', fr: 'Montant' } as T,
      colStatus: { en: 'Status', fr: 'Statut' } as T,
      colSteps: { en: 'Steps', fr: 'Étapes' } as T,
      colBatch: { en: 'Batch', fr: 'Lot' } as T,
      colAvailable: { en: 'Available', fr: 'Disponible' } as T,
      colDue: { en: 'Due', fr: 'Échéance' } as T,
      recordCash: { en: 'Record cash', fr: 'Enregistrer espèces' } as T,
      markDelivered: { en: 'Mark delivered', fr: 'Marquer comme livré' } as T,
    },

    // quote-pack-panel.tsx — record-cash dialog
    recordCash: {
      title: { en: 'Record cash payment', fr: 'Enregistrer un paiement en espèces' } as T,
      desc: {
        en: 'Mark installment #{n} ({amount}) as paid in cash. The linked step batch will unlock immediately.',
        fr: 'Marquer l’échéance n° {n} ({amount}) comme payée en espèces. Le lot d’étapes associé sera débloqué immédiatement.',
      } as T,
      receiptNumber: { en: 'Receipt number', fr: 'Numéro de reçu' } as T,
      notes: { en: 'Notes', fr: 'Notes' } as T,
    },

    // quote-pack-panel.tsx — doctor plan view
    doctor: {
      payAllTitle: { en: 'Pay everything at once', fr: 'Tout payer en une fois' } as T,
      // "<before> <count> <middle> <sum> <after>"
      payAllBefore: { en: 'You have', fr: 'Vous avez' } as T,
      payAllMiddle: { en: 'tranches available —', fr: 'échéances disponibles —' } as T,
      payAllAfter: {
        en: 'in total. Pay them tranche by tranche, or in one go.',
        fr: 'au total. Réglez-les une par une, ou en une seule fois.',
      } as T,
      payAllBtn: { en: 'Pay all now', fr: 'Tout payer maintenant' } as T,
      timelineTitle: { en: 'Payment timeline', fr: 'Calendrier de paiement' } as T,
      timelineDescApproved: {
        en: 'Pay each tranche when it becomes available. Steps unlock automatically once the payment is confirmed.',
        fr: 'Réglez chaque échéance dès qu’elle devient disponible. Les étapes se débloquent automatiquement une fois le paiement confirmé.',
      } as T,
      timelineDescNotApproved: {
        en: 'Approve the quotation first to start paying.',
        fr: 'Approuvez d’abord le devis pour commencer à payer.',
      } as T,
      lockedUntil: { en: 'locked until then', fr: 'verrouillée jusqu’à cette date' } as T,
      payNow: { en: 'Pay now', fr: 'Payer maintenant' } as T,
    },

    // quote-pack-panel.tsx — doctor payment dialog
    payDialog: {
      scopeAllLabel: { en: '{count} remaining tranches', fr: '{count} échéances restantes' } as T,
      scopeSingleLabel: { en: 'Tranche #{n}', fr: 'Échéance n° {n}' } as T,
      cashToast: {
        en: 'Cash payments are recorded by the clinic admin once they receive the funds.',
        fr: 'Les paiements en espèces sont enregistrés par l’administrateur du cabinet dès réception des fonds.',
      } as T,
      title: { en: 'Pay {amount}', fr: 'Payer {amount}' } as T,
      descAll: {
        en: 'Settle all {count} remaining tranches in one flow.',
        fr: 'Réglez les {count} échéances restantes en une seule opération.',
      } as T,
      descSingle: {
        en: 'Settle installment #{n} of your treatment plan.',
        fr: 'Réglez l’échéance n° {n} de votre plan de traitement.',
      } as T,
      dueBadge: { en: 'Payment due', fr: 'Paiement à régler' } as T,
      amountDue: { en: 'Amount due', fr: 'Montant dû' } as T,
      asideAll: {
        en: 'Complete all {count} remaining installments in this payment flow.',
        fr: 'Réglez l’ensemble des {count} échéances restantes dans cette opération de paiement.',
      } as T,
      asideSingle: {
        en: 'Settle installment #{n} to keep the treatment plan moving.',
        fr: 'Réglez l’échéance n° {n} pour faire avancer le plan de traitement.',
      } as T,
      summary: { en: 'Payment summary', fr: 'Récapitulatif du paiement' } as T,
      scope: { en: 'Scope', fr: 'Portée' } as T,
      dueDate: { en: 'Due date', fr: 'Date d’échéance' } as T,
      pack: { en: 'Pack', fr: 'Pack' } as T,
      patient: { en: 'Patient', fr: 'Patient' } as T,
      doctor: { en: 'Doctor', fr: 'Praticien' } as T,
      order: { en: 'Order', fr: 'Commande' } as T,
      footCard: {
        en: 'Card payments are processed immediately. The next batch of treatment steps unlocks once the payment is confirmed.',
        fr: 'Les paiements par carte sont traités immédiatement. Le prochain lot d’étapes de traitement se débloque dès que le paiement est confirmé.',
      } as T,
      footBank: {
        en: 'After you submit, the clinic admin verifies the wire and confirms the payment. You will be notified once it lands.',
        fr: 'Après soumission, l’administrateur du cabinet vérifie le virement et confirme le paiement. Vous serez notifié dès sa réception.',
      } as T,
      footCash: {
        en: 'Cash payments are recorded by the clinic admin when they physically receive the funds.',
        fr: 'Les paiements en espèces sont enregistrés par l’administrateur du cabinet à la réception physique des fonds.',
      } as T,
      sectionAria: {
        en: 'Installment payment details',
        fr: 'Détails du paiement de l’échéance',
      } as T,
      scopeHeading: { en: 'Payment scope', fr: 'Portée du paiement' } as T,
      thisInstallment: { en: 'This installment', fr: 'Cette échéance' } as T,
      allRemaining: { en: 'All remaining', fr: 'Toutes les restantes' } as T,
      installmentsCount: { en: '{count} installments', fr: '{count} échéances' } as T,
      methodHeading: { en: 'Payment method', fr: 'Mode de paiement' } as T,
      methodCardDesc: { en: 'Instant confirmation', fr: 'Confirmation instantanée' } as T,
      methodBankDesc: { en: 'Upload your receipt', fr: 'Téléversez votre reçu' } as T,
      methodCashDesc: { en: 'Recorded by the clinic', fr: 'Enregistré par le cabinet' } as T,
      cardTitle: { en: 'Secure card payment', fr: 'Paiement par carte sécurisé' } as T,
      cardAllDesc: {
        en: 'The remaining installments are processed securely in sequence. If one fails, completed payments remain recorded.',
        fr: 'Les échéances restantes sont traitées en toute sécurité, l’une après l’autre. Si l’une échoue, les paiements déjà effectués restent enregistrés.',
      } as T,
      cardSingleDesc: {
        en: 'This installment is confirmed immediately after the payment succeeds.',
        fr: 'Cette échéance est confirmée immédiatement après la réussite du paiement.',
      } as T,
      btTitle: { en: 'Bank-transfer declaration', fr: 'Déclaration de virement bancaire' } as T,
      btDesc: {
        en: 'Add the bank reference and receipt so the clinic can identify and confirm your transfer.',
        fr: 'Ajoutez la référence bancaire et le reçu afin que le cabinet puisse identifier et confirmer votre virement.',
      } as T,
      bankRefLabel: { en: 'Bank reference', fr: 'Référence bancaire' } as T,
      optionalSuffix: { en: '(optional)', fr: '(facultatif)' } as T,
      bankRefPlaceholder: {
        en: 'SWIFT, transfer reference, or memo',
        fr: 'SWIFT, référence de virement ou libellé',
      } as T,
      uploadReceiptTitle: {
        en: 'Upload bank-transfer receipt',
        fr: 'Téléverser le reçu de virement bancaire',
      } as T,
      uploadReceiptHint: {
        en: 'PDF, PNG, JPG, WEBP or HEIC · maximum 5 MB',
        fr: 'PDF, PNG, JPG, WEBP ou HEIC · 5 Mo maximum',
      } as T,
      chooseReceipt: { en: 'Click to choose a receipt', fr: 'Cliquez pour choisir un reçu' } as T,
      removeReceiptAria: { en: 'Remove receipt', fr: 'Retirer le reçu' } as T,
      receiptPreview: { en: 'Receipt preview', fr: 'Aperçu du reçu' } as T,
      receiptAlt: {
        en: 'Selected bank-transfer receipt',
        fr: 'Reçu de virement bancaire sélectionné',
      } as T,
      btNoteAll: {
        en: 'The same reference and receipt will be attached to all {count} installment declarations.',
        fr: 'La même référence et le même reçu seront joints aux {count} déclarations d’échéance.',
      } as T,
      btNoteSingle: {
        en: 'The clinic admin will review the receipt before confirming this installment.',
        fr: 'L’administrateur du cabinet examinera le reçu avant de confirmer cette échéance.',
      } as T,
      cashTitle: { en: 'Pay at the clinic', fr: 'Payer au cabinet' } as T,
      cashDesc: {
        en: 'Give the payment directly to the clinic. An admin will record it and unlock the related treatment steps.',
        fr: 'Remettez le paiement directement au cabinet. Un administrateur l’enregistrera et débloquera les étapes de traitement associées.',
      } as T,
      progress: {
        en: 'Processing installment {done}/{total}…',
        fr: 'Traitement de l’échéance {done}/{total}…',
      } as T,
      payTranches: { en: 'Pay {count} tranches', fr: 'Payer {count} échéances' } as T,
      payByCard: { en: 'Pay by card', fr: 'Payer par carte' } as T,
      submitDeclarations: {
        en: 'Submit {count} declarations',
        fr: 'Soumettre {count} déclarations',
      } as T,
      submitDeclaration: { en: 'Submit declaration', fr: 'Soumettre la déclaration' } as T,
      gotIt: { en: 'Got it', fr: 'Compris' } as T,
    },

    // quote-review.tsx
    review: {
      status: {
        draft: { en: 'Draft', fr: 'Brouillon' } as T,
        sent: { en: 'Sent — awaiting doctor', fr: 'Envoyé — en attente du praticien' } as T,
        approved: { en: 'Approved', fr: 'Approuvé' } as T,
        rejected: { en: 'Rejected', fr: 'Rejeté' } as T,
        canceled: { en: 'Canceled', fr: 'Annulé' } as T,
      },
      notPartOfWorkflow: {
        en: 'The quotation tab is not part of the design workflow.',
        fr: 'L’onglet devis ne fait pas partie du flux de conception.',
      } as T,
      loading: { en: 'Loading quotation…', fr: 'Chargement du devis…' } as T,
      noQuoteYet: {
        en: 'No quotation has been issued yet. Please check back soon.',
        fr: 'Aucun devis n’a encore été émis. Veuillez revenir plus tard.',
      } as T,
      patientFallback: { en: 'Patient', fr: 'Patient' } as T,
      patient: { en: 'Patient', fr: 'Patient' } as T,
      orderNum: { en: 'Order #{code}', fr: 'Commande n° {code}' } as T,
      createdDate: { en: 'Created {date}', fr: 'Créé le {date}' } as T,
      sentDate: { en: 'Sent {date}', fr: 'Envoyé le {date}' } as T,
      approvedDate: { en: 'Approved {date}', fr: 'Approuvé le {date}' } as T,
      rejectedDate: { en: 'Rejected {date}', fr: 'Rejeté le {date}' } as T,
      newQuote: { en: 'New quotation', fr: 'Nouveau devis' } as T,
      newQuoteDesc: {
        en: 'Pick a language and start a draft. You’ll attach a pack and split the total into tranches on the next screen.',
        fr: 'Choisissez une langue et commencez un brouillon. Vous associerez un pack et fractionnerez le total en échéances à l’écran suivant.',
      } as T,
      startQuote: { en: 'Start quotation', fr: 'Créer le devis' } as T,
      pricingTitle: { en: 'Pricing adjustments', fr: 'Ajustements tarifaires' } as T,
      pricingDesc: {
        en: 'Optional delivery fee and discount, applied on top of the pack price. Save before building the plan so the tranches split the right total.',
        fr: 'Frais de livraison et remise facultatifs, appliqués en plus du prix du pack. Enregistrez avant de construire le plan afin que les échéances répartissent le bon total.',
      } as T,
      deliveryFees: { en: 'Delivery fees ({currency})', fr: 'Frais de livraison ({currency})' } as T,
      discount: { en: 'Discount ({currency})', fr: 'Remise ({currency})' } as T,
      netToBill: { en: 'Net to bill', fr: 'Net à facturer' } as T,
      docLanguage: { en: 'Document language', fr: 'Langue du document' } as T,
      // Hint wraps the bold button name: "<before> <Regenerate PDF> <after>"
      regenHintBefore: {
        en: 'Pick another language and click',
        fr: 'Choisissez une autre langue puis cliquez sur',
      } as T,
      regenHintAfter: {
        en: 'to send the doctor a translated copy.',
        fr: 'pour envoyer une copie traduite au praticien.',
      } as T,
      notesToggle: { en: 'Notes & admin message', fr: 'Notes et message administrateur' } as T,
      hasContent: { en: '· has content', fr: '· contenu présent' } as T,
      notesDoctor: { en: 'Notes (visible to doctor)', fr: 'Notes (visibles par le praticien)' } as T,
      adminMessage: {
        en: 'Admin message (PDF, above totals)',
        fr: 'Message administrateur (PDF, au-dessus des totaux)',
      } as T,
      footerDraft: {
        en: 'Drafts stay editable until you send to the doctor.',
        fr: 'Les brouillons restent modifiables jusqu’à l’envoi au praticien.',
      } as T,
      footerSent: {
        en: 'Sent — locked. Click "Recall to edit" to pull it back as a draft if anything is wrong.',
        fr: 'Envoyé — verrouillé. Cliquez sur « Rappeler pour modifier » pour le repasser en brouillon en cas d’erreur.',
      } as T,
      footerLocked: {
        en: 'This quotation is locked. Cancel it first to make changes.',
        fr: 'Ce devis est verrouillé. Annulez-le d’abord pour le modifier.',
      } as T,
      confirmRecall: { en: 'Click again to confirm', fr: 'Cliquez à nouveau pour confirmer' } as T,
      recallToEdit: { en: 'Recall to edit', fr: 'Rappeler pour modifier' } as T,
      regeneratePdf: { en: 'Regenerate PDF', fr: 'Régénérer le PDF' } as T,
      generatePdf: { en: 'Generate PDF', fr: 'Générer le PDF' } as T,
      planFirstTitle: {
        en: 'Configure the payment plan (installments + step ranges) before sending. Open the pack panel below to set it up.',
        fr: 'Configurez le plan de paiement (échéances + plages d’étapes) avant l’envoi. Ouvrez le panneau du pack ci-dessous pour le paramétrer.',
      } as T,
      planFirst: { en: 'Configure plan first', fr: 'Configurez d’abord le plan' } as T,
      sendToDoctor: { en: 'Send to doctor', fr: 'Envoyer au praticien' } as T,
      pdfError: {
        en: 'Could not download the PDF — please try again.',
        fr: 'Impossible de télécharger le PDF — veuillez réessayer.',
      } as T,
      pendingTitle: { en: 'Quotation pending', fr: 'Devis en attente' } as T,
      pendingDesc: {
        en: 'The team is still finalising the pack for your treatment. You’ll be notified once it’s ready to review.',
        fr: 'L’équipe finalise encore le pack de votre traitement. Vous serez notifié dès qu’il sera prêt à être consulté.',
      } as T,
      readIn: { en: 'Read this quote in', fr: 'Lire ce devis en' } as T,
      currently: { en: 'Currently: {lang}', fr: 'Actuellement : {lang}' } as T,
      pickDifferent: {
        en: 'Pick a different language to request another version.',
        fr: 'Choisissez une autre langue pour demander une autre version.',
      } as T,
      regenDownload: { en: 'Regenerate & download', fr: 'Régénérer et télécharger' } as T,
      fromTeam: { en: 'From the team', fr: 'De la part de l’équipe' } as T,
      notes: { en: 'Notes', fr: 'Notes' } as T,
      youRejected: {
        en: 'You rejected this quotation',
        fr: 'Vous avez rejeté ce devis',
      } as T,
    },
  },

  // ─── Treatment fee dialogs ────────────────────────────────────────
  feeUi: {
    // treatment-fee-payment-dialog.tsx — method tiles (keyed by MethodKey)
    methods: {
      bank_transfer: {
        label: { en: 'Bank transfer', fr: 'Virement bancaire' } as T,
        description: {
          en: 'Transfer to the clinic account, then upload your receipt. An admin will confirm once the funds land.',
          fr: 'Effectuez le virement vers le compte du cabinet, puis téléversez votre reçu. Un administrateur confirmera dès réception des fonds.',
        } as T,
      },
      card: {
        label: { en: 'Card payment', fr: 'Paiement par carte' } as T,
        description: {
          en: 'Pay online instantly. We currently use a mock collector — the order is marked paid immediately on success.',
          fr: 'Payez en ligne instantanément. Un collecteur fictif est utilisé pour le moment — la commande est marquée payée dès la réussite du paiement.',
        } as T,
      },
      cash: {
        label: { en: 'Cash (admin)', fr: 'Espèces (admin)' } as T,
        description: {
          en: 'Recorded in-clinic by an admin. Stamps the fee as paid right away.',
          fr: 'Enregistré au cabinet par un administrateur. Marque immédiatement les honoraires comme payés.',
        } as T,
      },
    },

    payDialog: {
      title: { en: 'Pay treatment fee', fr: 'Payer les honoraires de traitement' } as T,
      orderCode: { en: 'Order {code}', fr: 'Commande {code}' } as T,
      amountDue: { en: 'Amount due', fr: 'Montant dû' } as T,
      feeIntro: {
        en: 'The professional fee must be settled before the treatment plan can be prepared.',
        fr: 'Les honoraires professionnels doivent être réglés avant la préparation du plan de traitement.',
      } as T,
      footnoteBank: {
        en: 'After you upload the receipt, an admin confirms the transfer once the funds land.',
        fr: 'Après le téléversement du reçu, un administrateur confirme le virement dès réception des fonds.',
      } as T,
      footnoteDefault: {
        en: 'Settling this fee unblocks the treatment plan for this order.',
        fr: 'Le règlement de ces honoraires débloque le plan de traitement de cette commande.',
      } as T,
      regionAria: { en: 'Payment details', fr: 'Détails du paiement' } as T,
      methodHeading: { en: 'Payment method', fr: 'Mode de paiement' } as T,
      uploadReceiptTitle: {
        en: 'Upload bank-transfer receipt',
        fr: 'Téléverser le reçu de virement bancaire',
      } as T,
      uploadReceiptHint: {
        en: 'Once the wire is sent, upload the bank’s receipt / proof. Accepted: PDF, JPG, PNG · max 10 MB.',
        fr: 'Une fois le virement effectué, téléversez le reçu / justificatif bancaire. Formats acceptés : PDF, JPG, PNG · 10 Mo max.',
      } as T,
      pickFile: { en: 'Click to pick a file', fr: 'Cliquez pour choisir un fichier' } as T,
      removeFileAria: { en: 'Remove file', fr: 'Retirer le fichier' } as T,
      previewConfirm: {
        en: 'Preview — confirm this is the right receipt before submitting',
        fr: 'Aperçu — vérifiez qu’il s’agit du bon reçu avant de soumettre',
      } as T,
      previewAlt: { en: 'Selected receipt preview', fr: 'Aperçu du reçu sélectionné' } as T,
      uploadReceiptBtn: { en: 'Upload receipt', fr: 'Téléverser le reçu' } as T,
      recordCashBtn: {
        en: 'Record cash payment',
        fr: 'Enregistrer le paiement en espèces',
      } as T,
      payAmountBtn: { en: 'Pay {amount}', fr: 'Payer {amount}' } as T,
      changeBtn: { en: 'Change', fr: 'Changer' } as T,
    },

    // treatment-fee-payment-dialog.tsx — bank instructions panel
    bank: {
      notConfiguredTitle: {
        en: 'Bank account not configured yet',
        fr: 'Compte bancaire non configuré',
      } as T,
      // "<before> <Account → Billing settings> <after>"
      notConfiguredBefore: {
        en: 'The clinic admin needs to fill in the bank details under',
        fr: 'L’administrateur du cabinet doit renseigner les coordonnées bancaires sous',
      } as T,
      notConfiguredPath: {
        en: 'Account → Billing settings',
        fr: 'Compte → Paramètres de facturation',
      } as T,
      notConfiguredAfter: {
        en: 'before bank transfers can be paid this way. Please contact support — or pick Card / Cash instead.',
        fr: 'avant de pouvoir payer par virement bancaire. Veuillez contacter l’assistance — ou choisissez Carte / Espèces.',
      } as T,
      whereTitle: { en: 'Where to send the money', fr: 'Où envoyer les fonds' } as T,
      whereDesc: {
        en: 'Copy each field into your bank app. Include the payment reference so we can match the wire to your order.',
        fr: 'Copiez chaque champ dans votre application bancaire. Indiquez la référence de paiement afin que nous puissions associer le virement à votre commande.',
      } as T,
      beneficiary: { en: 'Beneficiary', fr: 'Bénéficiaire' } as T,
      address: { en: 'Address', fr: 'Adresse' } as T,
      bankName: { en: 'Bank', fr: 'Banque' } as T,
      accountHolder: { en: 'Account holder', fr: 'Titulaire du compte' } as T,
      iban: { en: 'IBAN', fr: 'IBAN' } as T,
      rib: { en: 'RIB', fr: 'RIB' } as T,
      swift: { en: 'SWIFT / BIC', fr: 'SWIFT / BIC' } as T,
      amountToTransfer: { en: 'Amount to transfer', fr: 'Montant à virer' } as T,
      paymentReference: { en: 'Payment reference', fr: 'Référence de paiement' } as T,
      copiedToast: { en: '{label} copied', fr: '{label} copié' } as T,
      copyAria: { en: 'Copy {label}', fr: 'Copier {label}' } as T,
      copyError: {
        en: 'Could not copy — please copy manually.',
        fr: 'Impossible de copier — veuillez copier manuellement.',
      } as T,
      copied: { en: 'Copied', fr: 'Copié' } as T,
      copy: { en: 'Copy', fr: 'Copier' } as T,
    },

    // treatment-fee-receipt-dialog.tsx — admin receipt confirmation
    receiptDialog: {
      title: { en: 'Bank-transfer receipt', fr: 'Reçu de virement bancaire' } as T,
      orderCode: { en: 'Order {code}', fr: 'Commande {code}' } as T,
      summary: { en: 'Payment summary', fr: 'Récapitulatif du paiement' } as T,
      patient: { en: 'Patient', fr: 'Patient' } as T,
      doctor: { en: 'Doctor', fr: 'Praticien' } as T,
      amount: { en: 'Amount', fr: 'Montant' } as T,
      method: { en: 'Method', fr: 'Mode' } as T,
      submitted: { en: 'Submitted', fr: 'Soumis le' } as T,
      receipt: { en: 'Receipt', fr: 'Reçu' } as T,
      confirmHint: {
        en: 'Confirming will mark the treatment fee as paid and unblock the treatment plan. This action is logged with your admin user id.',
        fr: 'La confirmation marquera les honoraires de traitement comme payés et débloquera le plan de traitement. Cette action est journalisée avec votre identifiant administrateur.',
      } as T,
      confirmBtn: { en: 'Confirm payment', fr: 'Confirmer le paiement' } as T,
      lightboxAlt: {
        en: 'Bank-transfer receipt for {code}',
        fr: 'Reçu de virement bancaire — {code}',
      } as T,
      lightboxCaption: {
        en: '{code} — bank-transfer receipt',
        fr: '{code} — reçu de virement bancaire',
      } as T,
      noReceiptTitle: { en: 'No receipt attached', fr: 'Aucun reçu joint' } as T,
      noReceiptDesc: {
        en: 'The doctor recorded a bank-transfer intent but did not upload a proof file.',
        fr: 'Le praticien a déclaré un virement bancaire mais n’a pas téléversé de justificatif.',
      } as T,
      iframeTitle: { en: 'Receipt — {name}', fr: 'Reçu — {name}' } as T,
      openFullAria: { en: 'Open receipt in full view', fr: 'Ouvrir le reçu en plein écran' } as T,
      receiptImgAlt: {
        en: 'Bank-transfer receipt {name}',
        fr: 'Reçu de virement bancaire {name}',
      } as T,
      loadErrorTitle: { en: 'Couldn’t load the receipt', fr: 'Impossible de charger le reçu' } as T,
      noPreviewTitle: { en: 'Preview not available', fr: 'Aperçu indisponible' } as T,
      loadErrorDesc: {
        en: 'The image couldn’t be loaded inline. Download to inspect the proof.',
        fr: 'L’image n’a pas pu être chargée. Téléchargez-la pour examiner le justificatif.',
      } as T,
      noPreviewDesc: {
        en: 'This file format can’t be previewed in the browser. Download to inspect it.',
        fr: 'Ce format de fichier ne peut pas être prévisualisé dans le navigateur. Téléchargez-le pour l’examiner.',
      } as T,
      downloadReceipt: { en: 'Download receipt', fr: 'Télécharger le reçu' } as T,
    },
  },

  // ─── ZIP upload dialog (zip-upload-dialog.tsx) ───────────────────
  zipUi: {
    defaultTitle: { en: 'Upload ZIP bundle', fr: 'Téléverser une archive ZIP' } as T,
    chooseFile: { en: 'Choose a ZIP file', fr: 'Choisir un fichier ZIP' } as T,
    chooseHint: {
      en: 'Up to {n} GB — fits a full CBCT / DICOM volume. We scan it for executables and unsafe filenames before it uploads.',
      fr: 'Jusqu’à {n} Go — suffisant pour un volume CBCT / DICOM complet. Nous y recherchons exécutables et noms de fichiers dangereux avant le téléversement.',
    } as T,
    scanning: { en: 'Scanning {name}…', fr: 'Analyse de {name}…' } as T,
    validateError: {
      en: 'Couldn’t validate this file',
      fr: 'Impossible de valider ce fichier',
    } as T,
    blockedSummary: {
      en: 'Upload blocked — issues found',
      fr: 'Téléversement bloqué — problèmes détectés',
    } as T,
    warningsOne: {
      en: 'Looks OK with 1 warning',
      fr: 'Semble correct avec 1 avertissement',
    } as T,
    warningsMany: {
      en: 'Looks OK with {count} warnings',
      fr: 'Semble correct avec {count} avertissements',
    } as T,
    filesOne: {
      en: '1 file inside · safe to upload',
      fr: '1 fichier à l’intérieur · téléversement sûr',
    } as T,
    filesMany: {
      en: '{count} files inside · safe to upload',
      fr: '{count} fichiers à l’intérieur · téléversement sûr',
    } as T,
    contents: { en: 'Contents ({count})', fr: 'Contenu ({count})' } as T,
    size: { en: 'Size', fr: 'Taille' } as T,
    emptyArchive: { en: 'The archive is empty.', fr: 'L’archive est vide.' } as T,
    firstEntries: {
      en: 'Showing first 250 of {count} entries',
      fr: 'Affichage des 250 premières entrées sur {count}',
    } as T,
    pickAnother: { en: 'Pick another file', fr: 'Choisir un autre fichier' } as T,
    uploadBtn: { en: 'Upload ZIP', fr: 'Téléverser le ZIP' } as T,
    // Audit-engine messages (thrown / listed in the result panel)
    audit: {
      tooBig: {
        en: 'File is {size}; the limit is {limit}.',
        fr: 'Le fichier fait {size} ; la limite est de {limit}.',
      } as T,
      badSignature: {
        en: 'This file does not look like a real ZIP archive (signature mismatch). Refusing to upload.',
        fr: 'Ce fichier ne semble pas être une véritable archive ZIP (signature non conforme). Téléversement refusé.',
      } as T,
      noEocd: {
        en: 'End-of-Central-Directory record not found — the archive may be corrupt.',
        fr: 'Enregistrement de fin de répertoire central introuvable — l’archive est peut-être corrompue.',
      } as T,
      tooManyEntries: {
        en: 'Refusing to scan an archive with {count} entries.',
        fr: 'Analyse refusée pour une archive déclarant {count} entrées.',
      } as T,
      pathTraversal: {
        en: 'Path traversal attempted: "{name}"',
        fr: 'Tentative de traversée de répertoires : « {name} »',
      } as T,
      absolutePath: { en: 'Absolute path: "{name}"', fr: 'Chemin absolu : « {name} »' } as T,
      nulByte: {
        en: 'NUL byte in filename: "{name}"',
        fr: 'Octet NUL dans le nom de fichier : « {name} »',
      } as T,
      executable: {
        en: 'Executable file inside: "{name}" (.{ext})',
        fr: 'Fichier exécutable détecté : « {name} » (.{ext})',
      } as T,
      osMetadata: {
        en: 'OS metadata included: "{name}"',
        fr: 'Métadonnées système incluses : « {name} »',
      } as T,
      zipBomb: {
        en: 'Suspicious compression ratio ({ratio}× expansion). Refusing to upload.',
        fr: 'Taux de compression suspect (expansion ×{ratio}). Téléversement refusé.',
      } as T,
    },
  },

  // ─── /dashboard/orders/new ───────────────────────────────────────
  // The page only composes <OrderWizard /> (translated via its own
  // namespaces) — no page-level strings exist today. Kept so the
  // namespace is reserved for future page chrome.
  newOrderPage: {},

  // ─── /dashboard/payments/mine ────────────────────────────────────
  // Pure server-side redirect to /dashboard/payments/history — no
  // user-facing strings. Namespace reserved.
  myPayments: {},

  // ─── Users admin (src/components/users/*) ────────────────────────
  usersUi: {
    // UserRole enum → display label (shared by all users surfaces)
    roles: {
      admin: { en: 'Administrator', fr: 'Administrateur' } as T,
      dentist: { en: 'Dentist', fr: 'Praticien' } as T,
      designer: { en: 'Designer', fr: 'Designer' } as T,
      super_admin: { en: 'Super Admin', fr: 'Super administrateur' } as T,
    },
    // VerificationStatus enum → display label
    verification: {
      pending: { en: 'Pending', fr: 'En attente' } as T,
      approved: { en: 'Approved', fr: 'Approuvé' } as T,
      rejected: { en: 'Rejected', fr: 'Rejeté' } as T,
    },
    statusActive: { en: 'Active', fr: 'Actif' } as T,
    statusInactive: { en: 'Inactive', fr: 'Inactif' } as T,
    statusBlocked: { en: 'Blocked', fr: 'Bloqué' } as T,
    verified: { en: 'Verified', fr: 'Vérifié' } as T,
    unverified: { en: 'Unverified', fr: 'Non vérifié' } as T,
    never: { en: 'Never', fr: 'Jamais' } as T,
    fullNameRequired: { en: 'Full Name *', fr: 'Nom complet *' } as T,
    phone: { en: 'Phone', fr: 'Téléphone' } as T,
    email: { en: 'Email', fr: 'E-mail' } as T,
    role: { en: 'Role', fr: 'Rôle' } as T,
    selectRole: { en: 'Select role', fr: 'Sélectionner un rôle' } as T,
    emailVerified: { en: 'Email Verified', fr: 'E-mail vérifié' } as T,
    userId: { en: 'User ID', fr: 'Identifiant utilisateur' } as T,
    memberSince: { en: 'Member since', fr: 'Membre depuis' } as T,
    lastLogin: { en: 'Last login', fr: 'Dernière connexion' } as T,
    reset: { en: 'Reset', fr: 'Réinitialiser' } as T,
    newPassword: { en: 'New Password', fr: 'Nouveau mot de passe' } as T,
    keepPasswordHint: {
      en: 'Leave blank to keep current password',
      fr: 'Laissez vide pour conserver le mot de passe actuel',
    } as T,

    // search-filters.tsx
    filters: {
      searchPh: { en: 'Search users...', fr: 'Rechercher des utilisateurs…' } as T,
      searchAria: {
        en: 'Search users by name or email',
        fr: 'Rechercher des utilisateurs par nom ou e-mail',
      } as T,
      rolePh: { en: 'Role', fr: 'Rôle' } as T,
      allRoles: { en: 'All Roles', fr: 'Tous les rôles' } as T,
      statusPh: { en: 'Status', fr: 'Statut' } as T,
      allStatus: { en: 'All Status', fr: 'Tous les statuts' } as T,
      active: { en: 'Active', fr: 'Actifs' } as T,
      blocked: { en: 'Blocked', fr: 'Bloqués' } as T,
      clearAria: { en: 'Clear all filters', fr: 'Effacer tous les filtres' } as T,
      clear: { en: 'Clear', fr: 'Effacer' } as T,
    },

    // clinic-view-dialog.tsx
    clinicView: {
      srTitle: { en: 'Clinic Details', fr: 'Détails du cabinet' } as T,
      srDesc: {
        en: 'Read-only view of {name}',
        fr: 'Vue en lecture seule de {name}',
      } as T,
      contact: { en: 'Contact', fr: 'Contact' } as T,
      // Clinic "Matricule fiscal" (doctor tax id) — shown on invoices.
      taxId: { en: 'Tax registration number', fr: 'Matricule fiscal' } as T,
      location: { en: 'Location', fr: 'Localisation' } as T,
      city: { en: 'City', fr: 'Ville' } as T,
      gps: { en: 'GPS', fr: 'GPS' } as T,
      openInMaps: { en: 'Open in Maps', fr: 'Ouvrir dans Maps' } as T,
      about: { en: 'About', fr: 'À propos' } as T,
      noDetails: {
        en: 'No additional details available.',
        fr: 'Aucune information supplémentaire disponible.',
      } as T,
      readOnly: { en: 'Read-only view', fr: 'Vue en lecture seule' } as T,
      call: { en: 'Call', fr: 'Appeler' } as T,
      sendEmail: { en: 'Send email', fr: 'Envoyer un e-mail' } as T,
    },

    // edit-user-dialog.tsx
    editDialog: {
      title: { en: 'Edit User Profile', fr: 'Modifier le profil utilisateur' } as T,
      desc: {
        en: 'Update user information, permissions, and settings',
        fr: 'Mettre à jour les informations, permissions et paramètres de l’utilisateur',
      } as T,
      profilePicture: { en: 'Profile Picture', fr: 'Photo de profil' } as T,
      pictureHint: {
        en: 'Upload a new profile picture (max 5MB)',
        fr: 'Téléversez une nouvelle photo de profil (5 Mo max)',
      } as T,
      uploadImage: { en: 'Upload Image', fr: 'Téléverser une image' } as T,
      identity: { en: 'Identity Information', fr: 'Informations d’identité' } as T,
      fullNamePh: { en: 'Enter full name', fr: 'Saisissez le nom complet' } as T,
      phoneNumber: { en: 'Phone Number', fr: 'Numéro de téléphone' } as T,
      security: { en: 'Security Settings', fr: 'Paramètres de sécurité' } as T,
      passwordHint: {
        en: 'Only enter a password if you want to change it',
        fr: 'Ne saisissez un mot de passe que si vous souhaitez le modifier',
      } as T,
      permissions: { en: 'Permissions & Access', fr: 'Permissions et accès' } as T,
      userRole: { en: 'User Role', fr: 'Rôle de l’utilisateur' } as T,
      markVerified: {
        en: 'Mark the user’s email as verified',
        fr: 'Marquer l’e-mail de l’utilisateur comme vérifié',
      } as T,
      updating: { en: 'Updating...', fr: 'Mise à jour…' } as T,
      updateProfile: { en: 'Update Profile', fr: 'Mettre à jour le profil' } as T,
    },

    // user-detail-sheet.tsx
    sheet: {
      srTitle: { en: 'Edit User', fr: 'Modifier l’utilisateur' } as T,
      srDesc: {
        en: 'Edit user profile, account settings, clinic info and schedule',
        fr: 'Modifier le profil, les paramètres du compte, les informations du cabinet et les horaires',
      } as T,
      tabProfile: { en: 'Profile', fr: 'Profil' } as T,
      tabAccount: { en: 'Account', fr: 'Compte' } as T,
      tabClinic: { en: 'Clinic', fr: 'Cabinet' } as T,
      tabSchedule: { en: 'Schedule', fr: 'Horaires' } as T,
      profilePicture: { en: 'Profile Picture', fr: 'Photo de profil' } as T,
      avatarHint: { en: 'JPG, PNG or GIF · max 5 MB', fr: 'JPG, PNG ou GIF · 5 Mo max' } as T,
      upload: { en: 'Upload', fr: 'Téléverser' } as T,
      identity: { en: 'Identity', fr: 'Identité' } as T,
      fullNamePh: { en: 'Full name', fr: 'Nom complet' } as T,
      security: { en: 'Security', fr: 'Sécurité' } as T,
      saving: { en: 'Saving…', fr: 'Enregistrement…' } as T,
      saveProfile: { en: 'Save Profile', fr: 'Enregistrer le profil' } as T,
      permissions: { en: 'Permissions', fr: 'Permissions' } as T,
      verifiedFeatures: {
        en: 'Grant access to email-verified features',
        fr: 'Donner accès aux fonctionnalités réservées aux e-mails vérifiés',
      } as T,
      currentStatus: { en: 'Current Status', fr: 'Statut actuel' } as T,
      account: { en: 'Account', fr: 'Compte' } as T,
      verificationLabel: { en: 'Verification', fr: 'Vérification' } as T,
      timeline: { en: 'Timeline', fr: 'Historique' } as T,
      lastUpdated: { en: 'Last updated', fr: 'Dernière mise à jour' } as T,
      saveAccount: {
        en: 'Save Account Settings',
        fr: 'Enregistrer les paramètres du compte',
      } as T,
      noClinicTitle: { en: 'No clinic profile yet', fr: 'Aucun profil de cabinet pour le moment' } as T,
      noClinicDesc: {
        en: 'Fill in the form below to create a clinic profile for this dentist.',
        fr: 'Remplissez le formulaire ci-dessous pour créer un profil de cabinet pour ce praticien.',
      } as T,
      clinicInfo: { en: 'Clinic Information', fr: 'Informations du cabinet' } as T,
      clinicNameRequired: { en: 'Clinic Name *', fr: 'Nom du cabinet *' } as T,
      clinicNamePh: { en: 'Smile Dental Clinic', fr: 'Cabinet dentaire Sourire' } as T,
      address: { en: 'Address', fr: 'Adresse' } as T,
      addressPh: { en: '123 Main Street', fr: '123 rue Principale' } as T,
      city: { en: 'City', fr: 'Ville' } as T,
      country: { en: 'Country', fr: 'Pays' } as T,
      countryPh: { en: 'Tunisia', fr: 'Tunisie' } as T,
      // Clinic "Matricule fiscal" (doctor tax id) — admin-editable; on invoices.
      taxId: { en: 'Tax registration number', fr: 'Matricule fiscal' } as T,
      taxIdPh: { en: '1234567/A/M/000', fr: '1234567/A/M/000' } as T,
      contact: { en: 'Contact', fr: 'Contact' } as T,
      clinicEmailPh: { en: 'clinic@example.com', fr: 'cabinet@exemple.com' } as T,
      about: { en: 'About', fr: 'À propos' } as T,
      description: { en: 'Description', fr: 'Description' } as T,
      descriptionPh: {
        en: 'Describe the clinic, specialties, services…',
        fr: 'Décrivez le cabinet, les spécialités, les services…',
      } as T,
      locationTitle: { en: 'Location', fr: 'Localisation' } as T,
      locationHint: {
        en: 'Click “Pick Location” to open the map and select the clinic’s exact GPS coordinates.',
        fr: 'Cliquez sur « Choisir l’emplacement » pour ouvrir la carte et sélectionner les coordonnées GPS exactes du cabinet.',
      } as T,
      saveClinic: { en: 'Save Clinic Info', fr: 'Enregistrer les informations du cabinet' } as T,
      createClinic: { en: 'Create Clinic', fr: 'Créer le cabinet' } as T,
      workingHours: { en: 'Working Hours', fr: 'Horaires de travail' } as T,
      workingHoursHint: {
        en: 'Set open & close times for each day. Toggle the switch off to mark a day as closed.',
        fr: 'Définissez les heures d’ouverture et de fermeture pour chaque jour. Désactivez l’interrupteur pour marquer un jour comme fermé.',
      } as T,
      day: { en: 'Day', fr: 'Jour' } as T,
      opens: { en: 'Opens', fr: 'Ouverture' } as T,
      closes: { en: 'Closes', fr: 'Fermeture' } as T,
      open: { en: 'Open', fr: 'Ouvert' } as T,
      weekend: { en: 'weekend', fr: 'week-end' } as T,
      restDay: { en: 'Rest day — closed', fr: 'Jour de repos — fermé' } as T,
      saveSchedule: { en: 'Save Schedule', fr: 'Enregistrer les horaires' } as T,
      dismiss: { en: 'Dismiss', fr: 'Ignorer' } as T,
      // toasts
      imagesOnly: { en: 'Images only', fr: 'Images uniquement' } as T,
      maxFive: { en: 'Max 5 MB', fr: '5 Mo maximum' } as T,
      profileSaved: { en: 'Profile saved successfully.', fr: 'Profil enregistré avec succès.' } as T,
      accountSaved: { en: 'Account settings saved.', fr: 'Paramètres du compte enregistrés.' } as T,
      clinicSaved: { en: 'Clinic info saved.', fr: 'Informations du cabinet enregistrées.' } as T,
      clinicCreated: { en: 'Clinic profile created.', fr: 'Profil de cabinet créé.' } as T,
      scheduleSaved: { en: 'Schedule saved successfully.', fr: 'Horaires enregistrés avec succès.' } as T,
    },

    // Zod validation messages (user-detail-sheet.tsx schemas)
    validation: {
      min2: { en: 'At least 2 characters', fr: 'Au moins 2 caractères' } as T,
      min8: { en: 'At least 8 characters', fr: 'Au moins 8 caractères' } as T,
      clinicNameRequired: {
        en: 'Clinic name is required',
        fr: 'Le nom du cabinet est obligatoire',
      } as T,
      taxIdMax: {
        en: 'Tax id must be 60 characters or fewer',
        fr: 'Le matricule fiscal doit comporter au maximum 60 caractères',
      } as T,
    },

    // Day-of-week labels (user-detail-sheet.tsx schedule grid)
    days: {
      monday: { label: { en: 'Monday', fr: 'Lundi' } as T, short: { en: 'Mo', fr: 'Lu' } as T },
      tuesday: { label: { en: 'Tuesday', fr: 'Mardi' } as T, short: { en: 'Tu', fr: 'Ma' } as T },
      wednesday: { label: { en: 'Wednesday', fr: 'Mercredi' } as T, short: { en: 'We', fr: 'Me' } as T },
      thursday: { label: { en: 'Thursday', fr: 'Jeudi' } as T, short: { en: 'Th', fr: 'Je' } as T },
      friday: { label: { en: 'Friday', fr: 'Vendredi' } as T, short: { en: 'Fr', fr: 'Ve' } as T },
      saturday: { label: { en: 'Saturday', fr: 'Samedi' } as T, short: { en: 'Sa', fr: 'Sa' } as T },
      sunday: { label: { en: 'Sunday', fr: 'Dimanche' } as T, short: { en: 'Su', fr: 'Di' } as T },
    },

    // user-dialogs.tsx — create
    createDialog: {
      title: { en: 'Create New User', fr: 'Créer un nouvel utilisateur' } as T,
      desc: { en: 'Add a new user to the system', fr: 'Ajouter un nouvel utilisateur au système' } as T,
      emailRequired: { en: 'Email *', fr: 'E-mail *' } as T,
      passwordRequired: { en: 'Password *', fr: 'Mot de passe *' } as T,
      creating: { en: 'Creating...', fr: 'Création…' } as T,
      createBtn: { en: 'Create User', fr: 'Créer l’utilisateur' } as T,
    },

    // user-dialogs.tsx — view
    viewDialog: {
      title: { en: 'User Profile Details', fr: 'Détails du profil utilisateur' } as T,
      desc: {
        en: 'Complete user information and account details',
        fr: 'Informations complètes de l’utilisateur et détails du compte',
      } as T,
      contactInfo: { en: 'Contact Information', fr: 'Coordonnées' } as T,
      emailAddress: { en: 'Email Address', fr: 'Adresse e-mail' } as T,
      fullName: { en: 'Full Name', fr: 'Nom complet' } as T,
      statusPermissions: {
        en: 'Account Status & Permissions',
        fr: 'Statut du compte et permissions',
      } as T,
      accountStatus: { en: 'Account Status', fr: 'Statut du compte' } as T,
      verificationStatus: { en: 'Verification Status', fr: 'Statut de vérification' } as T,
      activityTimeline: {
        en: 'Account Activity & Timeline',
        fr: 'Activité du compte et historique',
      } as T,
      memberSince: { en: 'Member Since', fr: 'Membre depuis' } as T,
      profileUpdated: { en: 'Profile Updated', fr: 'Profil mis à jour' } as T,
      lastLogin: { en: 'Last Login', fr: 'Dernière connexion' } as T,
    },

    // user-dialogs.tsx — delete
    deleteDialog: {
      title: { en: 'Delete User', fr: 'Supprimer l’utilisateur' } as T,
      desc: {
        en: 'Are you sure you want to delete this user? This action cannot be undone.',
        fr: 'Êtes-vous sûr de vouloir supprimer cet utilisateur ? Cette action est irréversible.',
      } as T,
      userLabel: { en: 'User:', fr: 'Utilisateur :' } as T,
      emailLabel: { en: 'Email:', fr: 'E-mail :' } as T,
      permanent: {
        en: 'All associated data will be permanently deleted.',
        fr: 'Toutes les données associées seront définitivement supprimées.',
      } as T,
      deleting: { en: 'Deleting...', fr: 'Suppression…' } as T,
      deleteBtn: { en: 'Delete User', fr: 'Supprimer l’utilisateur' } as T,
    },
  },
};

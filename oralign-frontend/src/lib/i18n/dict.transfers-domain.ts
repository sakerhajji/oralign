import type { Lang } from './dict';

type T = Record<Lang, string>;

/**
 * Bank-transfer receipts on the doctor side (spec §1 and §9): the
 * ReceiptPicker (camera / file, compression, preview, replace, remove,
 * progress, inline errors), the per-installment transfer state of the pack
 * panel (« Reçu envoyé » / « En cours de vérification » / « Refusé » +
 * motif), the refused treatment-fee banner, the history desk's reason and
 * receipt, and the receipt viewer. Owned by P-A2 (receipt-upload-frontend);
 * error copy keyed by the backend errorCode values through
 * lib/payments/receipt-errors.ts (TRANSFER_ERROR in lib/types/billing.ts).
 *
 * A unique top-level namespace (`transfers`), spread into dict
 * (`...transfersDomainDict`) by the main dictionary, which shallow-spreads
 * its domains, so no other file may use this key. Same leaf shape as
 * dict.ts: every leaf is `{ en, fr } as T`.
 *
 * Wording: « aligneurs transparents », never a brand name; the lab is
 * « l’équipe Oralign ».
 */
export const transfersDomainDict = {
  transfers: {
    // The five derived states (lib/payments/transfer-state.ts), in the
    // words of each audience.
    state: {
      doctor: {
        awaiting_receipt: { en: 'Awaiting receipt', fr: 'En attente du reçu' } as T,
        receipt_sent: { en: 'Receipt sent', fr: 'Reçu envoyé' } as T,
        to_verify: { en: 'Being checked', fr: 'En cours de vérification' } as T,
        paid: { en: 'Paid', fr: 'Payé' } as T,
        refused: { en: 'Refused', fr: 'Refusé' } as T,
      },
      // « Nouveau / Consulté » is per admin (notification read state, the
      // pending desk's chip), never this global state.
      admin: {
        awaiting_receipt: { en: 'Awaiting receipt', fr: 'En attente du reçu' } as T,
        receipt_sent: { en: 'Receipt sent', fr: 'Reçu envoyé' } as T,
        to_verify: { en: 'To check', fr: 'À vérifier' } as T,
        paid: { en: 'Confirmed', fr: 'Validé' } as T,
        refused: { en: 'Refused', fr: 'Refusé' } as T,
      },
      hint: {
        receipt_sent: {
          en: 'The Oralign team will check your transfer. You can still replace the receipt or withdraw the declaration.',
          fr: 'L’équipe Oralign va vérifier votre virement. Vous pouvez encore remplacer le reçu ou retirer la déclaration.',
        } as T,
        to_verify: {
          en: 'The Oralign team is checking your transfer against the bank statement.',
          fr: 'L’équipe Oralign vérifie votre virement sur le relevé bancaire.',
        } as T,
        refused: {
          en: 'The transfer was not confirmed. Send a new receipt, or pay another way.',
          fr: 'Le virement n’a pas été validé. Envoyez un nouveau reçu, ou payez autrement.',
        } as T,
      },
    },

    // The shared receipt picker (components/payments/receipt-picker.tsx).
    picker: {
      title: { en: 'Transfer receipt', fr: 'Reçu du virement' } as T,
      hint: {
        en: 'A photo or screenshot of the receipt, or your bank’s PDF. JPEG, PNG, WebP or PDF, 10 MB at most; photos are lightened automatically.',
        fr: 'Une photo ou une capture du reçu, ou le PDF de votre banque. JPEG, PNG, WebP ou PDF, 10 Mo au plus ; les photos sont allégées automatiquement.',
      } as T,
      takePhoto: { en: 'Take a photo', fr: 'Prendre une photo' } as T,
      chooseFile: { en: 'Choose a file', fr: 'Choisir un fichier' } as T,
      dropHint: { en: 'or drop the file here', fr: 'ou déposez le fichier ici' } as T,
      preparing: { en: 'Preparing the receipt…', fr: 'Préparation du reçu…' } as T,
      replace: { en: 'Replace', fr: 'Remplacer' } as T,
      remove: { en: 'Remove', fr: 'Retirer' } as T,
      removeAria: { en: 'Remove the receipt {name}', fr: 'Retirer le reçu {name}' } as T,
      compressed: {
        en: 'Photo lightened: {from} → {to}',
        fr: 'Photo allégée : {from} → {to}',
      } as T,
      pdf: { en: 'PDF document', fr: 'Document PDF' } as T,
      openPreview: { en: 'Open the preview', fr: 'Ouvrir l’aperçu' } as T,
      previewAlt: { en: 'Preview of the transfer receipt', fr: 'Aperçu du reçu de virement' } as T,
      uploading: { en: 'Sending the receipt… {percent}%', fr: 'Envoi du reçu… {percent} %' } as T,
      uploadingPlain: { en: 'Sending the receipt…', fr: 'Envoi du reçu…' } as T,
      required: {
        en: 'Add the transfer receipt to continue.',
        fr: 'Ajoutez le reçu du virement pour continuer.',
      } as T,
      retry: { en: 'Try again', fr: 'Réessayer' } as T,
      chooseAnother: { en: 'Choose another file', fr: 'Choisir un autre fichier' } as T,
    },

    // Why a receipt could not be sent (lib/payments/receipt-errors.ts).
    errors: {
      empty: {
        en: 'This file is empty. Pick the receipt again.',
        fr: 'Ce fichier est vide. Choisissez le reçu à nouveau.',
      } as T,
      type: {
        en: 'This format is not accepted. Send a photo (JPEG, PNG, WebP) or a PDF.',
        fr: 'Ce format n’est pas accepté. Envoyez une photo (JPEG, PNG, WebP) ou un PDF.',
      } as T,
      heic_unsupported: {
        en: 'This browser cannot convert HEIC photos. Use “Take a photo”, or send a screenshot or a PDF.',
        fr: 'Ce navigateur ne sait pas convertir les photos HEIC. Utilisez « Prendre une photo », ou envoyez une capture d’écran ou un PDF.',
      } as T,
      // The same refusal with a mouse: « Prendre une photo » is not shown.
      heic_unsupported_desktop: {
        en: 'This browser cannot convert HEIC photos. Convert it to JPEG, or send a screenshot or a PDF.',
        fr: 'Ce navigateur ne sait pas convertir les photos HEIC. Convertissez-la en JPEG, ou envoyez une capture d’écran ou un PDF.',
      } as T,
      too_large: {
        en: 'The file is over 10 MB. Send a lighter photo or PDF.',
        fr: 'Le fichier dépasse 10 Mo. Envoyez une photo ou un PDF plus léger.',
      } as T,
      proof_required: {
        en: 'The transfer receipt is required.',
        fr: 'Le reçu du virement est obligatoire.',
      } as T,
      in_flight: {
        en: 'Another payment of this amount is already in progress. Wait until it is confirmed or expires.',
        fr: 'Un autre paiement de ce montant est déjà en cours. Attendez sa validation ou son expiration.',
      } as T,
      not_withdrawable: {
        en: 'The Oralign team has just processed this transfer: it can no longer be changed.',
        fr: 'L’équipe Oralign vient de traiter ce virement : il ne peut plus être modifié.',
      } as T,
      already_processed: {
        en: 'This transfer has already been processed. The page is being updated.',
        fr: 'Ce virement a déjà été traité. La page se met à jour.',
      } as T,
      withholding: {
        en: 'The retenue à la source has changed. Check the amount, then send again.',
        fr: 'La retenue à la source a changé. Vérifiez le montant, puis renvoyez.',
      } as T,
      nothing_due: {
        en: 'Nothing to pay: the fees of this case are waived.',
        fr: 'Rien à payer : les frais de ce cas sont offerts.',
      } as T,
      network: {
        en: 'The connection dropped while sending. Check it, then try again.',
        fr: 'La connexion a été perdue pendant l’envoi. Vérifiez-la, puis réessayez.',
      } as T,
      timeout: {
        en: 'Sending took too long. Try again: a receipt already received is never counted twice.',
        fr: 'L’envoi a pris trop de temps. Réessayez : un reçu déjà reçu n’est jamais compté deux fois.',
      } as T,
      throttled: {
        en: 'Too many attempts. Wait a moment, then try again.',
        fr: 'Trop de tentatives. Patientez un instant, puis réessayez.',
      } as T,
      server: {
        en: 'The receipt could not be sent. Try again in a moment.',
        fr: 'Le reçu n’a pas pu être envoyé. Réessayez dans un instant.',
      } as T,
    },

    // 409 PAYMENT_ATTEMPT_IN_PROGRESS on a card start or on cash / cheque
    // (lib/payments/payment-refusals.ts): another payment of the same
    // installment or fee is open.
    inFlight: {
      admin: {
        transfer: {
          en: 'A declared bank transfer is waiting to be checked. Confirm or refuse it first (Pending payments), then record the payment.',
          fr: 'Un virement déclaré attend sa vérification. Confirmez ou refusez d’abord le virement en attente (Paiements en attente), puis enregistrez le paiement.',
        } as T,
        card: {
          en: 'A card payment is under way for this amount. Wait until it succeeds or expires (about fifteen minutes), then try again.',
          fr: 'Un paiement par carte est en cours pour ce montant. Attendez qu’il aboutisse ou expire (une quinzaine de minutes), puis réessayez.',
        } as T,
      },
      doctor: {
        transfer: {
          en: 'Your declared bank transfer is being checked by the Oralign team. Wait for its decision, or withdraw the declaration before paying another way.',
          fr: 'Votre virement déclaré est en cours de vérification par l’équipe Oralign. Attendez sa décision, ou retirez la déclaration avant de payer autrement.',
        } as T,
        card: {
          en: 'A card payment is already under way for this amount. Finish it, or wait for it to expire (about fifteen minutes), before paying another way.',
          fr: 'Un paiement par carte est déjà en cours pour ce montant. Terminez-le, ou attendez son expiration (une quinzaine de minutes), avant de payer autrement.',
        } as T,
      },
      unknown: {
        en: 'Another payment of this amount is already open (a transfer to check or a card payment). Wait until it is processed, then try again.',
        fr: 'Un autre paiement de ce montant est déjà ouvert (virement à vérifier ou paiement par carte). Attendez qu’il soit traité, puis réessayez.',
      } as T,
    },

    // Actions on a declaration in flight or refused.
    actions: {
      viewReceipt: { en: 'View receipt', fr: 'Voir le reçu' } as T,
      replaceReceipt: { en: 'Replace receipt', fr: 'Remplacer le reçu' } as T,
      withdraw: { en: 'Withdraw', fr: 'Retirer' } as T,
      withdrawLong: { en: 'Withdraw the declaration', fr: 'Retirer la déclaration' } as T,
      resubmit: { en: 'Send a new receipt', fr: 'Envoyer un nouveau reçu' } as T,
      more: { en: 'Transfer actions', fr: 'Actions du virement' } as T,
    },

    withdrawDialog: {
      title: { en: 'Withdraw this transfer?', fr: 'Retirer ce virement ?' } as T,
      descInstallment: {
        en: 'The declaration of installment no. {n} is cancelled: the Oralign team will not check it. The receipt stays archived. You can then declare a new transfer or pay by card.',
        fr: 'La déclaration de l’échéance n° {n} est annulée : l’équipe Oralign ne la vérifiera pas. Le reçu reste archivé. Vous pourrez ensuite déclarer un nouveau virement ou payer par carte.',
      } as T,
      descFee: {
        en: 'The treatment-fee declaration is cancelled: the Oralign team will not check it. The receipt stays archived. You can then declare a new transfer or pay by card.',
        fr: 'La déclaration des frais de traitement est annulée : l’équipe Oralign ne la vérifiera pas. Le reçu reste archivé. Vous pourrez ensuite déclarer un nouveau virement ou payer par carte.',
      } as T,
      confirm: { en: 'Withdraw', fr: 'Retirer' } as T,
      cancel: { en: 'Keep it', fr: 'Garder' } as T,
    },

    refused: {
      title: { en: 'Transfer refused', fr: 'Virement refusé' } as T,
      reason: { en: 'Reason: {reason}', fr: 'Motif : {reason}' } as T,
      reasonLabel: { en: 'Reason', fr: 'Motif' } as T,
      noReason: { en: 'No reason given.', fr: 'Aucun motif indiqué.' } as T,
      on: { en: 'Refused on {date}', fr: 'Refusé le {date}' } as T,
      previous: {
        en: 'Your previous transfer was refused.',
        fr: 'Votre précédent virement a été refusé.',
      } as T,
    },

    sentOn: { en: 'Receipt sent on {date}', fr: 'Reçu envoyé le {date}' } as T,
    sentShort: { en: 'sent {date}', fr: 'envoyé le {date}' } as T,

    // The pack panel (quote-pack-panel.tsx): one row's transfer.
    panel: {
      transferOf: {
        en: 'Transfer for installment no. {n}',
        fr: 'Virement de l’échéance n° {n}',
      } as T,
      inFlightNote: {
        en: '{count} transfer(s) waiting for the Oralign team’s check.',
        fr: '{count} virement(s) en attente de vérification par l’équipe Oralign.',
      } as T,
    },

    // The pay dialogs in replace / resubmit mode.
    dialog: {
      replaceTitle: { en: 'Replace the receipt', fr: 'Remplacer le reçu' } as T,
      replaceDesc: {
        en: 'The new receipt replaces the one sent on {date}; the old one stays archived.',
        fr: 'Le nouveau reçu remplace celui envoyé le {date} ; l’ancien reste archivé.',
      } as T,
      replaceDescUndated: {
        en: 'The new receipt replaces the one already sent; the old one stays archived.',
        fr: 'Le nouveau reçu remplace celui déjà envoyé ; l’ancien reste archivé.',
      } as T,
      replaceSubmit: { en: 'Send the new receipt', fr: 'Envoyer le nouveau reçu' } as T,
      partial: {
        en: '{done} of {total} declarations sent. Try again to send the others.',
        fr: '{done} déclaration(s) sur {total} envoyée(s). Réessayez pour envoyer les autres.',
      } as T,
      declaredAll: {
        en: '{count} transfer declarations sent.',
        fr: '{count} déclarations de virement envoyées.',
      } as T,
    },

    // The receipt viewer (components/payments/receipt-viewer.tsx).
    viewer: {
      title: { en: 'Transfer receipt', fr: 'Reçu du virement' } as T,
      descInstallment: {
        en: 'Installment no. {n} · {code}',
        fr: 'Échéance n° {n} · {code}',
      } as T,
      descInstallmentPlain: { en: 'Installment · {code}', fr: 'Échéance · {code}' } as T,
      descFee: { en: 'Treatment fee · {code}', fr: 'Frais de traitement · {code}' } as T,
      loading: { en: 'Loading the receipt…', fr: 'Chargement du reçu…' } as T,
      notFound: {
        en: 'This receipt is not available.',
        fr: 'Ce reçu n’est pas disponible.',
      } as T,
      error: {
        en: 'The receipt could not be shown.',
        fr: 'Impossible d’afficher le reçu.',
      } as T,
      retry: { en: 'Try again', fr: 'Réessayer' } as T,
      open: { en: 'Open in a tab', fr: 'Ouvrir dans un onglet' } as T,
      download: { en: 'Download', fr: 'Télécharger' } as T,
      zoom: { en: 'Enlarge', fr: 'Agrandir' } as T,
      pdfHint: {
        en: 'The receipt is a PDF document.',
        fr: 'Le reçu est un document PDF.',
      } as T,
      processInQueue: { en: 'Process in the queue', fr: 'Traiter dans la file' } as T,
      close: { en: 'Close', fr: 'Fermer' } as T,
      fileName: { en: 'transfer-receipt', fr: 'recu-virement' } as T,
      summary: { en: 'Transfer', fr: 'Virement' } as T,
      stateLabel: { en: 'Status', fr: 'État' } as T,
      amount: { en: 'Amount transferred', fr: 'Montant viré' } as T,
      sentAt: { en: 'Sent on', fr: 'Envoyé le' } as T,
      patient: { en: 'Patient', fr: 'Patient' } as T,
    },

    // The treatment-fee banner of the order page.
    fee: {
      sentTitle: {
        en: 'Fee receipt sent · {amount}',
        fr: 'Reçu des frais envoyé · {amount}',
      } as T,
      reviewTitle: {
        en: 'Fee transfer being checked · {amount}',
        fr: 'Virement des frais en cours de vérification · {amount}',
      } as T,
      refusedTitle: { en: 'Fee transfer refused', fr: 'Virement des frais refusé' } as T,
      adminRefusedHint: {
        en: 'The practitioner can send a new receipt; you can also record a payment.',
        fr: 'Le praticien peut envoyer un nouveau reçu ; vous pouvez aussi enregistrer un paiement.',
      } as T,
      recordPayment: { en: 'Record a payment', fr: 'Enregistrer un paiement' } as T,
      payOtherwise: { en: 'Pay another way', fr: 'Payer autrement' } as T,
    },

    // The payments history desk.
    history: {
      sentOn: { en: 'Sent {date}', fr: 'Envoyé le {date}' } as T,
      reasonInline: { en: 'Reason: {reason}', fr: 'Motif : {reason}' } as T,
    },

    toasts: {
      receiptReplaced: {
        en: 'The new receipt has been sent.',
        fr: 'Le nouveau reçu a bien été envoyé.',
      } as T,
      withdrawn: {
        en: 'The transfer declaration has been withdrawn.',
        fr: 'La déclaration de virement a été retirée.',
      } as T,
    },
  },
};

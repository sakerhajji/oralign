import type { Lang } from './dict';
type T = Record<Lang, string>;

/** Treatment review + treatment chat strings — spread into dict. */
export const treatmentDomainDict = {
  // ════════════════════════════════════════════════════════════════════
  // treatment-plan-review.tsx — admin / planner / doctor review screen
  // ════════════════════════════════════════════════════════════════════
  treatmentReview: {
    // ─── Top-level loading / error ───────────────────────────────────
    loadFailed: {
      en: 'Failed to load treatment plan.',
      fr: 'Échec du chargement du plan de traitement.',
    } as T,
    loading: { en: 'Loading…', fr: 'Chargement…' } as T,
    odontogramLoading: {
      en: 'Loading odontogram…',
      fr: 'Chargement de l’odontogramme…',
    } as T,

    // ─── Approved celebration banner ─────────────────────────────────
    approvedBanner: {
      title: {
        en: 'Treatment plan approved',
        fr: 'Plan de traitement approuvé',
      } as T,
      // Composed as: "<approvedPrefix>[ on <date>]. <inManufacturing>"
      approvedPrefix: { en: 'Approved', fr: 'Approuvé' } as T,
      approvedOn: { en: 'on {date}', fr: 'le {date}' } as T,
      inManufacturing: {
        en: 'The order is now in manufacturing.',
        fr: 'La commande est désormais en fabrication.',
      } as T,
    },

    // ─── Ready-for-review action card ────────────────────────────────
    ready: {
      resendTitle: {
        en: 'Renew treatment plan',
        fr: 'Renouveler le plan de traitement',
      } as T,
      sendTitle: {
        en: 'Send for doctor review',
        fr: 'Envoyer pour examen du praticien',
      } as T,
      // Composed: "<resendDescBefore> (v{n}) <resendDescAfter>"
      resendDescBefore: {
        en: 'The doctor rejected this version. Clicking below creates an editable draft',
        fr: 'Le praticien a rejeté cette version. Le bouton ci-dessous crée un brouillon modifiable',
      } as T,
      resendDescAfter: {
        en: 'from the old plan. Edit it, then mark it ready when it is correct.',
        fr: 'à partir de l’ancien plan. Modifiez-le, puis marquez-le comme prêt quand il est corrigé.',
      } as T,
      sendDesc: {
        en: 'Mark this plan as ready once the viewer URL, movement table, and any result files are in place. The doctor is then unblocked to approve or reject.',
        fr: 'Marquez ce plan comme prêt une fois l’URL du visualiseur, le tableau des mouvements et les fichiers de résultats en place. Le praticien pourra alors l’approuver ou le rejeter.',
      } as T,
      createNewVersion: {
        en: 'Create editable new version',
        fr: 'Créer une nouvelle version modifiable',
      } as T,
      markReady: {
        en: 'Mark as ready for review',
        fr: 'Marquer comme prêt pour examen',
      } as T,
    },

    // ─── Plan header (title + dates + public link) ───────────────────
    header: {
      // Composed: "<createdLabel> {date}"
      createdLabel: { en: 'Created', fr: 'Créé le' } as T,
      approvedLabel: { en: 'Approved', fr: 'Approuvé le' } as T,
      rejectedLabel: { en: 'Rejected', fr: 'Rejeté le' } as T,
      copyPatientLink: {
        en: 'Copy patient link',
        fr: 'Copier le lien patient',
      } as T,
      patientLinkCopied: {
        en: 'Patient link copied.',
        fr: 'Lien patient copié.',
      } as T,
      patientLinkActive: {
        en: 'Patient link active',
        fr: 'Lien patient actif',
      } as T,
      patientLinkExpired: {
        en: 'Patient link expired',
        fr: 'Lien patient expiré',
      } as T,
      expiresOn: {
        en: 'Expires {date}',
        fr: 'Expire le {date}',
      } as T,
      rotatePatientLink: {
        en: 'Rotate patient link',
        fr: 'Renouveler le lien patient',
      } as T,
      generatePatientLink: {
        en: 'Generate patient link',
        fr: 'Générer le lien patient',
      } as T,
    },

    // ─── Status badge labels ─────────────────────────────────────────
    status: {
      pending: { en: 'Pending', fr: 'En attente' } as T,
      ready: { en: 'Ready for review', fr: 'Prêt pour examen' } as T,
      approved: { en: 'Approved', fr: 'Approuvé' } as T,
      rejected: { en: 'Rejected', fr: 'Rejeté' } as T,
    },

    // ─── Treatment viewer card ───────────────────────────────────────
    viewer: {
      title: { en: 'Treatment Viewer', fr: 'Visualiseur du traitement' } as T,
      iframeTitle: {
        en: 'Treatment Viewer',
        fr: 'Visualiseur du traitement',
      } as T,
      externalBadge: { en: 'External viewer', fr: 'Visualiseur externe' } as T,
      internalBadge: { en: 'Internal viewer', fr: 'Visualiseur interne' } as T,
      cannotEmbed: {
        en: 'The viewer cannot be embedded.',
        fr: 'Le visualiseur ne peut pas être intégré.',
      } as T,
      notAvailable: {
        en: 'Treatment viewer is not available yet.',
        fr: 'Le visualiseur du traitement n’est pas encore disponible.',
      } as T,
      urlLabel: { en: 'Viewer URL', fr: 'URL du visualiseur' } as T,
      typeLabel: { en: 'Viewer type', fr: 'Type de visualiseur' } as T,
      internalTitle: { en: 'Internal viewer', fr: 'Visualiseur interne' } as T,
      internalDesc: {
        en: 'Trusted viewer hosted by you. Plain iframe, no logo injection.',
        fr: 'Visualiseur de confiance hébergé par vos soins. Iframe simple, sans insertion de logo.',
      } as T,
      externalTitle: { en: 'External viewer', fr: 'Visualiseur externe' } as T,
      externalDesc: {
        en: 'Wrap in Oralign-branded shell with smart logo injection. Use for Hirsch and other third-party 3D viewers.',
        fr: 'Encadrer dans une coque aux couleurs d’Oralign avec insertion intelligente du logo. À utiliser pour Hirsch et autres visualiseurs 3D tiers.',
      } as T,
      saveViewer: { en: 'Save viewer', fr: 'Enregistrer le visualiseur' } as T,
    },

    // ─── Treatment odontogram & IPR section ──────────────────────────
    odontogram: {
      cardTitle: {
        en: 'Treatment odontogram & IPR',
        fr: 'Odontogramme de traitement et IPR',
      } as T,
      selectorTitle: {
        en: 'Treatment odontogram',
        fr: 'Odontogramme de traitement',
      } as T,
      selectorSubtitle: {
        en: "The doctor's order colours are shown as a background reference. Add pink ATTACHMENT marks on individual teeth, and click the dotted contacts between teeth to set IPR (mm) and Step values.",
        fr: 'Les couleurs de la prescription du praticien sont affichées en arrière-plan comme référence. Ajoutez des marques de TAQUET roses sur chaque dent, et cliquez sur les contacts pointillés entre les dents pour définir les valeurs d’IPR (mm) et d’étape.',
      } as T,
      perToothTitle: {
        en: 'Per-tooth IPR and STEP',
        fr: 'IPR et étape par dent',
      } as T,
      perToothDesc: {
        en: 'Click the dotted contact between two teeth to add an IPR amount in millimetres. Use the STEP field for the aligner step reference; both values save together.',
        fr: 'Cliquez sur le contact pointillé entre deux dents pour ajouter une quantité d’IPR en millimètres. Utilisez le champ ÉTAPE pour la référence de l’étape de gouttière ; les deux valeurs sont enregistrées ensemble.',
      } as T,
    },

    // ─── IPR mode toggle (segmented control) ─────────────────────────
    iprToggle: {
      ariaLabel: { en: 'IPR input mode', fr: 'Mode de saisie de l’IPR' } as T,
      perTooth: { en: 'Per-tooth', fr: 'Par dent' } as T,
      byImage: { en: 'By image', fr: 'Par image' } as T,
    },

    // ─── IPR reference image block ───────────────────────────────────
    iprImage: {
      title: { en: 'IPR reference image', fr: 'Image de référence IPR' } as T,
      desc: {
        en: 'Upload an IPR map exported from your CAD software. The doctor and public viewer will see this image alongside the odontogram.',
        fr: 'Téléversez une carte d’IPR exportée depuis votre logiciel de CAO. Le praticien et le visualiseur public la verront aux côtés de l’odontogramme.',
      } as T,
      replaceImage: { en: 'Replace image', fr: 'Remplacer l’image' } as T,
      uploadImage: { en: 'Upload image', fr: 'Téléverser l’image' } as T,
      remove: { en: 'Remove', fr: 'Supprimer' } as T,
      loadingImage: { en: 'Loading image…', fr: 'Chargement de l’image…' } as T,
      alt: { en: 'IPR reference image', fr: 'Image de référence IPR' } as T,
      loadError: {
        en: 'Unable to load image preview.',
        fr: 'Impossible de charger l’aperçu de l’image.',
      } as T,
      viewFullSize: {
        en: 'View full size',
        fr: 'Afficher en taille réelle',
      } as T,
      noImage: {
        en: 'No IPR image uploaded.',
        fr: 'Aucune image IPR téléversée.',
      } as T,
      lightboxAlt: {
        en: 'IPR reference image — full size',
        fr: 'Image de référence IPR — taille réelle',
      } as T,
      lightboxCaption: {
        en: 'IPR reference image',
        fr: 'Image de référence IPR',
      } as T,
    },

    // ─── Clinical image gallery ──────────────────────────────────────
    clinical: {
      // Slot labels — resolved with t() inside the component (no t at module scope).
      slots: {
        leftLateral: { en: 'Right lateral view', fr: 'Vue latérale droite' } as T,
        frontalOcclusion: {
          en: 'Frontal occlusion view',
          fr: 'Vue d’occlusion frontale',
        } as T,
        rightLateral: {
          en: 'Left lateral view',
          fr: 'Vue latérale gauche',
        } as T,
        upperOcclusal: {
          en: 'Upper occlusal view',
          fr: 'Vue occlusale supérieure',
        } as T,
        lowerOcclusal: {
          en: 'Lower occlusal view',
          fr: 'Vue occlusale inférieure',
        } as T,
      },
      galleryTitle: {
        en: 'Clinical image views',
        fr: 'Vues des images cliniques',
      } as T,
      galleryDesc: {
        en: 'Order photos sent with the case, shown here for treatment review.',
        fr: 'Photos de la commande envoyées avec le dossier, affichées ici pour l’examen du traitement.',
      } as T,
      uploadedBadge: { en: '{n}/{total} uploaded', fr: '{n}/{total} téléversées' } as T,
      loading: { en: 'Loading…', fr: 'Chargement…' } as T,
      view: { en: 'View', fr: 'Afficher' } as T,
      loadError: {
        en: 'Unable to load preview.',
        fr: 'Impossible de charger l’aperçu.',
      } as T,
      notUploaded: { en: 'Not uploaded', fr: 'Non téléversée' } as T,
      fallbackAlt: { en: 'Clinical image', fr: 'Image clinique' } as T,
    },

    // ─── Dental treatment table section ──────────────────────────────
    dentalTable: {
      cardTitle: {
        en: 'Dental treatment table',
        fr: 'Tableau de traitement dentaire',
      } as T,
      cardSubtitle: {
        en: '(Traitement dentaire)',
        fr: '(Traitement dentaire)',
      } as T,
      replace: { en: 'Replace', fr: 'Remplacer' } as T,
      paste: { en: 'Paste', fr: 'Coller' } as T,
      remove: { en: 'Remove', fr: 'Supprimer' } as T,
      desc: {
        en: 'Per-tooth restorative / endodontic / extraction plan. Separate from the orthodontic movement table above — upload it as an image (PNG, JPG or WebP, max 10 MB) so the doctor sees the full plan alongside the odontogram.',
        fr: 'Plan de soins conservateurs / endodontiques / d’extraction par dent. Distinct du tableau des mouvements orthodontiques ci-dessus — téléversez-le sous forme d’image (PNG, JPG ou WebP, max. 10 Mo) afin que le praticien voie le plan complet aux côtés de l’odontogramme.',
      } as T,
      pasteAriaExisting: {
        en: 'Dental treatment table — click then press Ctrl-V to paste a new image',
        fr: 'Tableau de traitement dentaire — cliquez puis appuyez sur Ctrl-V pour coller une nouvelle image',
      } as T,
      loadingImage: { en: 'Loading image…', fr: 'Chargement de l’image…' } as T,
      viewFullAria: {
        en: 'View dental treatment table full size',
        fr: 'Afficher le tableau de traitement dentaire en taille réelle',
      } as T,
      imageAlt: {
        en: 'Dental treatment table',
        fr: 'Tableau de traitement dentaire',
      } as T,
      openFullView: { en: 'Open full view', fr: 'Ouvrir en plein écran' } as T,
      dropzoneAria: {
        en: 'Dental treatment table upload dropzone — click then press Ctrl-V to paste an image',
        fr: 'Zone de dépôt du tableau de traitement dentaire — cliquez puis appuyez sur Ctrl-V pour coller une image',
      } as T,
      noImageYet: {
        en: 'No image uploaded yet',
        fr: 'Aucune image téléversée pour le moment',
      } as T,
      // Composed: "<dropHintBefore> Ctrl + V <dropHintAfter>"
      dropHintBefore: {
        en: 'Upload the dental treatment table as PNG, JPG or WebP, or click this area and press',
        fr: 'Téléversez le tableau de traitement dentaire en PNG, JPG ou WebP, ou cliquez sur cette zone et appuyez sur',
      } as T,
      dropHintAfter: {
        en: 'to paste a screenshot.',
        fr: 'pour coller une capture d’écran.',
      } as T,
      uploadImage: { en: 'Upload image', fr: 'Téléverser l’image' } as T,
      pasteFromClipboard: {
        en: 'Paste from clipboard',
        fr: 'Coller depuis le presse-papiers',
      } as T,
      readonlyEmpty: {
        en: 'The dental treatment table will appear here once the planner uploads it.',
        fr: 'Le tableau de traitement dentaire apparaîtra ici une fois que le planificateur l’aura téléversé.',
      } as T,
      lightboxAlt: {
        en: 'Dental treatment table — full view',
        fr: 'Tableau de traitement dentaire — plein écran',
      } as T,
      lightboxCaption: {
        en: 'Dental treatment table',
        fr: 'Tableau de traitement dentaire',
      } as T,
      // toast.* messages (paste-from-clipboard flow)
      toasts: {
        notImage: {
          en: 'Pasted content is not an image.',
          fr: 'Le contenu collé n’est pas une image.',
        } as T,
        tooLarge: {
          en: 'Image must be 10 MB or smaller.',
          fr: 'L’image ne doit pas dépasser 10 Mo.',
        } as T,
        noImageOnClipboard: {
          en: 'No image found on the clipboard.',
          fr: 'Aucune image trouvée dans le presse-papiers.',
        } as T,
        // Composed: "<message>. <clipboardReadTip>"
        clipboardReadFailed: {
          en: 'Clipboard read failed',
          fr: 'Échec de la lecture du presse-papiers',
        } as T,
        clipboardReadTip: {
          en: 'Tip: click the upload area and press Ctrl-V.',
          fr: 'Astuce : cliquez sur la zone de téléversement et appuyez sur Ctrl-V.',
        } as T,
        noProgrammaticRead: {
          en: 'Your browser does not allow programmatic clipboard reads. Click the upload area and press Ctrl-V instead.',
          fr: 'Votre navigateur n’autorise pas la lecture automatique du presse-papiers. Cliquez plutôt sur la zone de téléversement et appuyez sur Ctrl-V.',
        } as T,
      },
    },

    // ─── Treatment conversation card wrapper ─────────────────────────
    conversationCardTitle: {
      en: 'Treatment Conversation',
      fr: 'Conversation du traitement',
    } as T,

    // ─── Approve / Reject decision bar ───────────────────────────────
    approval: {
      approvedTitle: {
        en: 'Plan approved',
        fr: 'Plan approuvé',
      } as T,
      alreadyApproved: {
        en: 'This plan has already been approved.',
        fr: 'Ce plan a déjà été approuvé.',
      } as T,
      approvedDate: {
        en: 'Approved on {date}',
        fr: 'Approuvé le {date}',
      } as T,
      rejectedTitle: {
        en: 'Plan rejected',
        fr: 'Plan rejeté',
      } as T,
      wasRejected: {
        en: 'This plan was rejected — the designer will send a new version.',
        fr: 'Ce plan a été rejeté — le concepteur enverra une nouvelle version.',
      } as T,
      rejectedDate: {
        en: 'Rejected on {date}',
        fr: 'Rejeté le {date}',
      } as T,
      awaitingTitle: {
        en: 'Awaiting designer',
        fr: 'En attente du concepteur',
      } as T,
      awaitingDesigner: {
        en: 'Awaiting the designer — buttons unlock once the plan is marked ready.',
        fr: 'En attente du concepteur — les boutons se débloquent une fois le plan marqué comme prêt.',
      } as T,
      rejectDialogTitle: {
        en: 'Reject treatment plan',
        fr: 'Rejeter le plan de traitement',
      } as T,
      rejectDialogDesc: {
        en: 'Explain clearly what must be corrected. Your reason will be posted in the treatment conversation for the designer.',
        fr: 'Expliquez clairement ce qui doit être corrigé. Votre raison sera publiée dans la conversation du traitement pour le concepteur.',
      } as T,
      rejectReasonLabel: {
        en: 'Reason for rejection',
        fr: 'Raison du rejet',
      } as T,
      rejectReasonPlaceholder: {
        en: 'Example: reduce proclination on the upper incisors, avoid IPR between 12/11, and review midline correction.',
        fr: 'Exemple : réduire la proclinaison des incisives supérieures, éviter l’IPR entre 12/11 et revoir la correction de la ligne médiane.',
      } as T,
      rejectReasonHelp: {
        en: 'This note becomes a rejection message in the chat and stays in the case history.',
        fr: 'Cette note devient un message de rejet dans le chat et reste dans l’historique du cas.',
      } as T,
      cancelReject: { en: 'Cancel', fr: 'Annuler' } as T,
      confirmReject: {
        en: 'Reject and send reason',
        fr: 'Rejeter et envoyer la raison',
      } as T,
      reject: { en: 'Reject', fr: 'Rejeter' } as T,
      approve: { en: 'Approve', fr: 'Approuver' } as T,
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // treatment-conversation.tsx — order-scoped chat thread
  // ════════════════════════════════════════════════════════════════════
  treatmentChat: {
    // ─── Connection chip ─────────────────────────────────────────────
    conversation: { en: 'Conversation', fr: 'Conversation' } as T,
    liveConnected: {
      en: 'Live updates connected',
      fr: 'Mises à jour en direct connectées',
    } as T,
    reconnecting: { en: 'Reconnecting…', fr: 'Reconnexion…' } as T,
    live: { en: 'Live', fr: 'En direct' } as T,
    offline: { en: 'Offline', fr: 'Hors ligne' } as T,

    // ─── Empty / timeline states ─────────────────────────────────────
    emptyState: {
      en: 'No messages yet. Start the conversation below.',
      fr: 'Aucun message pour le moment. Démarrez la conversation ci-dessous.',
    } as T,

    // ─── Composer ────────────────────────────────────────────────────
    messagePlaceholder: {
      en: 'Write a message…',
      fr: 'Écrivez un message…',
    } as T,
    attachFiles: { en: 'Attach files', fr: 'Joindre des fichiers' } as T,
    sendTooltip: { en: 'Send (Enter)', fr: 'Envoyer (Entrée)' } as T,
    categoryLabel: {
      en: 'Category for attached files:',
      fr: 'Catégorie des fichiers joints :',
    } as T,
    autoDetect: { en: 'Auto-detect', fr: 'Détection automatique' } as T,

    // ─── Attachments / lightbox ──────────────────────────────────────
    fallbackAttachmentName: { en: 'attachment', fr: 'pièce jointe' } as T,
    couldNotLoadImage: {
      en: 'Could not load image',
      fr: 'Impossible de charger l’image',
    } as T,
    openInFullView: {
      en: 'Open {name} in full view',
      fr: 'Ouvrir {name} en plein écran',
    } as T,
    failedToOpenAttachment: {
      en: 'Failed to open attachment',
      fr: 'Échec de l’ouverture de la pièce jointe',
    } as T,
  },
};

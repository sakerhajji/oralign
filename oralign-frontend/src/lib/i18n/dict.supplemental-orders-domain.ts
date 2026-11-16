import type { Lang } from './dict';

type T = Record<Lang, string>;

/**
 * Supplemental requests (additional aligners, replacement, transfer tray,
 * warranty). Keys used outside the feature folder stay stable:
 * `type.*`, `typeDescription.*`, `status.*`, `coverage.<status>`,
 * `newRequest`, `parentCase`, `actions.viewList`.
 */
export const supplementalOrdersDomainDict = {
  supplemental: {
    newRequest: { en: 'New request', fr: 'Nouvelle demande' } as T,
    parentCase: { en: 'Initial case', fr: 'Dossier initial' } as T,
    sectionTitle: { en: 'Supplemental requests', fr: 'Demandes complémentaires' } as T,
    sectionHint: {
      en: 'Additional aligners, replacements, transfer trays and warranty claims linked to this case. The initial case stays unchanged.',
      fr: 'Aligneurs supplémentaires, remplacements, gouttières de transfert et demandes sous garantie liés à ce dossier. Le dossier initial reste inchangé.',
    } as T,
    noRequests: {
      en: 'No supplemental request yet.',
      fr: 'Aucune demande complémentaire pour l’instant.',
    } as T,

    type: {
      additional_aligners: { en: 'Additional aligners', fr: 'Aligneurs supplémentaires' } as T,
      replacement: { en: 'Aligner replacement', fr: 'Remplacement d’aligneurs' } as T,
      transfer_template: { en: 'Attachment transfer tray', fr: 'Gouttière de transfert des taquets' } as T,
      warranty: { en: 'Warranty claim', fr: 'Demande sous garantie' } as T,
    },
    typeDescription: {
      additional_aligners: {
        en: 'Refine or continue the treatment from a new clinical assessment.',
        fr: 'Affiner ou poursuivre le traitement à partir d’un nouveau bilan clinique.',
      } as T,
      replacement: {
        en: 'Remake aligners already handed over (lost, broken or deformed).',
        fr: 'Refaire des aligneurs déjà remis (perdus, cassés ou déformés).',
      } as T,
      transfer_template: {
        en: 'Order a tray to bond attachments again.',
        fr: 'Commander une gouttière pour reposer des taquets.',
      } as T,
      warranty: {
        en: 'Report a manufacturing defect, with photos.',
        fr: 'Signaler un défaut de fabrication, photos à l’appui.',
      } as T,
    },
    status: {
      draft: { en: 'Draft', fr: 'Brouillon' } as T,
      pending: { en: 'Under review', fr: 'En cours de validation' } as T,
      approved: { en: 'Approved', fr: 'Approuvée' } as T,
      rejected: { en: 'Declined', fr: 'Refusée' } as T,
    },
    coverage: {
      review_required: { en: 'Pending admin review', fr: 'À valider par l’administration' } as T,
      included: { en: 'Included in the pack', fr: 'Incluse dans le forfait' } as T,
      chargeable: { en: 'On quotation', fr: 'Sur devis' } as T,
      warranty_approved: { en: 'Warranty accepted · free', fr: 'Garantie acceptée · gratuite' } as T,
      warranty_rejected: { en: 'Warranty declined', fr: 'Garantie refusée' } as T,
      estimate: { en: 'Estimate: {coverage}', fr: 'Estimation : {coverage}' } as T,
      estimateHint: {
        en: 'The administration confirms the coverage when it reviews the request.',
        fr: 'L’administration confirme la prise en charge lors de la validation de la demande.',
      } as T,
      remaining: {
        en: 'Corrections still included in the pack: {count}',
        fr: 'Corrections encore incluses dans le forfait : {count}',
      } as T,
      unlimited: {
        en: 'The pack includes unlimited corrections.',
        fr: 'Le forfait inclut des corrections illimitées.',
      } as T,
      correctionNumber: { en: 'Correction no. {number}', fr: 'Correction n° {number}' } as T,
    },
    coverageReason: {
      within_pack_allowance: {
        en: 'This correction is within the number of corrections the pack includes.',
        fr: 'Cette correction entre dans le nombre de corrections prévu par le forfait.',
      } as T,
      included_corrections_exhausted: {
        en: 'The corrections included in the pack have all been used: a quotation will follow.',
        fr: 'Les corrections incluses dans le forfait ont toutes été utilisées : un devis sera établi.',
      } as T,
      coverage_expired: {
        en: 'The treatment period covered by the pack has ended: a quotation will follow.',
        fr: 'La durée de traitement couverte par le forfait est dépassée : un devis sera établi.',
      } as T,
      allowance_unknown: {
        en: 'The pack does not state how many corrections it includes: the administration will decide.',
        fr: 'Le forfait ne précise pas le nombre de corrections incluses : l’administration tranchera.',
      } as T,
      structured_validity_unknown: {
        en: 'The coverage period of this case is not known: the administration will decide.',
        fr: 'La période de couverture de ce dossier n’est pas connue : l’administration tranchera.',
      } as T,
      paid_pack_snapshot_missing: {
        en: 'No paid pack is recorded for this case: the administration will decide.',
        fr: 'Aucun forfait réglé n’est enregistré pour ce dossier : l’administration tranchera.',
      } as T,
      requires_quote: {
        en: 'This request is billed on a quotation.',
        fr: 'Cette demande est facturée sur devis.',
      } as T,
      warranty_review_required: {
        en: 'The administration examines the defect before deciding.',
        fr: 'L’administration examine le défaut avant de se prononcer.',
      } as T,
      warranty_rejected_doctor_confirmed: {
        en: 'Paid replacement requested by the practitioner after a declined warranty claim.',
        fr: 'Remplacement payant demandé par le praticien après le refus de la garantie.',
      } as T,
    },
    blockedReason: {
      approved_plan_required: {
        en: 'Available once the treatment plan or the quote has been approved.',
        fr: 'Disponible dès que le plan de traitement ou le devis a été approuvé.',
      } as T,
      parent_not_eligible: {
        en: 'Unavailable while the initial case is a draft, declined or cancelled.',
        fr: 'Indisponible tant que le dossier initial est en brouillon, refusé ou annulé.',
      } as T,
      active_request_exists: {
        en: 'A request of this type is already in progress.',
        fr: 'Une demande de ce type est déjà en cours.',
      } as T,
      not_allowed: {
        en: 'Only the case’s practitioner or an administrator can create this request.',
        fr: 'Seul le praticien du dossier ou un administrateur peut créer cette demande.',
      } as T,
    },
    availability: {
      loadError: {
        en: 'Availability could not be checked. Refresh the page.',
        fr: 'La disponibilité n’a pas pu être vérifiée. Actualisez la page.',
      } as T,
    },

    actions: {
      menuTitle: { en: 'Choose a request type', fr: 'Choisir le type de demande' } as T,
      start: { en: 'Start', fr: 'Commencer' } as T,
      resume: { en: 'Resume', fr: 'Reprendre' } as T,
      resumeDraft: { en: 'Resume draft {code}', fr: 'Reprendre le brouillon {code}' } as T,
      open: { en: 'Open', fr: 'Ouvrir' } as T,
      openReplacement: { en: 'Open the paid replacement', fr: 'Ouvrir le remplacement payant' } as T,
      delete: { en: 'Delete draft', fr: 'Supprimer le brouillon' } as T,
      saveDraft: { en: 'Save draft', fr: 'Enregistrer le brouillon' } as T,
      submit: { en: 'Send request', fr: 'Envoyer la demande' } as T,
      approve: { en: 'Approve', fr: 'Approuver' } as T,
      reject: { en: 'Decline', fr: 'Refuser' } as T,
      convert: { en: 'Order a paid replacement', fr: 'Commander un remplacement payant' } as T,
      retry: { en: 'Try again', fr: 'Réessayer' } as T,
      viewList: { en: 'Supplemental requests', fr: 'Demandes complémentaires' } as T,
    },
    save: {
      saving: { en: 'Saving…', fr: 'Enregistrement…' } as T,
      savedAt: { en: 'Saved at {time}', fr: 'Enregistré à {time}' } as T,
      pending: { en: 'Unsaved changes', fr: 'Modifications non enregistrées' } as T,
      upToDate: { en: 'All changes saved', fr: 'Toutes les modifications sont enregistrées' } as T,
      failed: { en: 'Not saved: {reason}', fr: 'Non enregistré : {reason}' } as T,
      retry: { en: 'Try again', fr: 'Réessayer' } as T,
    },
    wizard: {
      stepsAria: { en: 'Request steps', fr: 'Étapes de la demande' } as T,
      contextLabel: { en: 'Request context', fr: 'Contexte de la demande' } as T,
      required: { en: 'required', fr: 'obligatoire' } as T,
      unknownPatient: { en: 'Patient', fr: 'Patient' } as T,
      approvedPlan: {
        en: 'Plan v{version} · approved on {date}',
        fr: 'Plan v{version} · approuvé le {date}',
      } as T,
      noApprovedPlan: { en: 'No plan on file', fr: 'Plan non enregistré' } as T,
      confirm: {
        en: 'I confirm that the answers, photos and files of this request are accurate and complete.',
        fr: 'Je confirme que les réponses, photos et fichiers de cette demande sont exacts et complets.',
      } as T,
      startHint: {
        en: 'Your answers are saved as you go: you can stop and resume the draft at any time.',
        fr: 'Vos réponses sont enregistrées au fur et à mesure : vous pouvez interrompre puis reprendre le brouillon à tout moment.',
      } as T,
      invalidType: { en: 'This request type does not exist.', fr: 'Ce type de demande n’existe pas.' } as T,
      invalidRequest: {
        en: 'This request does not belong to this case.',
        fr: 'Cette demande n’appartient pas à ce dossier.',
      } as T,
      loadError: { en: 'The request could not be loaded.', fr: 'La demande n’a pas pu être chargée.' } as T,
      readOnlyTitle: {
        en: 'This request can no longer be edited',
        fr: 'Cette demande n’est plus modifiable',
      } as T,
      readOnlyBody: {
        en: 'Its status is “{status}”. Open it to follow its progress.',
        fr: 'Son statut est « {status} ». Ouvrez-la pour suivre son avancement.',
      } as T,
      refreshError: {
        en: 'The request could not be refreshed',
        fr: 'La demande n’a pas pu être actualisée',
      } as T,
      refreshErrorBody: {
        en: '{reason} Your answers stay on screen and can still be edited.',
        fr: '{reason} Vos réponses restent à l’écran et modifiables.',
      } as T,
    },

    steps: {
      situation: {
        title: { en: 'Situation', fr: 'Situation' } as T,
        heading: { en: 'The patient’s situation', fr: 'Situation du patient' } as T,
        description: {
          en: 'Why you are asking for new aligners and where the patient stands today.',
          fr: 'Pourquoi vous demandez de nouveaux aligneurs et où en est le patient aujourd’hui.',
        } as T,
      },
      arches: {
        title: { en: 'Arches & plan', fr: 'Arcades et plan' } as T,
        heading: { en: 'Arches and plan set-up', fr: 'Arcades et configuration du plan' } as T,
        description: {
          en: 'The arches to treat, the new records you send and how to build the new plan.',
          fr: 'Les arcades à traiter, les nouveaux enregistrements envoyés et la façon de construire le nouveau plan.',
        } as T,
      },
      movement: {
        title: { en: 'Movements', fr: 'Mouvements' } as T,
        heading: { en: 'Tooth movements', fr: 'Mouvements dentaires' } as T,
        description: {
          en: 'Teeth that must not move and the antero-posterior correction you expect.',
          fr: 'Les dents à ne pas déplacer et la correction antéro-postérieure attendue.',
        } as T,
      },
      attachments: {
        title: { en: 'Attachments & IPR', fr: 'Taquets et RIP' } as T,
        heading: { en: 'Attachments and interproximal reduction', fr: 'Taquets et réduction interproximale' } as T,
        description: {
          en: 'New and existing attachments, the IPR planned and the IPR already performed.',
          fr: 'Nouveaux taquets, taquets existants, RIP prévue et RIP déjà réalisée.',
        } as T,
      },
      finishing: {
        title: { en: 'Finishing', fr: 'Finitions' } as T,
        heading: { en: 'Finishing and instructions', fr: 'Finitions et consignes' } as T,
        description: {
          en: 'Cut-outs for elastics, residual spaces and your instructions per arch.',
          fr: 'Découpes pour élastiques, espaces résiduels et vos consignes par arcade.',
        } as T,
      },
      scans: {
        title: { en: 'Scans', fr: 'Scans' } as T,
        heading: { en: 'New records', fr: 'Nouveaux enregistrements' } as T,
        description: {
          en: 'Upload the intraoral scans, or tell us how the impressions will reach the lab.',
          fr: 'Téléversez les scans intra-oraux ou indiquez comment les empreintes parviendront au laboratoire.',
        } as T,
      },
      photos: {
        title: { en: 'Photos', fr: 'Photos' } as T,
        heading: { en: 'Patient photos', fr: 'Photos du patient' } as T,
        description: {
          en: 'Current intraoral photos show the lab where the teeth stand today.',
          fr: 'Des photos intra-orales actuelles montrent au laboratoire la position actuelle des dents.',
        } as T,
      },
      replacementDetails: {
        title: { en: 'Details', fr: 'Détails' } as T,
        heading: { en: 'Aligners to replace', fr: 'Aligneurs à remplacer' } as T,
        description: {
          en: 'Arch, aligner numbers, copies, reason and priority.',
          fr: 'Arcade, numéros d’aligneurs, nombre d’exemplaires, motif et priorité.',
        } as T,
      },
      optionalPhotos: {
        title: { en: 'Photos', fr: 'Photos' } as T,
        heading: { en: 'Photos (optional)', fr: 'Photos (facultatives)' } as T,
        description: {
          en: 'Add photos if they help the lab understand the request.',
          fr: 'Ajoutez des photos si elles aident le laboratoire à comprendre la demande.',
        } as T,
      },
      transferDetails: {
        title: { en: 'Details', fr: 'Détails' } as T,
        heading: { en: 'Transfer tray', fr: 'Gouttière de transfert' } as T,
        description: {
          en: 'Arch, purpose, number of trays and notes for the lab.',
          fr: 'Arcade, usage, nombre de gouttières et notes pour le laboratoire.',
        } as T,
      },
      transferTeeth: {
        title: { en: 'Teeth', fr: 'Dents' } as T,
        heading: { en: 'Teeth to fit', fr: 'Dents à équiper' } as T,
        description: {
          en: 'Select the teeth whose attachments the tray must carry.',
          fr: 'Sélectionnez les dents dont la gouttière doit porter les taquets.',
        } as T,
      },
      warrantyDetails: {
        title: { en: 'Details', fr: 'Détails' } as T,
        heading: { en: 'Defect report', fr: 'Signalement du défaut' } as T,
        description: {
          en: 'The defective aligner, the defect and when it was noticed.',
          fr: 'L’aligneur défectueux, la nature du défaut et la date à laquelle il a été constaté.',
        } as T,
      },
      evidencePhotos: {
        title: { en: 'Photos', fr: 'Photos' } as T,
        heading: { en: 'Photos of the defect', fr: 'Photos du défaut' } as T,
        description: {
          en: 'At least one photo is needed to examine the claim.',
          fr: 'Au moins une photo est nécessaire pour examiner la demande.',
        } as T,
      },
      review: {
        title: { en: 'Summary', fr: 'Récapitulatif' } as T,
        heading: { en: 'Summary', fr: 'Récapitulatif' } as T,
        description: {
          en: 'Check every answer before sending the request.',
          fr: 'Vérifiez chaque réponse avant d’envoyer la demande.',
        } as T,
      },
    },

    notices: {
      instructions: {
        title: { en: 'Before you start', fr: 'Consignes' } as T,
        keepAligner: {
          en: 'Keep the patient in the current aligner, or in the one that fits best, until the new aligners arrive.',
          fr: 'Laissez le patient dans l’aligneur actuel, ou dans celui qui s’adapte le mieux, jusqu’à la réception des nouveaux aligneurs.',
        } as T,
        removeAttachments: {
          en: 'Remove the existing attachments before taking new records: new or different attachments may be needed.',
          fr: 'Retirez les taquets existants avant la prise des nouveaux enregistrements : de nouveaux taquets, ou des taquets différents, peuvent être nécessaires.',
        } as T,
        sendRecords: {
          en: 'Send new photos (required) and, preferably, new scans of the arches to correct.',
          fr: 'Envoyez de nouvelles photos (obligatoires) et, de préférence, de nouveaux scans des arcades à corriger.',
        } as T,
      },
      important: {
        title: { en: 'Important information', fr: 'Information importante' } as T,
        singleArchOcclusion: {
          en: 'When only one arch is recorded, the occlusion is estimated from the initial records of the opposite arch.',
          fr: 'Si une seule arcade est enregistrée, l’occlusion est estimée à partir des enregistrements initiaux de l’arcade opposée.',
        } as T,
        newPlanApproval: {
          en: 'A new treatment plan will be submitted to you: aligners are only made once you approve it.',
          fr: 'Un nouveau plan de traitement vous sera soumis : les aligneurs ne sont fabriqués qu’après votre validation.',
        } as T,
      },
      practitionerResponsibility: {
        en: 'The practitioner remains solely responsible for taking and interpreting radiographs and other diagnostic records.',
        fr: 'Le praticien reste seul responsable de la réalisation et de l’interprétation des radiographies et des autres examens diagnostiques.',
      } as T,
      recentScan: {
        en: 'Make sure the scan is recent: it must show the current position of the teeth, or the aligners may not fit.',
        fr: 'Vérifiez que le scan est récent : il doit refléter la position actuelle des dents, faute de quoi les aligneurs risquent de mal s’adapter.',
      } as T,
      shipping: {
        title: { en: 'Sending physical impressions', fr: 'Envoi d’empreintes physiques' } as T,
        body: {
          en: 'Disinfect the impressions and send them to the lab with the request code {code} and the patient’s name ({patient}) written on the package.',
          fr: 'Désinfectez les empreintes et envoyez-les au laboratoire en indiquant sur le colis le code de la demande {code} et le nom du patient ({patient}).',
        } as T,
      },
    },

    questions: {
      reason: {
        legend: { en: 'Reason for the request', fr: 'Motif de la demande' } as T,
        details: { en: 'Please specify', fr: 'Précisez le motif' } as T,
      },
      currentAligner: {
        legend: {
          en: 'Which aligner is the patient wearing now?',
          fr: 'Quel aligneur le patient porte-t-il actuellement ?',
        } as T,
        upper: { en: 'Upper aligner no.', fr: 'Aligneur maxillaire n°' } as T,
        lower: { en: 'Lower aligner no.', fr: 'Aligneur mandibulaire n°' } as T,
        available: { en: '(available 1–{max})', fr: '(disponibles 1–{max})' } as T,
        untreated: {
          en: '— optional: arch not treated (question 3)',
          fr: '— facultatif : arcade non traitée (question 3)',
        } as T,
        packReference: {
          en: 'No plan on file: the pack allows up to {max} aligners per arch.',
          fr: 'Plan non enregistré : le forfait prévoit jusqu’à {max} aligneurs par arcade.',
        } as T,
        planReference: {
          en: 'Numbers from plan v{version}, approved on {date}.',
          fr: 'Numérotation du plan v{version}, approuvé le {date}.',
        } as T,
        delivered: {
          en: 'Aligners handed over so far: no. 1 to {max}.',
          fr: 'Aligneurs remis jusqu’ici : du n° 1 au n° {max}.',
        } as T,
      },
      archTreatment: {
        legend: { en: 'Arch(es) to treat', fr: 'Arcade(s) à traiter' } as T,
        opposite: { en: 'And on the opposite arch?', fr: 'Et sur l’arcade opposée ?' } as T,
      },
      newScans: {
        legend: {
          en: 'Are you sending new scans or impressions?',
          fr: 'Envoyez-vous de nouveaux scans ou empreintes ?',
        } as T,
        hint: {
          en: 'When both arches are treated, we recommend sending records of both.',
          fr: 'Si les deux arcades sont traitées, nous recommandons d’envoyer les enregistrements des deux.',
        } as T,
        upper: { en: 'New upper records', fr: 'Nouveaux enregistrements maxillaires' } as T,
        lower: { en: 'New lower records', fr: 'Nouveaux enregistrements mandibulaires' } as T,
      },
      clinicalObjective: {
        legend: { en: 'How should the new plan be set up?', fr: 'Comment configurer le nouveau plan ?' } as T,
      },
      movementRestriction: {
        legend: { en: 'Tooth movement restrictions', fr: 'Restrictions de mouvements dentaires' } as T,
        hint: {
          en: 'For example bridges, ankylosed teeth or implants.',
          fr: 'Par exemple : bridges, dents ankylosées, implants.',
        } as T,
      },
      apRelationship: {
        legend: { en: 'Antero-posterior (A-P) relationship', fr: 'Relation antéro-postérieure (A-P)' } as T,
        hint: { en: 'Choose the correction expected on each side.', fr: 'Choisissez la correction attendue de chaque côté.' } as T,
        right: { en: 'Right side', fr: 'Côté droit' } as T,
        left: { en: 'Left side', fr: 'Côté gauche' } as T,
        options: { en: 'Therapeutic options', fr: 'Options thérapeutiques' } as T,
        optionsHint: {
          en: 'If you tick several, give their order and amounts in the instructions (question 13).',
          fr: 'Si vous en cochez plusieurs, précisez leur ordre et leurs quantités dans les consignes (question 13).',
        } as T,
        elasticCutouts: {
          en: 'Cut-outs for elastics on these aligners?',
          fr: 'Des découpes pour élastiques sur ces aligneurs ?',
        } as T,
        elasticCutoutsHint: {
          en: 'Cut-outs can reduce the aligner’s strength and durability.',
          fr: 'Les découpes peuvent réduire la résistance et la durabilité de l’aligneur.',
        } as T,
      },
      attachmentPolicy: {
        legend: { en: 'New attachments', fr: 'Nouveaux taquets' } as T,
      },
      existingAttachmentPolicy: {
        legend: { en: 'Attachments already bonded', fr: 'Taquets existants' } as T,
        hint: { en: 'New attachments are bonded at stage 1.', fr: 'Les nouveaux taquets sont posés dès l’étape 1.' } as T,
      },
      ipr: {
        legend: { en: 'Interproximal reduction (IPR)', fr: 'Réduction interproximale (RIP)' } as T,
        plan: { en: 'IPR for the new plan', fr: 'RIP pour le nouveau plan' } as T,
        previous: { en: 'IPR performed during the previous plan', fr: 'RIP réalisée pendant le plan précédent' } as T,
      },
      precisionCutPolicy: {
        legend: { en: 'Cut-outs for elastics', fr: 'Découpes pour élastiques' } as T,
        hint: {
          en: 'Notches or windows cut in the aligner to hold elastics or buttons.',
          fr: 'Encoches ou fenêtres découpées dans l’aligneur pour accrocher élastiques ou boutons.',
        } as T,
      },
      residualSpacePolicy: {
        legend: { en: 'Residual spaces', fr: 'Espaces résiduels' } as T,
      },
      instructions: {
        legend: { en: 'Treatment instructions', fr: 'Consignes de traitement' } as T,
        hint: {
          en: 'Anything the lab should know, arch by arch.',
          fr: 'Tout ce que le laboratoire doit savoir, arcade par arcade.',
        } as T,
        requiredHint: {
          en: 'Your answers to questions 1, 5 or 7 call for details: describe them here.',
          fr: 'Vos réponses aux questions 1, 5 ou 7 demandent des précisions : décrivez-les ici.',
        } as T,
        upper: { en: 'Upper arch', fr: 'Maxillaire' } as T,
        lower: { en: 'Lower arch', fr: 'Mandibulaire' } as T,
      },
      impressionMethod: {
        legend: {
          en: 'How are you sending the new records?',
          fr: 'Comment transmettez-vous les nouveaux enregistrements ?',
        } as T,
        scanCount: {
          en: 'Scan files uploaded: {uploaded} of {expected} expected (question 4).',
          fr: 'Fichiers de scan téléversés : {uploaded} sur {expected} attendu(s) (question 4).',
        } as T,
      },
      photos: {
        legend: { en: 'Request photos', fr: 'Photos de la demande' } as T,
        intraoralHint: {
          en: 'The five intraoral views are required: right, front, left, upper occlusal and lower occlusal.',
          fr: 'Les cinq vues intra-orales sont obligatoires : latérale droite, de face, latérale gauche, occlusale maxillaire et occlusale mandibulaire.',
        } as T,
        optionalHint: {
          en: 'Optional: add photos if they help explain the request.',
          fr: 'Facultatif : ajoutez des photos si elles éclairent la demande.',
        } as T,
        evidenceHint: {
          en: 'Photograph the defective aligner (front and side) and, if possible, its pouch and lot label. Every slot below accepts these photos.',
          fr: 'Photographiez l’aligneur défectueux (de face et de profil) et, si possible, son sachet et l’étiquette du lot. Tous les emplacements ci-dessous acceptent ces photos.',
        } as T,
        missing: { en: 'Photos still missing', fr: 'Photos manquantes' } as T,
      },
      replacement: {
        arch: { en: 'Arch(es) concerned', fr: 'Arcade(s) concernée(s)' } as T,
        range: { en: 'Aligners to replace', fr: 'Aligneurs à remplacer' } as T,
        rangeHint: {
          en: 'Give the first and last numbers of the series to remake.',
          fr: 'Indiquez le premier et le dernier numéro de la série à refaire.',
        } as T,
        from: { en: 'From aligner no.', fr: 'Du n°' } as T,
        to: { en: 'To aligner no.', fr: 'Au n°' } as T,
        quantity: { en: 'Copies', fr: 'Nombre d’exemplaires' } as T,
        quantityLabel: { en: 'Copies of each aligner', fr: 'Exemplaires de chaque aligneur' } as T,
        quantityHint: {
          en: 'From {min} to {max} copies of each aligner in the series.',
          fr: 'De {min} à {max} exemplaires de chaque aligneur de la série.',
        } as T,
        reason: { en: 'Reason for the replacement', fr: 'Motif du remplacement' } as T,
        urgency: { en: 'Priority', fr: 'Priorité' } as T,
      },
      transfer: {
        sourcePlan: { en: 'Source plan', fr: 'Plan de référence' } as T,
        sourcePlanMissing: {
          en: 'No plan on file for this case: the lab builds the tray from the case records.',
          fr: 'Aucun plan enregistré pour ce dossier : le laboratoire réalise la gouttière à partir des fichiers du dossier.',
        } as T,
        sourcePlanValue: {
          en: 'Attachments as placed in plan v{version}, approved on {date}.',
          fr: 'Taquets tels que placés dans le plan v{version}, approuvé le {date}.',
        } as T,
        arch: { en: 'Arch(es) concerned', fr: 'Arcade(s) concernée(s)' } as T,
        purpose: { en: 'What is the tray for?', fr: 'À quoi sert la gouttière ?' } as T,
        quantity: { en: 'Number of trays', fr: 'Nombre de gouttières' } as T,
        quantityLabel: { en: 'Trays', fr: 'Gouttières' } as T,
        quantityHint: { en: 'From {min} to {max} trays.', fr: 'De {min} à {max} gouttières.' } as T,
        notes: { en: 'Notes for the lab', fr: 'Notes pour le laboratoire' } as T,
        notesLabel: { en: 'Notes (optional)', fr: 'Notes (facultatif)' } as T,
        notesRequiredLabel: { en: 'Describe what the tray is for', fr: 'Décrivez l’usage de la gouttière' } as T,
        teeth: { en: 'Teeth to fit', fr: 'Dents à équiper' } as T,
        teethHint: {
          en: 'Tap each tooth whose attachment must be bonded again.',
          fr: 'Touchez chaque dent dont le taquet doit être reposé.',
        } as T,
      },
      warranty: {
        arch: { en: 'Arch of the defective aligner', fr: 'Arcade de l’aligneur défectueux' } as T,
        aligner: { en: 'Defective aligner', fr: 'Aligneur défectueux' } as T,
        alignerLabel: { en: 'Aligner no.', fr: 'Aligneur n°' } as T,
        defect: { en: 'Type of defect', fr: 'Nature du défaut' } as T,
        discoveredAt: { en: 'When was the defect noticed?', fr: 'Quand le défaut a-t-il été constaté ?' } as T,
        discoveredAtLabel: { en: 'Date noticed', fr: 'Date de constatation' } as T,
        description: { en: 'Description', fr: 'Description du défaut' } as T,
        commentsLabel: {
          en: 'What did you or the patient observe?',
          fr: 'Qu’avez-vous constaté, vous ou le patient ?',
        } as T,
        lotLabel: { en: 'Lot number or reference (optional)', fr: 'Numéro de lot ou référence (facultatif)' } as T,
      },
    },

    options: {
      reason: {
        finishing: { en: 'Finishing improvements needed', fr: 'Améliorations de finition nécessaires' } as T,
        tracking_problem: {
          en: 'Teeth are not following the treatment plan',
          fr: 'Les dents ne suivent pas le plan de traitement',
        } as T,
        treatment_plan_change: {
          en: 'Change of treatment plan (specify in the instructions)',
          fr: 'Changement de plan de traitement (à préciser dans les consignes)',
        } as T,
        dental_restoration: {
          en: 'The patient had dental care or restorations',
          fr: 'Le patient a reçu des soins ou des restaurations dentaires',
        } as T,
        non_compliance: { en: 'The patient is not compliant', fr: 'Le patient n’est pas observant' } as T,
        other: { en: 'Other', fr: 'Autre' } as T,
      },
      archTreatment: {
        both: { en: 'Both arches', fr: 'Les deux arcades' } as T,
        upper: { en: 'Upper', fr: 'Maxillaire' } as T,
        lower: { en: 'Lower', fr: 'Mandibulaire' } as T,
      },
      oppositeArch: {
        nothing: { en: 'Nothing on the opposite arch', fr: 'Rien sur l’arcade opposée' } as T,
        passive: { en: 'Passive aligners on the opposite arch', fr: 'Aligneurs passifs sur l’arcade opposée' } as T,
      },
      yesNo: {
        yes: { en: 'Yes', fr: 'Oui' } as T,
        no: { en: 'No', fr: 'Non' } as T,
      },
      clinicalObjective: {
        adjust_current_position: {
          en: 'Finish from the current tooth position',
          fr: 'Finitions à partir de la position actuelle des dents',
        } as T,
        preserve_previous_goal: {
          en: 'Reach the final position of the last approved plan',
          fr: 'Atteindre la position finale du dernier plan approuvé',
        } as T,
        new_goal: { en: 'Other (specify in the instructions)', fr: 'Autre (à préciser dans les consignes)' } as T,
      },
      movementRestriction: {
        none: { en: 'None (all teeth may move)', fr: 'Aucune (toutes les dents peuvent bouger)' } as T,
        selected_teeth: { en: 'Do not move these teeth', fr: 'Ne pas déplacer ces dents' } as T,
      },
      apCorrection: {
        maintain: { en: 'Keep the current relationship', fr: 'Conserver la relation actuelle' } as T,
        improve_canine: { en: 'Improve the canine relationship only', fr: 'Améliorer la relation canine uniquement' } as T,
        improve_canine_molar: {
          en: 'Improve canine and molar (specify in the instructions)',
          fr: 'Améliorer canine et molaire (à préciser dans les consignes)',
        } as T,
        class_one: { en: 'Class I correction (canine and molar)', fr: 'Correction en classe I (canine et molaire)' } as T,
      },
      apOption: {
        posterior_ipr: { en: 'Posterior IPR', fr: 'RIP postérieure' } as T,
        elastics_simulation: {
          en: 'Class II/III correction with elastics',
          fr: 'Correction de classe II/III avec élastiques',
        } as T,
        sequential_distalization: { en: 'Sequential distalization', fr: 'Distalisation séquentielle' } as T,
        mandibular_advancement: { en: 'Mandibular advancement', fr: 'Avancée mandibulaire' } as T,
        orthognathic_surgery: {
          en: 'Orthognathic surgery simulation',
          fr: 'Simulation de chirurgie orthognathique',
        } as T,
      },
      attachmentPlan: {
        as_needed: { en: 'Place attachments where needed', fr: 'Placer des taquets si nécessaire' } as T,
        avoid_selected_teeth: { en: 'No attachments on these teeth', fr: 'Pas de taquets sur ces dents' } as T,
      },
      existingAttachments: {
        remove_all: {
          en: 'Virtually remove all existing attachments, then place new ones as needed (recommended)',
          fr: 'Retirer virtuellement tous les taquets existants, puis placer de nouveaux taquets selon les besoins (recommandé)',
        } as T,
        remove_selected: {
          en: 'Virtually remove only the selected attachments',
          fr: 'Retirer virtuellement uniquement les taquets sélectionnés',
        } as T,
        keep_conventional: {
          en: 'Keep only the conventional attachments',
          fr: 'Conserver uniquement les taquets conventionnels',
        } as T,
        keep_all: { en: 'Keep all existing attachments', fr: 'Conserver tous les taquets existants' } as T,
      },
      iprPlan: {
        as_needed: { en: 'Perform IPR as needed', fr: 'Réaliser la RIP selon les besoins' } as T,
        none: { en: 'No IPR', fr: 'Pas de RIP' } as T,
        avoid_selected_teeth: { en: 'No IPR on these teeth', fr: 'Pas de RIP sur ces dents' } as T,
      },
      previousIpr: {
        as_prescribed: { en: 'Performed as prescribed', fr: 'Réalisée comme prescrit' } as T,
        none: { en: 'No IPR was performed', fr: 'Aucune RIP n’a été réalisée' } as T,
        different: {
          en: 'Performed differently (enter the contacts)',
          fr: 'Réalisée autrement (indiquez les contacts)',
        } as T,
      },
      cutoutPlan: {
        none: { en: 'None', fr: 'Aucune' } as T,
        same_as_previous: { en: 'Same placement as the previous plan', fr: 'Même emplacement que dans le plan précédent' } as T,
        selected_teeth: { en: 'On these teeth', fr: 'Sur ces dents' } as T,
      },
      residualSpaces: {
        none: { en: 'None', fr: 'Aucun' } as T,
        close_specified: {
          en: 'Close these spaces (enter the amount)',
          fr: 'Fermer ces espaces (indiquez la quantité)',
        } as T,
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
        attachment_placement: { en: 'Bond attachments', fr: 'Pose de taquets' } as T,
        auxiliary_placement: { en: 'Bond auxiliaries', fr: 'Pose d’auxiliaires' } as T,
        attachment_and_auxiliary: { en: 'Attachments and auxiliaries', fr: 'Taquets et auxiliaires' } as T,
        other: { en: 'Other', fr: 'Autre' } as T,
      },
      defect: {
        fit: { en: 'Poor fit', fr: 'Mauvaise adaptation' } as T,
        crack: { en: 'Crack or break', fr: 'Fissure ou casse' } as T,
        deformation: { en: 'Deformation', fr: 'Déformation' } as T,
        trim: { en: 'Trim or edge defect', fr: 'Défaut de découpe ou de bord' } as T,
        material: { en: 'Material defect', fr: 'Défaut de matière' } as T,
        labeling: { en: 'Labelling error', fr: 'Erreur d’étiquetage' } as T,
        other: { en: 'Other', fr: 'Autre' } as T,
      },
      coverage: {
        included: { en: 'Included in the pack', fr: 'Incluse dans le forfait' } as T,
        chargeable: { en: 'On quotation', fr: 'Sur devis' } as T,
        warranty_approved: { en: 'Accept the warranty (free)', fr: 'Accepter la garantie (gratuit)' } as T,
      },
    },
    optionHints: {
      archTreatment: {
        both: { en: 'Upper and lower aligners.', fr: 'Aligneurs maxillaires et mandibulaires.' } as T,
        upper: { en: 'Upper aligners only.', fr: 'Aligneurs maxillaires uniquement.' } as T,
        lower: { en: 'Lower aligners only.', fr: 'Aligneurs mandibulaires uniquement.' } as T,
      },
      clinicalObjective: {
        adjust_current_position: {
          en: 'Finishing adjustments only; the A-P relationship is kept.',
          fr: 'Ajustements de finition uniquement ; la relation A-P est conservée.',
        } as T,
        preserve_previous_goal: {
          en: 'Continue towards the same final position as before.',
          fr: 'Poursuivre vers la même position finale que précédemment.',
        } as T,
        new_goal: {
          en: 'Describe the new objective in the instructions (question 13).',
          fr: 'Décrivez le nouvel objectif dans les consignes (question 13).',
        } as T,
      },
      apOption: {
        posterior_ipr: {
          en: 'Gain space by IPR in the posterior segments.',
          fr: 'Gagner de l’espace par RIP dans les secteurs postérieurs.',
        } as T,
        elastics_simulation: {
          en: 'The plan simulates the effect of class II or III elastics.',
          fr: 'Le plan simule l’effet d’élastiques de classe II ou III.',
        } as T,
        sequential_distalization: {
          en: 'Molars, then premolars, are moved back one after another.',
          fr: 'Les molaires puis les prémolaires sont reculées l’une après l’autre.',
        } as T,
        mandibular_advancement: {
          en: 'For growing patients; the lab confirms feasibility when planning.',
          fr: 'Pour les patients en croissance ; le laboratoire confirme la faisabilité lors de la planification.',
        } as T,
        orthognathic_surgery: {
          en: 'The plan prepares the arches for surgery. Give any extractions in the instructions.',
          fr: 'Le plan prépare les arcades en vue de la chirurgie. Précisez les extractions éventuelles dans les consignes.',
        } as T,
      },
      existingAttachments: {
        remove_all: {
          en: 'The lab plans every attachment again.',
          fr: 'Le laboratoire replanifie tous les taquets.',
        } as T,
        remove_selected: {
          en: 'Mark the attachments to remove on the chart.',
          fr: 'Indiquez sur le schéma les taquets à retirer.',
        } as T,
        keep_conventional: {
          en: 'Rectangular or bevelled attachments stay; the others are planned again.',
          fr: 'Les taquets rectangulaires ou biseautés restent ; les autres sont replanifiés.',
        } as T,
        keep_all: {
          en: 'Tooth movements may be less efficient.',
          fr: 'L’efficacité des mouvements dentaires peut être réduite.',
        } as T,
      },
      impressionMethod: {
        intraoral_scan: {
          en: 'Upload STL, PLY or OBJ files on this page.',
          fr: 'Téléversez sur cette page des fichiers STL, PLY ou OBJ.',
        } as T,
        physical_impression: {
          en: 'Send the impressions to the lab by post or courier.',
          fr: 'Envoyez les empreintes au laboratoire par la poste ou par coursier.',
        } as T,
      },
      urgency: {
        standard: { en: 'Usual lab turnaround.', fr: 'Délai habituel du laboratoire.' } as T,
        urgent: { en: 'Handled first by the lab.', fr: 'Traitée en priorité par le laboratoire.' } as T,
      },
    },

    purpose: {
      tooth: {
        do_not_move: { en: 'Do not move', fr: 'Ne pas déplacer' } as T,
        no_attachment: { en: 'No attachment', fr: 'Sans taquet' } as T,
        remove_attachment: { en: 'Attachment to remove', fr: 'Taquet à retirer' } as T,
        no_ipr: { en: 'No IPR', fr: 'Sans RIP' } as T,
        cutout: { en: 'Cut-out', fr: 'Découpe' } as T,
        transfer_tray: { en: 'Attachment to bond', fr: 'Taquet à reposer' } as T,
      },
      contact: {
        performed_ipr: { en: 'IPR performed', fr: 'RIP réalisée' } as T,
        residual_space: { en: 'Residual space', fr: 'Espace résiduel' } as T,
      },
    },
    pickers: {
      teethHint: {
        en: 'Tap a tooth to select it, tap it again to remove it.',
        fr: 'Touchez une dent pour la sélectionner, touchez-la à nouveau pour la retirer.',
      } as T,
      contactsHint: {
        en: 'Tap between two teeth to enter an amount from {min} to {max} mm.',
        fr: 'Touchez entre deux dents pour saisir une valeur de {min} à {max} mm.',
      } as T,
      selectedTeeth: { en: 'Selected teeth: {teeth}', fr: 'Dents sélectionnées : {teeth}' } as T,
      noTeeth: { en: 'No tooth selected yet.', fr: 'Aucune dent sélectionnée.' } as T,
      noContacts: { en: 'No contact entered yet.', fr: 'Aucun contact renseigné.' } as T,
      contactRange: {
        en: 'Enter a value from {min} to {max} mm (two decimals at most).',
        fr: 'Saisissez une valeur de {min} à {max} mm (deux décimales au plus).',
      } as T,
      archFirst: {
        en: 'Choose the arch(es) concerned first: only the teeth of a treated arch can be selected.',
        fr: 'Choisissez d’abord l’arcade concernée : seules les dents d’une arcade traitée peuvent être sélectionnées.',
      } as T,
      contactUnit: {
        performed_ipr: { en: 'IPR (mm)', fr: 'RIP (mm)' } as T,
        residual_space: { en: 'Space (mm)', fr: 'Espace (mm)' } as T,
      },
    },

    summary: {
      withDetails: { en: '{label}: {details}', fr: '{label} : {details}' } as T,
      alignerNumber: { en: 'No. {number}', fr: 'N° {number}' } as T,
      alignerRange: { en: 'No. {from} to {to}', fr: 'Du n° {from} au n° {to}' } as T,
      planVersion: { en: 'Plan v{version}', fr: 'Plan v{version}' } as T,
      none: { en: 'None', fr: 'Aucune' } as T,
      teeth: { en: 'Teeth', fr: 'Dents' } as T,
      scanFiles: { en: 'Scan files', fr: 'Fichiers de scan' } as T,
      labels: {
        reason: { en: 'Reason', fr: 'Motif' } as T,
        currentUpper: { en: 'Upper aligner worn', fr: 'Aligneur maxillaire porté' } as T,
        currentLower: { en: 'Lower aligner worn', fr: 'Aligneur mandibulaire porté' } as T,
        arch: { en: 'Arch(es)', fr: 'Arcade(s)' } as T,
        oppositeArch: { en: 'Opposite arch', fr: 'Arcade opposée' } as T,
        newUpperScan: { en: 'New upper records', fr: 'Nouveaux enregistrements maxillaires' } as T,
        newLowerScan: { en: 'New lower records', fr: 'Nouveaux enregistrements mandibulaires' } as T,
        clinicalObjective: { en: 'Plan set-up', fr: 'Configuration du plan' } as T,
        movementRestriction: { en: 'Movement restrictions', fr: 'Restrictions de mouvements' } as T,
        apRight: { en: 'A-P relationship, right', fr: 'Relation A-P, côté droit' } as T,
        apLeft: { en: 'A-P relationship, left', fr: 'Relation A-P, côté gauche' } as T,
        apOptions: { en: 'Therapeutic options', fr: 'Options thérapeutiques' } as T,
        elasticCutouts: { en: 'Cut-outs for elastics', fr: 'Découpes pour élastiques' } as T,
        attachmentPolicy: { en: 'New attachments', fr: 'Nouveaux taquets' } as T,
        existingAttachmentPolicy: { en: 'Existing attachments', fr: 'Taquets existants' } as T,
        iprPolicy: { en: 'IPR for the new plan', fr: 'RIP du nouveau plan' } as T,
        previousIpr: { en: 'IPR of the previous plan', fr: 'RIP du plan précédent' } as T,
        precisionCutPolicy: { en: 'Cut-outs', fr: 'Découpes' } as T,
        residualSpacePolicy: { en: 'Residual spaces', fr: 'Espaces résiduels' } as T,
        upperInstructions: { en: 'Upper instructions', fr: 'Consignes maxillaires' } as T,
        lowerInstructions: { en: 'Lower instructions', fr: 'Consignes mandibulaires' } as T,
        impressionMethod: { en: 'Records', fr: 'Enregistrements' } as T,
        alignerRange: { en: 'Aligners', fr: 'Aligneurs' } as T,
        quantity: { en: 'Quantity', fr: 'Quantité' } as T,
        urgency: { en: 'Priority', fr: 'Priorité' } as T,
        replacementReason: { en: 'Reason', fr: 'Motif' } as T,
        sourcePlan: { en: 'Source plan', fr: 'Plan de référence' } as T,
        transferPurpose: { en: 'Purpose', fr: 'Usage' } as T,
        transferTeeth: { en: 'Teeth to fit', fr: 'Dents à équiper' } as T,
        transferNotes: { en: 'Notes for the lab', fr: 'Notes pour le laboratoire' } as T,
        defectiveAligner: { en: 'Defective aligner', fr: 'Aligneur défectueux' } as T,
        defect: { en: 'Defect', fr: 'Défaut' } as T,
        discoveredAt: { en: 'Noticed on', fr: 'Constaté le' } as T,
        lotReference: { en: 'Lot or reference', fr: 'Lot ou référence' } as T,
        comments: { en: 'Description', fr: 'Description' } as T,
      },
    },

    validation: {
      required: { en: 'Please answer this question.', fr: 'Répondez à cette question.' } as T,
      details: { en: 'Please give details.', fr: 'Apportez une précision.' } as T,
      alignerNumber: { en: 'Enter a valid aligner number.', fr: 'Saisissez un numéro d’aligneur valide.' } as T,
      alignerAbovePlan: {
        en: 'The approved plan does not have that many aligners.',
        fr: 'Le plan approuvé ne compte pas autant d’aligneurs.',
      } as T,
      alignerNotDelivered: {
        en: 'This aligner has not been handed over yet.',
        fr: 'Cet aligneur n’a pas encore été remis.',
      } as T,
      currentAlignerMissing: {
        en: 'A treated arch has no aligner worn: enter its number at step 1 (question 2).',
        fr: 'Une arcade traitée n’a pas d’aligneur porté : indiquez son numéro à l’étape 1 (question 2).',
      } as T,
      rangeOrder: {
        en: 'The last aligner cannot come before the first.',
        fr: 'Le dernier aligneur ne peut pas précéder le premier.',
      } as T,
      quantity: {
        en: 'This quantity is outside the allowed range.',
        fr: 'Cette quantité sort des limites autorisées.',
      } as T,
      teeth: { en: 'Select at least one tooth on the chart.', fr: 'Sélectionnez au moins une dent sur le schéma.' } as T,
      contacts: { en: 'Enter at least one contact on the chart.', fr: 'Renseignez au moins un contact sur le schéma.' } as T,
      contactAmount: {
        en: 'A contact amount is outside the allowed range.',
        fr: 'Une valeur de contact sort des limites autorisées.',
      } as T,
      instructions: {
        en: 'Your answers to questions 1, 5 or 7 need instructions here.',
        fr: 'Vos réponses aux questions 1, 5 ou 7 demandent des consignes ici.',
      } as T,
      scanFiles: {
        en: 'Upload one scan file per arch announced in question 4.',
        fr: 'Téléversez un fichier de scan par arcade annoncée à la question 4.',
      } as T,
      photos: {
        en: 'The five intraoral photos are required.',
        fr: 'Les cinq photos intra-orales sont obligatoires.',
      } as T,
      evidencePhotos: {
        en: 'Add at least one photo of the defect.',
        fr: 'Ajoutez au moins une photo du défaut.',
      } as T,
      dateFuture: { en: 'The date cannot be in the future.', fr: 'La date ne peut pas être dans le futur.' } as T,
      dateBeforeCase: {
        en: 'The date is before the case was opened.',
        fr: 'La date précède l’ouverture du dossier.',
      } as T,
    },

    panel: {
      submittedOn: { en: 'Sent on {date}', fr: 'Envoyée le {date}' } as T,
      createdOn: { en: 'Created on {date}', fr: 'Créée le {date}' } as T,
      loadError: {
        en: 'The requests could not be loaded.',
        fr: 'Les demandes n’ont pas pu être chargées.',
      } as T,
    },
    card: {
      reviewedOn: { en: 'Decided on {date} by {name}', fr: 'Décision du {date} par {name}' } as T,
      decisionReason: { en: 'Reason given:', fr: 'Motif de la décision :' } as T,
      loadError: {
        en: 'The request summary and its actions could not be loaded.',
        fr: 'Le récapitulatif de la demande et ses actions n’ont pas pu être chargés.',
      } as T,
    },
    review: {
      approveTitle: { en: 'Approve the request', fr: 'Approuver la demande' } as T,
      approveDescription: {
        en: 'Request {code}: choose the coverage that applies.',
        fr: 'Demande {code} : choisissez la prise en charge applicable.',
      } as T,
      rejectTitle: { en: 'Decline the request', fr: 'Refuser la demande' } as T,
      rejectDescription: {
        en: 'Request {code}: the practitioner will see the reason you give.',
        fr: 'Demande {code} : le praticien verra le motif indiqué.',
      } as T,
      coverageLegend: { en: 'Coverage', fr: 'Prise en charge' } as T,
      reasonOptional: {
        en: 'Comment for the practitioner (optional)',
        fr: 'Commentaire pour le praticien (facultatif)',
      } as T,
      reasonRequired: { en: 'Reason for declining (required)', fr: 'Motif du refus (obligatoire)' } as T,
    },
    convert: {
      title: { en: 'Order a paid replacement?', fr: 'Commander un remplacement payant ?' } as T,
      rejectionReason: {
        en: 'The warranty was declined: {reason}',
        fr: 'La garantie a été refusée : {reason}',
      } as T,
      charge: {
        en: 'A replacement request will be created for this aligner. It is not covered: it will be billed on a quotation once approved.',
        fr: 'Une demande de remplacement sera créée pour cet aligneur. Elle n’est pas couverte : elle sera facturée sur devis après validation.',
      } as T,
      confirm: { en: 'Create the paid replacement', fr: 'Créer le remplacement payant' } as T,
    },
    deleteDialog: {
      title: { en: 'Delete this draft?', fr: 'Supprimer ce brouillon ?' } as T,
      description: {
        en: 'Draft {code} and its files will be removed from the case.',
        fr: 'Le brouillon {code} et ses fichiers seront retirés du dossier.',
      } as T,
    },
    toasts: {
      submitted: { en: 'Request sent for review.', fr: 'Demande envoyée pour validation.' } as T,
      reviewed: { en: 'Decision saved.', fr: 'Décision enregistrée.' } as T,
      converted: {
        en: 'Paid replacement draft created: complete it, then send it.',
        fr: 'Brouillon de remplacement payant créé : complétez-le puis envoyez-le.',
      } as T,
      deleted: { en: 'Draft deleted.', fr: 'Brouillon supprimé.' } as T,
    },

    /** Server error codes (messages stay English server side). */
    errors: {
      SUPPLEMENTAL_IDEMPOTENCY_KEY_REQUIRED: {
        en: 'The request could not be identified. Try again.',
        fr: 'La demande n’a pas pu être identifiée. Réessayez.',
      } as T,
      SUPPLEMENTAL_IDEMPOTENCY_KEY_REUSED: {
        en: 'This creation was already used for another request. Reload the page, then try again.',
        fr: 'Cette création a déjà servi pour une autre demande. Rechargez la page puis réessayez.',
      } as T,
      SUPPLEMENTAL_PARENT_NOT_INITIAL: {
        en: 'A request can only be created from an initial case.',
        fr: 'Une demande ne peut être créée qu’à partir d’un dossier initial.',
      } as T,
      SUPPLEMENTAL_NOT_ALLOWED: {
        en: 'This request is not available for this case right now.',
        fr: 'Cette demande n’est pas disponible pour ce dossier actuellement.',
      } as T,
      SUPPLEMENTAL_ACTIVE_REQUEST_EXISTS: {
        en: 'A request of this type is already in progress for this case.',
        fr: 'Une demande de ce type est déjà en cours pour ce dossier.',
      } as T,
      SUPPLEMENTAL_NOT_DRAFT: {
        en: 'This request has already been sent and can no longer be edited.',
        fr: 'Cette demande a déjà été envoyée et n’est plus modifiable.',
      } as T,
      SUPPLEMENTAL_NOT_PENDING: {
        en: 'This request is no longer awaiting a decision.',
        fr: 'Cette demande n’est plus en attente de décision.',
      } as T,
      SUPPLEMENTAL_FORBIDDEN: {
        en: 'You are not allowed to do this on this request.',
        fr: 'Vous n’êtes pas autorisé à effectuer cette action sur cette demande.',
      } as T,
      SUPPLEMENTAL_INCOMPLETE: {
        en: 'Some answers are missing or invalid. Check each step, then send again.',
        fr: 'Certaines réponses manquent ou sont invalides. Vérifiez chaque étape puis renvoyez la demande.',
      } as T,
      SUPPLEMENTAL_INVALID_DRAFT: {
        en: 'Some answers could not be saved because they are invalid.',
        fr: 'Certaines réponses n’ont pas pu être enregistrées car elles sont invalides.',
      } as T,
      SUPPLEMENTAL_COVERAGE_NOT_ALLOWED: {
        en: 'This coverage is not possible for this request type.',
        fr: 'Cette prise en charge n’est pas possible pour ce type de demande.',
      } as T,
      SUPPLEMENTAL_REJECTION_REASON_REQUIRED: {
        en: 'Give a reason for declining.',
        fr: 'Indiquez le motif du refus.',
      } as T,
      SUPPLEMENTAL_ALLOWANCE_EXHAUSTED: {
        en: 'The corrections included in the pack are used up: choose “On quotation”.',
        fr: 'Les corrections incluses dans le forfait sont épuisées : choisissez « Sur devis ».',
      } as T,
      SUPPLEMENTAL_CONVERSION_NOT_ALLOWED: {
        en: 'Only a declined warranty claim can become a paid replacement.',
        fr: 'Seule une demande sous garantie refusée peut devenir un remplacement payant.',
      } as T,
      SUPPLEMENTAL_DEDICATED_FLOW: {
        en: 'Supplemental requests are handled from their own form.',
        fr: 'Les demandes complémentaires se gèrent depuis leur propre formulaire.',
      } as T,
      SUPPLEMENTAL_ACTIVE_CHILDREN: {
        en: 'This case still has supplemental requests in progress.',
        fr: 'Ce dossier a encore des demandes complémentaires en cours.',
      } as T,
      TREATMENT_FEE_INITIAL_ONLY: {
        en: 'The treatment fee only applies to the initial case.',
        fr: 'Les honoraires de traitement ne concernent que le dossier initial.',
      } as T,
      SUPPLEMENTAL_NOT_QUOTABLE: {
        en: 'Only a request approved as “On quotation” can be quoted.',
        fr: 'Seule une demande validée « Sur devis » peut faire l’objet d’un devis.',
      } as T,
      SUPPLEMENTAL_PLAN_NOT_AVAILABLE: {
        en: 'This request type has no treatment plan of its own: it uses the case’s plan.',
        fr: 'Ce type de demande n’a pas de plan de traitement propre : il reprend le plan du dossier.',
      } as T,
      SUPPLEMENTAL_PLAN_REQUIRES_APPROVAL: {
        en: 'A treatment plan can be created once the request is approved.',
        fr: 'Un plan de traitement peut être créé une fois la demande approuvée.',
      } as T,
      /** A refused value without an error code (draft save). */
      invalidInput: {
        en: 'A value was refused: check your answers, then try again (detail: {detail}).',
        fr: 'Une valeur saisie est refusée : vérifiez vos réponses puis réessayez (détail : {detail}).',
      } as T,
    },
  },
} as const;

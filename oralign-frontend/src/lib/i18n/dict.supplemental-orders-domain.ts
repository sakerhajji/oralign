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
        en: 'Order a new series of aligners based on where the teeth are today.',
        fr: 'Commander une nouvelle série d’aligneurs à partir de la position actuelle des dents.',
      } as T,
      replacement: {
        en: 'Get a new copy of aligners that were lost, broken or deformed.',
        fr: 'Obtenir un nouvel exemplaire d’aligneurs perdus, cassés ou déformés.',
      } as T,
      transfer_template: {
        en: 'Order a tray used to put attachments back on the teeth.',
        fr: 'Commander une gouttière pour replacer les taquets sur les dents.',
      } as T,
      warranty: {
        en: 'Report aligners with a manufacturing defect and send photos of them.',
        fr: 'Signaler des aligneurs présentant un défaut de fabrication et en joindre des photos.',
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
        en: 'I have checked this request: everything it contains is correct and complete.',
        fr: 'J’ai vérifié cette demande : son contenu est correct et complet.',
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
        heading: { en: 'Where the treatment stands', fr: 'Où en est le traitement' } as T,
        description: {
          en: 'Tell us why a new series is needed and which aligners the patient is wearing now.',
          fr: 'Indiquez pourquoi une nouvelle série est nécessaire et quels aligneurs le patient porte aujourd’hui.',
        } as T,
      },
      arches: {
        title: { en: 'Arches & plan', fr: 'Arcades et plan' } as T,
        heading: { en: 'Arches and goal of the new plan', fr: 'Arcades et objectif du nouveau plan' } as T,
        description: {
          en: 'Choose what to treat, say whether you are providing new scans or impressions and set the goal of the plan.',
          fr: 'Choisissez ce qui doit être traité, indiquez si vous fournissez de nouveaux scans ou empreintes et fixez l’objectif du plan.',
        } as T,
      },
      movement: {
        title: { en: 'Movements', fr: 'Mouvements' } as T,
        heading: { en: 'Tooth movements', fr: 'Mouvements dentaires' } as T,
        description: {
          en: 'Mark the teeth to leave in place and the antero-posterior correction you want.',
          fr: 'Repérez les dents à laisser en place et la correction antéro-postérieure souhaitée.',
        } as T,
      },
      attachments: {
        title: { en: 'Attachments & IPR', fr: 'Taquets et RIP' } as T,
        heading: { en: 'Attachments and interproximal reduction', fr: 'Taquets et réduction interproximale' } as T,
        description: {
          en: 'What to do with attachments and with IPR, both planned and already done.',
          fr: 'Ce qu’il faut faire des taquets et de la RIP, prévue ou déjà effectuée.',
        } as T,
      },
      finishing: {
        title: { en: 'Finishing', fr: 'Finitions' } as T,
        heading: { en: 'Final details', fr: 'Derniers détails' } as T,
        description: {
          en: 'Elastic cut-outs, remaining spaces and your remarks for each arch.',
          fr: 'Découpes pour élastiques, espaces restants et vos remarques pour chaque arcade.',
        } as T,
      },
      scans: {
        title: { en: 'Scans', fr: 'Scans' } as T,
        heading: { en: 'Updated records', fr: 'Enregistrements à jour' } as T,
        description: {
          en: 'Add your intraoral scans here, or tell us that impressions are on their way.',
          fr: 'Ajoutez ici vos scans intra-oraux ou signalez-nous l’envoi d’empreintes.',
        } as T,
      },
      photos: {
        title: { en: 'Photos', fr: 'Photos' } as T,
        heading: { en: 'Current intraoral photos', fr: 'Photos intra-orales récentes' } as T,
        description: {
          en: 'They let the lab see the teeth as they are now.',
          fr: 'Elles permettent au laboratoire de voir les dents telles qu’elles sont aujourd’hui.',
        } as T,
      },
      replacementDetails: {
        title: { en: 'Details', fr: 'Détails' } as T,
        heading: { en: 'Aligners to replace', fr: 'Aligneurs à remplacer' } as T,
        description: {
          en: 'Which arch, which aligners, how many copies, why and how quickly.',
          fr: 'Quelle arcade, quels aligneurs, combien d’exemplaires, pour quelle raison et dans quel délai.',
        } as T,
      },
      transferDetails: {
        title: { en: 'Details', fr: 'Détails' } as T,
        heading: { en: 'Transfer tray', fr: 'Gouttière de transfert' } as T,
        description: {
          en: 'Which arch, what it is for, how many trays and any remarks.',
          fr: 'Quelle arcade, pour quel usage, combien de gouttières et vos remarques éventuelles.',
        } as T,
      },
      transferTeeth: {
        title: { en: 'Teeth', fr: 'Dents' } as T,
        heading: { en: 'Teeth concerned', fr: 'Dents concernées' } as T,
        description: {
          en: 'Pick every tooth whose attachment must be on the tray.',
          fr: 'Choisissez chaque dent dont le taquet doit figurer sur la gouttière.',
        } as T,
      },
      warrantyDetails: {
        title: { en: 'Details', fr: 'Détails' } as T,
        heading: { en: 'Defect report', fr: 'Signalement du défaut' } as T,
        description: {
          en: 'Which aligners are affected, what is wrong and since when.',
          fr: 'Quels aligneurs sont touchés, quel est le problème et depuis quand.',
        } as T,
      },
      evidencePhotos: {
        title: { en: 'Photos', fr: 'Photos' } as T,
        heading: { en: 'Photos of the aligners', fr: 'Photos des aligneurs' } as T,
        description: {
          en: 'Add at least one clear photo so the defect can be assessed.',
          fr: 'Ajoutez au moins une photo nette pour que le défaut puisse être évalué.',
        } as T,
      },
      review: {
        title: { en: 'Summary', fr: 'Récapitulatif' } as T,
        heading: { en: 'Summary', fr: 'Récapitulatif' } as T,
        description: {
          en: 'Read your answers one last time, then send the request.',
          fr: 'Relisez vos réponses une dernière fois, puis envoyez la demande.',
        } as T,
      },
    },

    notices: {
      instructions: {
        title: { en: 'Before you start', fr: 'Avant de commencer' } as T,
        keepAligner: {
          en: 'Until the new series arrives, the patient stays in the current aligner or the one that fits best.',
          fr: 'En attendant la nouvelle série, le patient garde son aligneur actuel ou celui qui s’adapte le mieux.',
        } as T,
        removeAttachments: {
          en: 'Take off the bonded attachments before you scan or take impressions: the new plan may place them differently.',
          fr: 'Déposez les taquets collés avant le scan ou l’empreinte : le nouveau plan peut les positionner autrement.',
        } as T,
        sendRecords: {
          en: 'Recent photos are mandatory. Recent scans of the arches to correct are strongly advised.',
          fr: 'Des photos récentes sont obligatoires. Des scans récents des arcades à corriger sont vivement conseillés.',
        } as T,
      },
      important: {
        title: { en: 'Good to know', fr: 'À savoir' } as T,
        singleArchOcclusion: {
          en: 'If you send records of one arch only, the occlusion is estimated using the first records of the other arch.',
          fr: 'Avec les enregistrements d’une seule arcade, l’occlusion est estimée d’après les premiers enregistrements de l’autre arcade.',
        } as T,
        newPlanApproval: {
          en: 'You will receive a new plan to review. Production starts only after your approval.',
          fr: 'Vous recevrez un nouveau plan à examiner. La fabrication ne démarre qu’après votre accord.',
        } as T,
      },
      practitionerResponsibility: {
        en: 'Taking and reading radiographs and other diagnostic records remains the practitioner’s sole responsibility.',
        fr: 'La prise et la lecture des radiographies et autres examens diagnostiques relèvent de la seule responsabilité du praticien.',
      } as T,
      recentScan: {
        en: 'Use a recent scan. If it no longer matches the teeth, the aligners may not fit.',
        fr: 'Utilisez un scan récent : s’il ne correspond plus aux dents, les aligneurs risquent de mal s’adapter.',
      } as T,
      shipping: {
        title: { en: 'If you post impressions', fr: 'Si vous envoyez des empreintes' } as T,
        body: {
          en: 'Disinfect them first, then write the request code {code} and the patient’s name ({patient}) on the parcel.',
          fr: 'Désinfectez-les d’abord, puis inscrivez sur le colis le code de la demande {code} et le nom du patient ({patient}).',
        } as T,
      },
    },

    questions: {
      reason: {
        legend: { en: 'Why are you making this request?', fr: 'Pourquoi cette demande ?' } as T,
        details: { en: 'Tell us more', fr: 'Donnez quelques précisions' } as T,
      },
      currentAligner: {
        legend: {
          en: 'Current aligner number',
          fr: 'Numéro de l’aligneur porté actuellement',
        } as T,
        upper: { en: 'Upper aligner no.', fr: 'Aligneur maxillaire n°' } as T,
        lower: { en: 'Lower aligner no.', fr: 'Aligneur mandibulaire n°' } as T,
        available: { en: '(available 1–{max})', fr: '(disponibles 1–{max})' } as T,
        untreated: {
          en: '(optional: this arch is not treated, see question 3)',
          fr: '(facultatif : arcade non traitée, voir question 3)',
        } as T,
        packReference: {
          en: 'No plan on file: your pack covers up to {max} aligners per arch.',
          fr: 'Aucun plan enregistré : votre forfait couvre jusqu’à {max} aligneurs par arcade.',
        } as T,
        planReference: {
          en: 'Numbering taken from plan v{version}, approved on {date}.',
          fr: 'Numéros repris du plan v{version}, approuvé le {date}.',
        } as T,
        delivered: {
          en: 'Already handed over: aligners 1 to {max}.',
          fr: 'Déjà remis : aligneurs 1 à {max}.',
        } as T,
      },
      archTreatment: {
        legend: { en: 'Which arches should be treated?', fr: 'Quelles arcades traiter ?' } as T,
        opposite: { en: 'What about the other arch?', fr: 'Que faire pour l’autre arcade ?' } as T,
      },
      newScans: {
        legend: {
          en: 'Will you provide updated scans or impressions?',
          fr: 'Allez-vous fournir des scans ou empreintes à jour ?',
        } as T,
        hint: {
          en: 'If both arches are treated, records of both are recommended.',
          fr: 'Lorsque les deux arcades sont traitées, mieux vaut fournir les enregistrements des deux.',
        } as T,
        upper: { en: 'Upper arch: new scans or impressions', fr: 'Maxillaire : nouveaux scans ou empreintes' } as T,
        lower: { en: 'Lower arch: new scans or impressions', fr: 'Mandibule : nouveaux scans ou empreintes' } as T,
      },
      clinicalObjective: {
        legend: { en: 'What should the new plan aim for?', fr: 'Quel objectif pour le nouveau plan ?' } as T,
      },
      movementRestriction: {
        legend: { en: 'Are there teeth that must stay in place?', fr: 'Des dents doivent-elles rester en place ?' } as T,
        hint: {
          en: 'Bridges, ankylosed teeth and implants, for example.',
          fr: 'Bridges, dents ankylosées ou implants, par exemple.',
        } as T,
      },
      apRelationship: {
        legend: { en: 'Antero-posterior (A-P) relationship', fr: 'Relation antéro-postérieure (A-P)' } as T,
        hint: { en: 'Set the goal for each side.', fr: 'Fixez l’objectif pour chaque côté.' } as T,
        right: { en: 'Right side', fr: 'Côté droit' } as T,
        left: { en: 'Left side', fr: 'Côté gauche' } as T,
        options: { en: 'Planned approach', fr: 'Moyens envisagés' } as T,
        optionsHint: {
          en: 'If you choose more than one, explain their order and amounts in question 13.',
          fr: 'Si vous en choisissez plusieurs, précisez leur ordre et leurs quantités à la question 13.',
        } as T,
        elasticCutouts: {
          en: 'Should these aligners have elastic cut-outs?',
          fr: 'Faut-il prévoir des découpes pour élastiques sur ces aligneurs ?',
        } as T,
        elasticCutoutsHint: {
          en: 'A cut-out can make the aligner weaker and shorten its life.',
          fr: 'Une découpe peut fragiliser l’aligneur et réduire sa durée de vie.',
        } as T,
      },
      attachmentPolicy: {
        legend: { en: 'Attachments for the new plan', fr: 'Taquets du nouveau plan' } as T,
      },
      existingAttachmentPolicy: {
        legend: { en: 'Attachments currently on the teeth', fr: 'Taquets actuellement en bouche' } as T,
        hint: { en: 'Any new attachment is bonded at the start, with aligner 1.', fr: 'Tout nouveau taquet se pose au début, avec l’aligneur 1.' } as T,
      },
      ipr: {
        legend: { en: 'Interproximal reduction (IPR)', fr: 'Réduction interproximale (RIP)' } as T,
        plan: { en: 'IPR planned in the new series', fr: 'RIP prévue dans la nouvelle série' } as T,
        previous: { en: 'IPR carried out so far', fr: 'RIP effectuée jusqu’ici' } as T,
      },
      precisionCutPolicy: {
        legend: { en: 'Elastic cut-outs', fr: 'Découpes pour élastiques' } as T,
        hint: {
          en: 'A notch or window in the aligner for an elastic or a button.',
          fr: 'Encoche ou fenêtre dans l’aligneur, destinée à un élastique ou à un bouton.',
        } as T,
      },
      residualSpacePolicy: {
        legend: { en: 'Remaining spaces', fr: 'Espaces restants' } as T,
      },
      instructions: {
        legend: { en: 'Your remarks for the lab', fr: 'Vos remarques pour le laboratoire' } as T,
        hint: {
          en: 'Write anything useful for each arch.',
          fr: 'Notez, arcade par arcade, ce qui peut nous être utile.',
        } as T,
        requiredHint: {
          en: 'Your answers to questions 1, 5 or 7 must be explained here.',
          fr: 'Vos réponses aux questions 1, 5 ou 7 doivent être expliquées ici.',
        } as T,
        upper: { en: 'Upper arch', fr: 'Maxillaire' } as T,
        lower: { en: 'Lower arch', fr: 'Mandibulaire' } as T,
      },
      impressionMethod: {
        legend: {
          en: 'How will the updated records reach us?',
          fr: 'Comment recevrons-nous les enregistrements à jour ?',
        } as T,
        scanCount: {
          en: 'Scan files added: {uploaded} of {expected} expected (question 4).',
          fr: 'Fichiers de scan ajoutés : {uploaded} sur {expected} attendu(s) (question 4).',
        } as T,
      },
      photos: {
        legend: { en: 'Photos for this request', fr: 'Photos pour cette demande' } as T,
        intraoralHint: {
          en: 'All five intraoral views are needed: right, front, left, upper occlusal and lower occlusal.',
          fr: 'Il nous faut les cinq vues intra-orales : côté droit, face, côté gauche, occlusale maxillaire et occlusale mandibulaire.',
        } as T,
        evidenceHint: {
          en: 'Add a clear photo of each defective aligner (at least one is required). The pouch label helps us assess the claim.',
          fr: 'Ajoutez une photo nette de chaque aligneur défectueux (au moins une est obligatoire). L’étiquette du sachet nous aide à évaluer la demande.',
        } as T,
        missing: { en: 'Photos still missing', fr: 'Photos manquantes' } as T,
        slots: {
          aligner: { en: 'Aligner no. {number}', fr: 'Aligneur n° {number}' } as T,
          alignerLabel: { en: 'Pouch or lot label', fr: 'Sachet ou étiquette du lot' } as T,
        },
      },
      replacement: {
        arch: { en: 'Which arches are concerned?', fr: 'Quelles arcades sont concernées ?' } as T,
        range: { en: 'Aligners to replace', fr: 'Aligneurs à remplacer' } as T,
        rangeHint: {
          en: 'Enter the first and last number of the series.',
          fr: 'Saisissez le premier et le dernier numéro de la série.',
        } as T,
        from: { en: 'From aligner no.', fr: 'Du n°' } as T,
        to: { en: 'To aligner no.', fr: 'Au n°' } as T,
        quantity: { en: 'How many copies?', fr: 'Combien d’exemplaires ?' } as T,
        quantityLabel: { en: 'Copies per aligner', fr: 'Exemplaires par aligneur' } as T,
        quantityHint: {
          en: 'Between {min} and {max} copies per aligner.',
          fr: 'Entre {min} et {max} exemplaires par aligneur.',
        } as T,
        reason: { en: 'Why do they need replacing?', fr: 'Pourquoi les remplacer ?' } as T,
        urgency: { en: 'Priority', fr: 'Priorité' } as T,
      },
      transfer: {
        sourcePlan: { en: 'Source plan', fr: 'Plan de référence' } as T,
        sourcePlanMissing: {
          en: 'This case has no plan on file: the lab will work from its records.',
          fr: 'Ce dossier n’a pas de plan enregistré : le laboratoire travaillera à partir de ses fichiers.',
        } as T,
        sourcePlanValue: {
          en: 'Attachment positions from plan v{version}, approved on {date}.',
          fr: 'Position des taquets selon le plan v{version}, approuvé le {date}.',
        } as T,
        arch: { en: 'Which arches are concerned?', fr: 'Quelles arcades sont concernées ?' } as T,
        purpose: { en: 'What will the tray be used for?', fr: 'À quoi servira la gouttière ?' } as T,
        quantity: { en: 'How many trays?', fr: 'Combien de gouttières ?' } as T,
        quantityLabel: { en: 'Trays', fr: 'Gouttières' } as T,
        quantityHint: { en: 'Between {min} and {max} trays.', fr: 'Entre {min} et {max} gouttières.' } as T,
        notes: { en: 'Remarks for the lab', fr: 'Remarques pour le laboratoire' } as T,
        notesLabel: { en: 'Remarks (optional)', fr: 'Remarques (facultatif)' } as T,
        notesRequiredLabel: { en: 'Explain what the tray is for', fr: 'Expliquez à quoi sert la gouttière' } as T,
        teeth: { en: 'Teeth concerned', fr: 'Dents concernées' } as T,
        teethHint: {
          en: 'Tap each tooth that needs its attachment put back.',
          fr: 'Touchez chaque dent dont le taquet doit être replacé.',
        } as T,
      },
      warranty: {
        arch: { en: 'Which arch are the aligners for?', fr: 'À quelle arcade appartiennent les aligneurs ?' } as T,
        aligner: { en: 'Defective aligners', fr: 'Aligneurs défectueux' } as T,
        alignerLabel: {
          en: 'Aligner numbers (for example 1, 2, 4)',
          fr: 'Numéros des aligneurs (par exemple 1, 2, 4)',
        } as T,
        alignerRange: {
          en: 'Tap each defective aligner. Available: 1 to {max}.',
          fr: 'Touchez chaque aligneur défectueux. Disponibles : 1 à {max}.',
        } as T,
        alignerSelected: { en: 'Selected: {numbers}', fr: 'Sélectionnés : {numbers}' } as T,
        alignerNoneSelected: { en: 'No aligner selected yet.', fr: 'Aucun aligneur sélectionné.' } as T,
        alignerArchFirst: { en: 'Choose the arch first', fr: 'Choisissez d’abord l’arcade' } as T,
        alignerNone: { en: 'No aligner for this arch', fr: 'Aucun aligneur pour cette arcade' } as T,
        defect: { en: 'What is wrong with them?', fr: 'Quel est le défaut ?' } as T,
        discoveredAt: { en: 'When was this noticed?', fr: 'Quand l’avez-vous remarqué ?' } as T,
        discoveredAtLabel: { en: 'Date', fr: 'Date' } as T,
        description: { en: 'Description', fr: 'Description du défaut' } as T,
        commentsLabel: {
          en: 'Describe what you or the patient saw',
          fr: 'Décrivez ce que vous ou le patient avez observé',
        } as T,
        lotLabel: { en: 'Lot or reference number (optional)', fr: 'Numéro de lot ou de référence (facultatif)' } as T,
      },
    },

    options: {
      reason: {
        finishing: { en: 'The result needs fine-tuning', fr: 'Le résultat demande des ajustements' } as T,
        tracking_problem: {
          en: 'The teeth have drifted from the plan',
          fr: 'Les dents s’écartent du plan prévu',
        } as T,
        treatment_plan_change: {
          en: 'Change of plan (explain in question 13)',
          fr: 'Modification du plan (à expliquer à la question 13)',
        } as T,
        dental_restoration: {
          en: 'Dental work or restorations since the last plan',
          fr: 'Soins ou restaurations réalisés depuis le dernier plan',
        } as T,
        non_compliance: { en: 'Aligners not worn as prescribed', fr: 'Aligneurs non portés comme prescrit' } as T,
        other: { en: 'Other', fr: 'Autre' } as T,
      },
      archTreatment: {
        both: { en: 'Both arches', fr: 'Les deux arcades' } as T,
        upper: { en: 'Upper', fr: 'Maxillaire' } as T,
        lower: { en: 'Lower', fr: 'Mandibulaire' } as T,
      },
      oppositeArch: {
        nothing: { en: 'Leave it without aligners', fr: 'La laisser sans aligneurs' } as T,
        passive: { en: 'Give it passive aligners', fr: 'Lui prévoir des aligneurs passifs' } as T,
      },
      yesNo: {
        yes: { en: 'Yes', fr: 'Oui' } as T,
        no: { en: 'No', fr: 'Non' } as T,
      },
      clinicalObjective: {
        adjust_current_position: {
          en: 'Fine-tune from where the teeth are now',
          fr: 'Ajuster à partir de la position actuelle',
        } as T,
        preserve_previous_goal: {
          en: 'Aim for the end result of the last approved plan',
          fr: 'Viser le résultat final du dernier plan approuvé',
        } as T,
        new_goal: { en: 'Another goal (explain in question 13)', fr: 'Autre objectif (à expliquer à la question 13)' } as T,
      },
      movementRestriction: {
        none: { en: 'No, every tooth may move', fr: 'Non, toutes les dents peuvent bouger' } as T,
        selected_teeth: { en: 'Yes, keep these teeth in place', fr: 'Oui, garder ces dents en place' } as T,
      },
      apCorrection: {
        maintain: { en: 'Leave the relationship as it is', fr: 'Laisser la relation telle quelle' } as T,
        improve_canine: { en: 'Improve canines only', fr: 'Améliorer les canines seulement' } as T,
        improve_canine_molar: {
          en: 'Improve canines and molars (explain in question 13)',
          fr: 'Améliorer canines et molaires (à expliquer à la question 13)',
        } as T,
        class_one: { en: 'Bring canines and molars to Class I', fr: 'Amener canines et molaires en classe I' } as T,
      },
      apOption: {
        posterior_ipr: { en: 'Posterior IPR', fr: 'RIP postérieure' } as T,
        elastics_simulation: {
          en: 'Elastics for Class II or III',
          fr: 'Élastiques pour classe II ou III',
        } as T,
        sequential_distalization: { en: 'Sequential distalization', fr: 'Distalisation séquentielle' } as T,
        mandibular_advancement: { en: 'Mandibular advancement', fr: 'Avancée mandibulaire' } as T,
        orthognathic_surgery: {
          en: 'Preparation for orthognathic surgery',
          fr: 'Préparation à la chirurgie orthognathique',
        } as T,
      },
      attachmentPlan: {
        as_needed: { en: 'Add them where the plan needs them', fr: 'En ajouter là où le plan en a besoin' } as T,
        avoid_selected_teeth: { en: 'Keep them off these teeth', fr: 'N’en mettre aucun sur ces dents' } as T,
      },
      existingAttachments: {
        remove_all: {
          en: 'Start afresh: take them all out of the plan and add new ones where needed (recommended)',
          fr: 'Repartir de zéro : les retirer tous du plan et en ajouter là où c’est utile (recommandé)',
        } as T,
        remove_selected: {
          en: 'Take only the ones I mark out of the plan',
          fr: 'Retirer du plan seulement ceux que j’indique',
        } as T,
        keep_conventional: {
          en: 'Keep conventional ones only',
          fr: 'Garder seulement les taquets conventionnels',
        } as T,
        keep_all: { en: 'Keep them all', fr: 'Les garder tous' } as T,
      },
      iprPlan: {
        as_needed: { en: 'Allow IPR where useful', fr: 'Autoriser la RIP là où elle est utile' } as T,
        none: { en: 'No IPR', fr: 'Pas de RIP' } as T,
        avoid_selected_teeth: { en: 'Exclude these teeth from IPR', fr: 'Aucune RIP sur ces dents' } as T,
      },
      previousIpr: {
        as_prescribed: { en: 'Done as planned', fr: 'Effectuée comme prévu' } as T,
        none: { en: 'None was done', fr: 'Aucune n’a été effectuée' } as T,
        different: {
          en: 'Done differently (enter the contacts)',
          fr: 'Effectuée autrement (indiquez les contacts)',
        } as T,
      },
      cutoutPlan: {
        none: { en: 'None', fr: 'Aucune' } as T,
        same_as_previous: { en: 'Same positions as last time', fr: 'Mêmes positions que la dernière fois' } as T,
        selected_teeth: { en: 'Only on these teeth', fr: 'Seulement sur ces dents' } as T,
      },
      residualSpaces: {
        none: { en: 'None', fr: 'Aucun' } as T,
        close_specified: {
          en: 'Close them (enter the amount)',
          fr: 'Les fermer (indiquez la valeur)',
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
        attachment_placement: { en: 'Placing attachments', fr: 'Mise en place de taquets' } as T,
        auxiliary_placement: { en: 'Placing auxiliaries', fr: 'Mise en place d’auxiliaires' } as T,
        attachment_and_auxiliary: { en: 'Attachments and auxiliaries', fr: 'Taquets et auxiliaires' } as T,
        other: { en: 'Other', fr: 'Autre' } as T,
      },
      defect: {
        fit: { en: 'Poor seating', fr: 'Ajustement insuffisant' } as T,
        crack: { en: 'Split or fracture', fr: 'Fêlure ou rupture' } as T,
        deformation: { en: 'Loss of shape', fr: 'Perte de forme' } as T,
        trim: { en: 'Badly cut edge', fr: 'Bord mal découpé' } as T,
        material: { en: 'Problem with the material', fr: 'Problème de matière' } as T,
        labeling: { en: 'Wrong label', fr: 'Étiquette erronée' } as T,
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
        both: { en: 'Aligners for both arches.', fr: 'Des aligneurs pour les deux arcades.' } as T,
        upper: { en: 'Aligners for the upper arch only.', fr: 'Des aligneurs pour le maxillaire seulement.' } as T,
        lower: { en: 'Aligners for the lower arch only.', fr: 'Des aligneurs pour la mandibule seulement.' } as T,
      },
      clinicalObjective: {
        adjust_current_position: {
          en: 'Small corrections; the A-P relationship does not change.',
          fr: 'De petites corrections ; la relation A-P ne change pas.',
        } as T,
        preserve_previous_goal: {
          en: 'The plan keeps the same end point as before.',
          fr: 'Le plan conserve le même point d’arrivée.',
        } as T,
        new_goal: {
          en: 'Set out the new goal in question 13.',
          fr: 'Exposez le nouvel objectif à la question 13.',
        } as T,
      },
      apOption: {
        posterior_ipr: {
          en: 'Creates space through IPR on the back teeth.',
          fr: 'Crée de l’espace par RIP sur les dents postérieures.',
        } as T,
        elastics_simulation: {
          en: 'The plan takes Class II or III elastics into account.',
          fr: 'Le plan tient compte d’élastiques de classe II ou III.',
        } as T,
        sequential_distalization: {
          en: 'Back teeth move distally one at a time, molars first.',
          fr: 'Les dents postérieures reculent une à une, en commençant par les molaires.',
        } as T,
        mandibular_advancement: {
          en: 'For patients still growing. Feasibility is confirmed at the planning stage.',
          fr: 'Pour les patients en croissance. La faisabilité est confirmée à la planification.',
        } as T,
        orthognathic_surgery: {
          en: 'The arches are prepared for surgery. List any extractions in question 13.',
          fr: 'Les arcades sont préparées pour l’intervention. Indiquez les extractions éventuelles à la question 13.',
        } as T,
      },
      existingAttachments: {
        remove_all: {
          en: 'All attachments are planned afresh.',
          fr: 'Tous les taquets sont planifiés à nouveau.',
        } as T,
        remove_selected: {
          en: 'Mark them on the chart.',
          fr: 'Indiquez-les sur le schéma.',
        } as T,
        keep_conventional: {
          en: 'Rectangular and bevelled ones stay; the rest are planned afresh.',
          fr: 'Les rectangulaires et biseautés restent ; les autres sont replanifiés.',
        } as T,
        keep_all: {
          en: 'This can make tooth movement less effective.',
          fr: 'Les mouvements dentaires peuvent en être moins efficaces.',
        } as T,
      },
      impressionMethod: {
        intraoral_scan: {
          en: 'Add STL, PLY or OBJ files on this page.',
          fr: 'Ajoutez des fichiers STL, PLY ou OBJ sur cette page.',
        } as T,
        physical_impression: {
          en: 'Send them to the lab by post or courier.',
          fr: 'Envoyez-les au laboratoire par la poste ou par coursier.',
        } as T,
      },
      urgency: {
        standard: { en: 'Normal lab schedule.', fr: 'Délai normal du laboratoire.' } as T,
        urgent: { en: 'The lab handles it first.', fr: 'Le laboratoire la traite en premier.' } as T,
      },
    },

    purpose: {
      tooth: {
        do_not_move: { en: 'Do not move', fr: 'Ne pas déplacer' } as T,
        no_attachment: { en: 'No attachment', fr: 'Sans taquet' } as T,
        remove_attachment: { en: 'Attachment to remove', fr: 'Taquet à retirer' } as T,
        no_ipr: { en: 'No IPR', fr: 'Sans RIP' } as T,
        cutout: { en: 'Cut-out', fr: 'Découpe' } as T,
        transfer_tray: { en: 'Attachment to put back', fr: 'Taquet à replacer' } as T,
      },
      contact: {
        performed_ipr: { en: 'IPR performed', fr: 'RIP réalisée' } as T,
        residual_space: { en: 'Remaining space', fr: 'Espace restant' } as T,
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
      none: { en: 'None', fr: 'Aucun' } as T,
      teeth: { en: 'Teeth', fr: 'Dents' } as T,
      scanFiles: { en: 'Scan files', fr: 'Fichiers de scan' } as T,
      labels: {
        reason: { en: 'Reason', fr: 'Motif' } as T,
        currentUpper: { en: 'Upper aligner worn', fr: 'Aligneur maxillaire porté' } as T,
        currentLower: { en: 'Lower aligner worn', fr: 'Aligneur mandibulaire porté' } as T,
        arch: { en: 'Arch(es)', fr: 'Arcade(s)' } as T,
        oppositeArch: { en: 'Opposite arch', fr: 'Arcade opposée' } as T,
        newUpperScan: { en: 'Upper arch: new scans or impressions', fr: 'Maxillaire : nouveaux scans ou empreintes' } as T,
        newLowerScan: { en: 'Lower arch: new scans or impressions', fr: 'Mandibule : nouveaux scans ou empreintes' } as T,
        clinicalObjective: { en: 'Goal of the plan', fr: 'Objectif du plan' } as T,
        movementRestriction: { en: 'Teeth to keep in place', fr: 'Dents à garder en place' } as T,
        apRight: { en: 'A-P relationship, right', fr: 'Relation A-P, côté droit' } as T,
        apLeft: { en: 'A-P relationship, left', fr: 'Relation A-P, côté gauche' } as T,
        apOptions: { en: 'Planned approach', fr: 'Moyens envisagés' } as T,
        elasticCutouts: { en: 'Elastic cut-outs', fr: 'Découpes pour élastiques' } as T,
        attachmentPolicy: { en: 'Attachments for the new plan', fr: 'Taquets du nouveau plan' } as T,
        existingAttachmentPolicy: { en: 'Current attachments', fr: 'Taquets actuellement en bouche' } as T,
        iprPolicy: { en: 'IPR planned in the new series', fr: 'RIP prévue dans la nouvelle série' } as T,
        previousIpr: { en: 'IPR carried out so far', fr: 'RIP effectuée jusqu’ici' } as T,
        precisionCutPolicy: { en: 'Cut-outs', fr: 'Découpes' } as T,
        residualSpacePolicy: { en: 'Remaining spaces', fr: 'Espaces restants' } as T,
        upperInstructions: { en: 'Upper arch remarks', fr: 'Remarques pour le maxillaire' } as T,
        lowerInstructions: { en: 'Lower arch remarks', fr: 'Remarques pour la mandibule' } as T,
        impressionMethod: { en: 'Records', fr: 'Enregistrements' } as T,
        alignerRange: { en: 'Aligners', fr: 'Aligneurs' } as T,
        quantity: { en: 'Quantity', fr: 'Quantité' } as T,
        urgency: { en: 'Priority', fr: 'Priorité' } as T,
        replacementReason: { en: 'Reason', fr: 'Motif' } as T,
        sourcePlan: { en: 'Source plan', fr: 'Plan de référence' } as T,
        transferPurpose: { en: 'Purpose', fr: 'Usage' } as T,
        transferTeeth: { en: 'Teeth concerned', fr: 'Dents concernées' } as T,
        transferNotes: { en: 'Remarks for the lab', fr: 'Remarques pour le laboratoire' } as T,
        defectiveAligner: { en: 'Defective aligners', fr: 'Aligneurs défectueux' } as T,
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
      defectiveAligners: {
        en: 'Select at least one defective aligner.',
        fr: 'Sélectionnez au moins un aligneur défectueux.',
      } as T,
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
        en: 'Your answers to questions 1, 5 or 7 must be explained here.',
        fr: 'Vos réponses aux questions 1, 5 ou 7 doivent être expliquées ici.',
      } as T,
      scanFiles: {
        en: 'Upload one scan file per arch announced in question 4.',
        fr: 'Téléversez un fichier de scan par arcade annoncée à la question 4.',
      } as T,
      photos: {
        en: 'All five intraoral photos are needed.',
        fr: 'Les cinq photos intra-orales sont nécessaires.',
      } as T,
      evidencePhotos: {
        en: 'Add at least one photo of a defective aligner.',
        fr: 'Ajoutez au moins une photo d’un aligneur défectueux.',
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
        en: 'A replacement request will be created for the aligners in this claim. It is not covered: it will be billed on a quotation once approved.',
        fr: 'Une demande de remplacement sera créée pour les aligneurs de cette réclamation. Elle n’est pas couverte : elle sera facturée sur devis après validation.',
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

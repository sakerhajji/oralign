import type { Lang } from './dict';

type T = Record<Lang, string>;

/** Auth, onboarding and public patient-viewer strings — spread into dict. */
export const authDomainDict = {
  // ─── Authentication pages (login / signup / forgot / reset / verify) ─
  authPages: {
    // login-form.tsx
    login: {
      title: { en: 'Login to your account', fr: 'Connectez-vous à votre compte' } as T,
      subtitle: {
        en: 'Enter your email below to login to your account',
        fr: 'Saisissez votre e-mail ci-dessous pour vous connecter à votre compte',
      } as T,
      backendDownTitle: {
        en: 'Backend is not connected',
        fr: 'Le serveur n’est pas connecté',
      } as T,
      backendDownDesc: {
        en: 'The app cannot reach the API server right now. Please make sure the backend container is running, then try again.',
        fr: 'L’application ne parvient pas à joindre le serveur API pour le moment. Veuillez vous assurer que le conteneur backend est en cours d’exécution, puis réessayer.',
      } as T,
      failedTitle: { en: 'Login failed', fr: 'Échec de la connexion' } as T,
      failedFallback: {
        en: 'Email or password is incorrect.',
        fr: 'L’e-mail ou le mot de passe est incorrect.',
      } as T,
      emailLabel: { en: 'Email', fr: 'E-mail' } as T,
      passwordLabel: { en: 'Password', fr: 'Mot de passe' } as T,
      forgotLink: { en: 'Forgot your password?', fr: 'Mot de passe oublié ?' } as T,
      submit: { en: 'Login', fr: 'Se connecter' } as T,
      submitting: { en: 'Logging in...', fr: 'Connexion en cours...' } as T,
      noAccount: { en: 'Don’t have an account?', fr: 'Vous n’avez pas de compte ?' } as T,
      signUpLink: { en: 'Sign up', fr: 'Créer un compte' } as T,
    },

    // login/page.tsx + signup/page.tsx shared imagery
    common: {
      logoAlt: { en: 'Oralign Logo', fr: 'Logo Oralign' } as T,
      clinicImageAlt: { en: 'Dental clinic', fr: 'Cabinet dentaire' } as T,
    },

    // signup-form.tsx
    signup: {
      title: { en: 'Create your account', fr: 'Créez votre compte' } as T,
      subtitleBefore: {
        en: 'Oralign is for dental professionals.',
        fr: 'Oralign est destiné aux professionnels dentaires.',
      } as T,
      subtitleEmphasis: { en: 'Dentists only.', fr: 'Praticiens uniquement.' } as T,
      fullNameLabel: { en: 'Full Name', fr: 'Nom complet' } as T,
      fullNamePlaceholder: { en: 'Dr. Jane Smith', fr: 'Dr. Jane Smith' } as T,
      fullNameHelp: {
        en: '“Dr.” will be added automatically if not included.',
        fr: '« Dr. » sera ajouté automatiquement s’il n’est pas indiqué.',
      } as T,
      emailLabel: { en: 'Email', fr: 'E-mail' } as T,
      emailPlaceholder: { en: 'jane@clinic.com', fr: 'jane@cabinet.com' } as T,
      passwordLabel: { en: 'Password', fr: 'Mot de passe' } as T,
      passwordHelp: {
        en: 'Must be at least 8 characters.',
        fr: 'Doit comporter au moins 8 caractères.',
      } as T,
      phoneLabel: { en: 'Phone', fr: 'Téléphone' } as T,
      submit: { en: 'Create account', fr: 'Créer un compte' } as T,
      submitting: { en: 'Creating account…', fr: 'Création du compte…' } as T,
      hasAccount: { en: 'Already have an account?', fr: 'Vous avez déjà un compte ?' } as T,
      signInLink: { en: 'Sign in', fr: 'Se connecter' } as T,
    },

    // Shared password show/hide toggle aria-labels
    password: {
      show: { en: 'Show password', fr: 'Afficher le mot de passe' } as T,
      hide: { en: 'Hide password', fr: 'Masquer le mot de passe' } as T,
    },

    // forgot-password/page.tsx
    forgot: {
      title: { en: 'Forgot Password', fr: 'Mot de passe oublié' } as T,
      desc: {
        en: 'Enter your email address and we’ll send you a link to reset your password.',
        fr: 'Saisissez votre adresse e-mail et nous vous enverrons un lien pour réinitialiser votre mot de passe.',
      } as T,
      successTitle: { en: 'Check Your Email', fr: 'Vérifiez votre e-mail' } as T,
      successDesc: {
        en: 'We’ve sent you a password reset link. Please check your email and follow the instructions.',
        fr: 'Nous vous avons envoyé un lien de réinitialisation du mot de passe. Veuillez consulter votre e-mail et suivre les instructions.',
      } as T,
      backToLogin: { en: 'Back to Login', fr: 'Retour à la connexion' } as T,
      emailLabel: { en: 'Email', fr: 'E-mail' } as T,
      submit: { en: 'Send Reset Link', fr: 'Envoyer le lien de réinitialisation' } as T,
      submitting: { en: 'Sending...', fr: 'Envoi en cours...' } as T,
      rememberPassword: {
        en: 'Remember your password?',
        fr: 'Vous vous souvenez de votre mot de passe ?',
      } as T,
      loginLink: { en: 'Login', fr: 'Se connecter' } as T,
    },

    // reset-password/page.tsx
    reset: {
      title: { en: 'Reset Password', fr: 'Réinitialiser le mot de passe' } as T,
      desc: { en: 'Enter your new password below.', fr: 'Saisissez votre nouveau mot de passe ci-dessous.' } as T,
      newPasswordLabel: { en: 'New Password', fr: 'Nouveau mot de passe' } as T,
      newPasswordHelp: {
        en: 'Must be at least 8 characters long.',
        fr: 'Doit comporter au moins 8 caractères.',
      } as T,
      confirmPasswordLabel: { en: 'Confirm Password', fr: 'Confirmer le mot de passe' } as T,
      submit: { en: 'Reset Password', fr: 'Réinitialiser le mot de passe' } as T,
      submitting: { en: 'Resetting...', fr: 'Réinitialisation en cours...' } as T,
      rememberPassword: {
        en: 'Remember your password?',
        fr: 'Vous vous souvenez de votre mot de passe ?',
      } as T,
      loginLink: { en: 'Login', fr: 'Se connecter' } as T,
    },

    // verify-email-card.tsx
    verify: {
      title: { en: 'Check your inbox', fr: 'Consultez votre boîte de réception' } as T,
      descBefore: {
        en: 'We sent a 6-digit verification code to',
        fr: 'Nous avons envoyé un code de vérification à 6 chiffres à',
      } as T,
      descFallbackEmail: { en: 'your email address', fr: 'votre adresse e-mail' } as T,
      descAfter: {
        en: '. Enter it below to continue.',
        fr: '. Saisissez-le ci-dessous pour continuer.',
      } as T,
      emailLabel: { en: 'Email', fr: 'E-mail' } as T,
      emailPlaceholder: { en: 'you@example.com', fr: 'vous@exemple.com' } as T,
      codeLabel: { en: 'Verification code', fr: 'Code de vérification' } as T,
      codePlaceholder: { en: '123456', fr: '123456' } as T,
      submit: { en: 'Verify email', fr: 'Vérifier l’e-mail' } as T,
      submitting: { en: 'Verifying…', fr: 'Vérification…' } as T,
      errorHint: {
        en: 'If your code expired or you can’t find the email, click “Resend code” below to get a fresh one.',
        fr: 'Si votre code a expiré ou si vous ne trouvez pas l’e-mail, cliquez sur « Renvoyer le code » ci-dessous pour en obtenir un nouveau.',
      } as T,
      noCode: { en: 'Didn’t receive the code?', fr: 'Vous n’avez pas reçu le code ?' } as T,
      resend: { en: 'Resend code', fr: 'Renvoyer le code' } as T,
      resending: { en: 'Sending…', fr: 'Envoi…' } as T,
      resendIn: { en: 'Resend in {n}s', fr: 'Renvoyer dans {n} s' } as T,
      emailRequiredToast: {
        en: 'Please enter your email address first.',
        fr: 'Veuillez d’abord saisir votre adresse e-mail.',
      } as T,
      verifyFailedFallback: {
        en: 'Failed to verify email',
        fr: 'Échec de la vérification de l’e-mail',
      } as T,
    },

    // Validation messages (zod factories) for auth forms
    validation: {
      emailInvalid: { en: 'Invalid email address', fr: 'Adresse e-mail invalide' } as T,
      passwordRequired: { en: 'Password is required', fr: 'Le mot de passe est obligatoire' } as T,
      passwordMin8: {
        en: 'Password must be at least 8 characters',
        fr: 'Le mot de passe doit comporter au moins 8 caractères',
      } as T,
      fullNameMin2: {
        en: 'Full name must be at least 2 characters',
        fr: 'Le nom complet doit comporter au moins 2 caractères',
      } as T,
      phoneRequired: { en: 'Phone number is required', fr: 'Le numéro de téléphone est obligatoire' } as T,
      phoneFormat: {
        en: 'Phone must be in international format (e.g. +21612345678)',
        fr: 'Le téléphone doit être au format international (ex. +21612345678)',
      } as T,
      countryRequired: { en: 'Country is required', fr: 'Le pays est obligatoire' } as T,
      countryFormat: {
        en: 'Country must be a 2-letter ISO code (e.g. TN)',
        fr: 'Le pays doit être un code ISO à 2 lettres (ex. TN)',
      } as T,
      codeRequired: {
        en: 'Verification code is required',
        fr: 'Le code de vérification est obligatoire',
      } as T,
      tokenRequired: { en: 'Token is required', fr: 'Le jeton est obligatoire' } as T,
      passwordsMismatch: {
        en: 'Passwords do not match',
        fr: 'Les mots de passe ne correspondent pas',
      } as T,
    },
  },

  // ─── Onboarding flow (profile / clinic / pending + shell + guard) ───
  onboardingPages: {
    // onboarding-shell.tsx
    shell: {
      homeAria: { en: 'Oralign home', fr: 'Accueil Oralign' } as T,
      logoAlt: { en: 'Oralign', fr: 'Oralign' } as T,
      stepsAria: { en: 'Onboarding steps', fr: 'Étapes d’inscription' } as T,
      signOut: { en: 'Sign out', fr: 'Se déconnecter' } as T,
      stepVerify: { en: 'Verify email', fr: 'Vérifier l’e-mail' } as T,
      stepProfile: { en: 'Profile', fr: 'Profil' } as T,
      stepClinic: { en: 'Clinic', fr: 'Cabinet' } as T,
      stepApproval: { en: 'Approval', fr: 'Approbation' } as T,
    },

    // onboarding/profile/page.tsx
    profile: {
      title: { en: 'Complete your profile', fr: 'Complétez votre profil' } as T,
      description: {
        en: 'Add your phone number and country so we can finish setting up your account.',
        fr: 'Ajoutez votre numéro de téléphone et votre pays afin que nous puissions finaliser la configuration de votre compte.',
      } as T,
    },

    // onboarding/clinic/page.tsx
    clinic: {
      title: { en: 'Set up your clinic', fr: 'Configurez votre cabinet' } as T,
      description: {
        en: 'Tell us about your clinic and when it’s open. Everything is saved in one step — click Save & continue when you’re done.',
        fr: 'Parlez-nous de votre cabinet et de ses horaires d’ouverture. Tout est enregistré en une seule étape — cliquez sur Enregistrer et continuer une fois terminé.',
      } as T,
      dentistOnly: {
        en: 'Clinic setup is only required for dentist accounts.',
        fr: 'La configuration du cabinet n’est requise que pour les comptes praticiens.',
      } as T,
    },

    // onboarding-clinic-form.tsx
    clinicForm: {
      savedToast: { en: 'Clinic setup saved.', fr: 'Configuration du cabinet enregistrée.' } as T,
      mapSectionTitle: { en: 'Map location', fr: 'Emplacement sur la carte' } as T,
      mapSectionDesc: {
        en: 'Drop a pin on the map (or tap “Use My Location”) — we’ll auto-fill the address, city, and country below.',
        fr: 'Placez un repère sur la carte (ou appuyez sur « Utiliser ma position ») — nous remplirons automatiquement l’adresse, la ville et le pays ci-dessous.',
      } as T,
      detailsSectionTitle: { en: 'Clinic details', fr: 'Détails du cabinet' } as T,
      detailsSectionDesc: {
        en: 'Information patients will see when they look up your clinic. Address, city, and country are pre-filled from the map above — edit them if anything needs to be more precise.',
        fr: 'Informations que les patients verront lorsqu’ils consulteront votre cabinet. L’adresse, la ville et le pays sont préremplis à partir de la carte ci-dessus — modifiez-les si quelque chose doit être plus précis.',
      } as T,
      clinicNameLabel: { en: 'Clinic name', fr: 'Nom du cabinet' } as T,
      clinicNamePlaceholder: {
        en: 'Bright Smiles Dental Clinic',
        fr: 'Cabinet dentaire Sourires Éclatants',
      } as T,
      clinicPhoneLabel: { en: 'Clinic phone', fr: 'Téléphone du cabinet' } as T,
      clinicAddressLabel: { en: 'Clinic address', fr: 'Adresse du cabinet' } as T,
      clinicAddressPlaceholder: {
        en: '123 Main Street, suite 4',
        fr: '123 rue Principale, bureau 4',
      } as T,
      descriptionLabel: { en: 'Short description', fr: 'Brève description' } as T,
      descriptionOptional: { en: '(optional)', fr: '(facultatif)' } as T,
      descriptionPlaceholder: {
        en: 'A few words patients will see in your profile',
        fr: 'Quelques mots que les patients verront sur votre profil',
      } as T,
      // Clinic "Matricule fiscal" (doctor tax id) — printed on invoices.
      taxIdLabel: { en: 'Tax registration number', fr: 'Matricule fiscal' } as T,
      taxIdOptional: { en: '(optional)', fr: '(facultatif)' } as T,
      taxIdPlaceholder: { en: '1234567/A/M/000', fr: '1234567/A/M/000' } as T,
      taxIdHelp: {
        en: 'Your clinic tax id (“Matricule fiscal”). Shown on invoices issued to your clinic.',
        fr: 'Le matricule fiscal de votre cabinet. Affiché sur les factures émises à votre cabinet.',
      } as T,
      hoursSectionTitle: { en: 'Working hours', fr: 'Horaires d’ouverture' } as T,
      hoursSectionDesc: {
        en: 'Toggle each day on or off. At least one open day is required.',
        fr: 'Activez ou désactivez chaque jour. Au moins un jour d’ouverture est requis.',
      } as T,
      submit: { en: 'Save & continue', fr: 'Enregistrer et continuer' } as T,
      submitting: { en: 'Saving…', fr: 'Enregistrement…' } as T,
      // Validation (factory)
      vClinicNameRequired: { en: 'Clinic name is required', fr: 'Le nom du cabinet est obligatoire' } as T,
      vClinicAddressRequired: { en: 'Clinic address is required', fr: 'L’adresse du cabinet est obligatoire' } as T,
      vClinicPhoneFormat: {
        en: 'Phone number must be in international format',
        fr: 'Le numéro de téléphone doit être au format international',
      } as T,
      vCityRequired: { en: 'City is required', fr: 'La ville est obligatoire' } as T,
      vCountryRequired: { en: 'Country is required', fr: 'Le pays est obligatoire' } as T,
      vPickLocation: {
        en: 'Pick the clinic location on the map',
        fr: 'Sélectionnez l’emplacement du cabinet sur la carte',
      } as T,
      vTaxIdMax: {
        en: 'Tax id must be 60 characters or fewer',
        fr: 'Le matricule fiscal doit comporter au maximum 60 caractères',
      } as T,
      vTimeFormat: { en: 'Time must be HH:mm', fr: 'L’heure doit être au format HH:mm' } as T,
      vSetAtLeastOneDay: { en: 'Set at least one day', fr: 'Définissez au moins un jour' } as T,
      vOneOpenDay: {
        en: 'At least one day of the week must be open',
        fr: 'Au moins un jour de la semaine doit être ouvert',
      } as T,
      vOpenBeforeClose: {
        en: 'Opening time must be before closing time on every open day',
        fr: 'L’heure d’ouverture doit précéder l’heure de fermeture chaque jour d’ouverture',
      } as T,
    },

    // onboarding/pending/page.tsx
    pending: {
      titleRejected: { en: 'Account not approved', fr: 'Compte non approuvé' } as T,
      titleReview: {
        en: 'Thank you — your data is in review',
        fr: 'Merci — vos informations sont en cours d’examen',
      } as T,
      descRejected: {
        en: 'Your account has been flagged for review. Please contact support so we can sort this out together.',
        fr: 'Votre compte a été signalé pour examen. Veuillez contacter le support afin que nous puissions résoudre cela ensemble.',
      } as T,
      descReview: {
        en: 'Thank you for completing your profile. An admin will confirm your account shortly — you’ll receive an email the moment it’s approved.',
        fr: 'Merci d’avoir complété votre profil. Un administrateur confirmera votre compte sous peu — vous recevrez un e-mail dès qu’il sera approuvé.',
      } as T,
      emailVerified: { en: 'Email verified', fr: 'E-mail vérifié' } as T,
      profileCompleted: { en: 'Profile completed', fr: 'Profil complété' } as T,
      clinicSaved: { en: 'Clinic information saved', fr: 'Informations du cabinet enregistrées' } as T,
      approvalDenied: { en: 'Approval denied', fr: 'Approbation refusée' } as T,
      waitingApproval: { en: 'Waiting for admin approval', fr: 'En attente de l’approbation de l’administrateur' } as T,
      contactSupportNext: {
        en: 'Please contact support for the next steps.',
        fr: 'Veuillez contacter le support pour les étapes suivantes.',
      } as T,
      keepSpot: {
        en: 'We’ll email you the moment your account is activated. You can close this page — we’ll keep your spot.',
        fr: 'Nous vous enverrons un e-mail dès l’activation de votre compte. Vous pouvez fermer cette page — nous conservons votre place.',
      } as T,
      emailNoticeTitle: {
        en: 'You’ll receive an email when approved',
        fr: 'Vous recevrez un e-mail une fois approuvé',
      } as T,
      // Notice body is split around the bold email address.
      emailNoticeBefore: {
        en: 'Once an admin approves your account, we’ll send a confirmation to',
        fr: 'Dès qu’un administrateur approuve votre compte, nous enverrons une confirmation à',
      } as T,
      emailNoticeAfter: {
        en: '. Open the email and click “Open dashboard” to sign in.',
        fr: '. Ouvrez l’e-mail et cliquez sur « Ouvrir le tableau de bord » pour vous connecter.',
      } as T,
      checkNow: { en: 'Check status now', fr: 'Vérifier le statut maintenant' } as T,
      lastChecked: { en: 'Last checked at {time}', fr: 'Dernière vérification à {time}' } as T,
      autoRefresh: {
        en: 'This page auto-refreshes every 30 seconds.',
        fr: 'Cette page s’actualise automatiquement toutes les 30 secondes.',
      } as T,
      contactSupport: { en: 'Contact support', fr: 'Contacter le support' } as T,
    },
  },

  // ─── Public patient-facing treatment viewer (created_for_you) ───────
  publicCase: {
    // Salutations are assembled from a prefix + the patient first name.
    salutationHello: { en: 'Hello and welcome', fr: 'Bonjour et bienvenue' } as T,
    salutationMr: { en: 'Dear Mr. {name}', fr: 'Cher M. {name}' } as T,
    salutationMs: { en: 'Dear Ms. {name}', fr: 'Chère Mme {name}' } as T,
    salutationNeutral: { en: 'Dear {name}', fr: 'Cher·e {name}' } as T,
    doctorFallback: { en: 'your dentist', fr: 'votre praticien' } as T,
    secureLink: { en: 'Secure shared link', fr: 'Lien partagé sécurisé' } as T,
    invalidLink: { en: 'Invalid link.', fr: 'Lien invalide.' } as T,
    expiredLink: {
      en: 'This treatment link is no longer available or has expired.',
      fr: 'Ce lien de traitement n’est plus disponible ou a expiré.',
    } as T,
    loading: {
      en: 'Loading your treatment plan…',
      fr: 'Chargement de votre plan de traitement…',
    } as T,
    linkUnavailableTitle: { en: 'Link unavailable', fr: 'Lien indisponible' } as T,
    requestNewLink: {
      en: 'Please contact your dentist to request a new link.',
      fr: 'Veuillez contacter votre praticien pour demander un nouveau lien.',
    } as T,
    madeForYou: { en: 'Made for you', fr: 'Conçu pour vous' } as T,
    // Welcome paragraph wraps the bold doctor name: "<before> <name> <after>".
    welcomeBefore: {
      en: 'We’ve designed this aligner plan especially for you, crafted with care by',
      fr: 'Nous avons conçu ce plan d’aligneurs spécialement pour vous, élaboré avec soin par',
    } as T,
    welcomeAfter: {
      en: '. Take a moment to explore it — we hope you love the smile it brings.',
      fr: '. Prenez un moment pour le découvrir — nous espérons que le sourire qu’il apporte vous plaira.',
    } as T,
    viewerTitle: { en: 'Treatment viewer', fr: 'Visionneuse de traitement' } as T,
    iframeBlocked: {
      en: 'The viewer cannot be embedded here. Please contact your dentist for help opening this preview.',
      fr: 'La visionneuse ne peut pas être intégrée ici. Veuillez contacter votre praticien pour vous aider à ouvrir cet aperçu.',
    } as T,
    previewPreparing: {
      en: 'Your treatment preview is being prepared. Please check back shortly or contact your dentist.',
      fr: 'Votre aperçu de traitement est en cours de préparation. Veuillez revenir bientôt ou contacter votre praticien.',
    } as T,
    privacyNote: {
      en: 'This private link is meant just for you. No medical records or payment details are shared on this page.',
      fr: 'Ce lien privé vous est exclusivement destiné. Aucun dossier médical ni détail de paiement n’est partagé sur cette page.',
    } as T,
  },
};

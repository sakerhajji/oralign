import type { Lang } from './dict';

type T = Record<Lang, string>;

/**
 * Blog CMS (admin) i18n — spread into dict (`...blogDomainDict`) by the
 * main dictionary. Drives the dashboard blog list, the create/edit
 * dialog, and the structured-content block builder.
 *
 * Same leaf shape as dict.ts: every leaf is `{ en, fr } as T`. No
 * Arabic — the dashboard ships FR/EN only (the public showcase blog
 * pages get their AR copy from the showcase i18n bundle, not here).
 *
 * Toasts for blog mutations live under `toasts.blog.*` directly in
 * dict.ts (the main object's literal `toasts:` key is declared after
 * the domain spreads, so a `toasts` leaf spread in from here would be
 * clobbered). Keep CMS-page strings here, toast strings there.
 */
export const blogDomainDict = {
  blogAdmin: {
    // ─── Page chrome ────────────────────────────────────────────────
    title: { en: 'Blog', fr: 'Blog' } as T,
    subtitle: {
      en: 'Write, publish and manage articles shown on the public site.',
      fr: 'Rédigez, publiez et gérez les articles affichés sur le site public.',
    } as T,

    // ─── Top-bar actions / buttons ──────────────────────────────────
    newPost: { en: 'New article', fr: 'Nouvel article' } as T,
    searchPlaceholder: {
      en: 'Search by title, excerpt or category…',
      fr: 'Rechercher par titre, extrait ou catégorie…',
    } as T,

    buttons: {
      save: { en: 'Save', fr: 'Enregistrer' } as T,
      saveDraft: { en: 'Save as draft', fr: 'Enregistrer comme brouillon' } as T,
      cancel: { en: 'Cancel', fr: 'Annuler' } as T,
      publish: { en: 'Publish', fr: 'Publier' } as T,
      unpublish: { en: 'Unpublish', fr: 'Dépublier' } as T,
      archive: { en: 'Archive', fr: 'Archiver' } as T,
      delete: { en: 'Delete', fr: 'Supprimer' } as T,
      edit: { en: 'Edit', fr: 'Modifier' } as T,
      preview: { en: 'Preview', fr: 'Aperçu' } as T,
      addBlock: { en: 'Add block', fr: 'Ajouter un bloc' } as T,
      moveUp: { en: 'Move up', fr: 'Monter' } as T,
      moveDown: { en: 'Move down', fr: 'Descendre' } as T,
      removeBlock: { en: 'Remove block', fr: 'Supprimer le bloc' } as T,
      uploadCover: { en: 'Upload cover', fr: 'Téléverser une couverture' } as T,
      replaceCover: { en: 'Replace cover', fr: 'Remplacer la couverture' } as T,
      removeCover: { en: 'Remove cover', fr: 'Supprimer la couverture' } as T,
      uploadImage: { en: 'Upload image', fr: 'Téléverser une image' } as T,
      addImage: { en: 'Add image', fr: 'Ajouter une image' } as T,
    },

    // ─── Dialog titles ──────────────────────────────────────────────
    dialog: {
      newTitle: { en: 'New article', fr: 'Nouvel article' } as T,
      editTitle: { en: 'Edit article', fr: 'Modifier l’article' } as T,
      newSubtitle: {
        en: 'Draft a new article. It stays hidden until you publish it.',
        fr: 'Rédigez un nouvel article. Il reste masqué jusqu’à sa publication.',
      } as T,
      editSubtitle: {
        en: 'Update this article’s content, cover and SEO settings.',
        fr: 'Mettez à jour le contenu, la couverture et le référencement de cet article.',
      } as T,
    },

    // ─── Field labels ───────────────────────────────────────────────
    fields: {
      title: { en: 'Title', fr: 'Titre' } as T,
      titlePlaceholder: {
        en: 'e.g. 5 things to know before starting Invisalign',
        fr: 'ex. 5 choses à savoir avant de commencer Invisalign',
      } as T,
      slug: { en: 'Slug (URL)', fr: 'Slug (URL)' } as T,
      slugPlaceholder: {
        en: 'auto-generated from the title if left blank',
        fr: 'généré automatiquement à partir du titre si laissé vide',
      } as T,
      slugHelp: {
        en: 'The web address segment. Leave blank to derive it from the title.',
        fr: 'Le segment d’adresse web. Laissez vide pour le générer à partir du titre.',
      } as T,
      excerpt: { en: 'Excerpt', fr: 'Extrait' } as T,
      excerptPlaceholder: {
        en: 'A short summary shown on cards and in search results…',
        fr: 'Un court résumé affiché sur les cartes et dans les résultats de recherche…',
      } as T,
      excerptHelp: {
        en: 'Leave blank to auto-generate from the first paragraph.',
        fr: 'Laissez vide pour le générer automatiquement à partir du premier paragraphe.',
      } as T,
      category: { en: 'Category', fr: 'Catégorie' } as T,
      categoryPlaceholder: {
        en: 'e.g. Patient care, News, Clinical tips',
        fr: 'ex. Soins aux patients, Actualités, Conseils cliniques',
      } as T,
      status: { en: 'Status', fr: 'Statut' } as T,
      content: { en: 'Content', fr: 'Contenu' } as T,
      coverImage: { en: 'Cover image', fr: 'Image de couverture' } as T,
      coverImageHelp: {
        en: 'Shown at the top of the article and on listing cards.',
        fr: 'Affichée en haut de l’article et sur les cartes de la liste.',
      } as T,
      altText: { en: 'Alt text', fr: 'Texte alternatif' } as T,
      altTextPlaceholder: {
        en: 'Describe the image for screen readers',
        fr: 'Décrivez l’image pour les lecteurs d’écran',
      } as T,
      altTextHelp: {
        en: 'Improves accessibility and SEO. Describe what the image shows.',
        fr: 'Améliore l’accessibilité et le référencement. Décrivez ce que montre l’image.',
      } as T,
      // ── SEO group ──
      seoSection: { en: 'Search engine (SEO)', fr: 'Moteur de recherche (SEO)' } as T,
      seoTitle: { en: 'SEO title', fr: 'Titre SEO' } as T,
      seoTitlePlaceholder: {
        en: 'Title shown in search results (defaults to the article title)',
        fr: 'Titre affiché dans les résultats de recherche (par défaut, le titre de l’article)',
      } as T,
      seoDescription: { en: 'SEO description', fr: 'Description SEO' } as T,
      seoDescriptionPlaceholder: {
        en: 'Meta description shown under the title in search results',
        fr: 'Méta-description affichée sous le titre dans les résultats de recherche',
      } as T,
      seoKeywords: { en: 'SEO keywords', fr: 'Mots-clés SEO' } as T,
      seoKeywordsPlaceholder: {
        en: 'Comma-separated keywords',
        fr: 'Mots-clés séparés par des virgules',
      } as T,
      seoKeywordsHelp: {
        en: 'Separate each keyword with a comma.',
        fr: 'Séparez chaque mot-clé par une virgule.',
      } as T,
    },

    // ─── Status tabs (filter strip) ─────────────────────────────────
    tabs: {
      all: { en: 'All', fr: 'Tous' } as T,
      draft: { en: 'Drafts', fr: 'Brouillons' } as T,
      published: { en: 'Published', fr: 'Publiés' } as T,
      archived: { en: 'Archived', fr: 'Archivés' } as T,
    },

    // ─── Status badges (single row badge) ───────────────────────────
    status: {
      draft: { en: 'Draft', fr: 'Brouillon' } as T,
      published: { en: 'Published', fr: 'Publié' } as T,
      archived: { en: 'Archived', fr: 'Archivé' } as T,
    },

    // ─── Table column headers ───────────────────────────────────────
    columns: {
      title: { en: 'Title', fr: 'Titre' } as T,
      category: { en: 'Category', fr: 'Catégorie' } as T,
      author: { en: 'Author', fr: 'Auteur' } as T,
      status: { en: 'Status', fr: 'Statut' } as T,
      publishedAt: { en: 'Published', fr: 'Publié le' } as T,
      readingTime: { en: 'Reading time', fr: 'Temps de lecture' } as T,
      actions: { en: 'Actions', fr: 'Actions' } as T,
    },

    // ─── Block-type picker + builder labels ─────────────────────────
    blocks: {
      sectionTitle: { en: 'Content blocks', fr: 'Blocs de contenu' } as T,
      pickerTitle: { en: 'Add a block', fr: 'Ajouter un bloc' } as T,
      types: {
        heading: { en: 'Heading', fr: 'Titre' } as T,
        paragraph: { en: 'Paragraph', fr: 'Paragraphe' } as T,
        image: { en: 'Image', fr: 'Image' } as T,
        gallery: { en: 'Gallery', fr: 'Galerie' } as T,
        video: { en: 'Video', fr: 'Vidéo' } as T,
        quote: { en: 'Quote', fr: 'Citation' } as T,
        cta: { en: 'Call to action', fr: 'Appel à l’action' } as T,
        divider: { en: 'Divider', fr: 'Séparateur' } as T,
      },
      // Per-block field labels + placeholders used inside the builder.
      headingLevel: { en: 'Heading level', fr: 'Niveau de titre' } as T,
      headingLevel2: { en: 'Section (H2)', fr: 'Section (H2)' } as T,
      headingLevel3: { en: 'Sub-section (H3)', fr: 'Sous-section (H3)' } as T,
      headingPlaceholder: {
        en: 'Heading text…',
        fr: 'Texte du titre…',
      } as T,
      paragraphPlaceholder: {
        en: 'Write your paragraph…',
        fr: 'Rédigez votre paragraphe…',
      } as T,
      imageUrlPlaceholder: {
        en: 'Upload an image or paste an image URL',
        fr: 'Téléversez une image ou collez une URL d’image',
      } as T,
      imageCaption: { en: 'Caption', fr: 'Légende' } as T,
      imageCaptionPlaceholder: {
        en: 'Optional caption shown under the image',
        fr: 'Légende facultative affichée sous l’image',
      } as T,
      galleryHelp: {
        en: 'Add two or more images to display them as a grid.',
        fr: 'Ajoutez au moins deux images pour les afficher en grille.',
      } as T,
      videoUrl: { en: 'Video URL', fr: 'URL de la vidéo' } as T,
      videoUrlPlaceholder: {
        en: 'Paste a YouTube or Vimeo link',
        fr: 'Collez un lien YouTube ou Vimeo',
      } as T,
      videoHelp: {
        en: 'Only YouTube and Vimeo links are supported.',
        fr: 'Seuls les liens YouTube et Vimeo sont pris en charge.',
      } as T,
      quotePlaceholder: {
        en: 'Quote text…',
        fr: 'Texte de la citation…',
      } as T,
      quoteCite: { en: 'Attribution', fr: 'Attribution' } as T,
      quoteCitePlaceholder: {
        en: 'Who said it (optional)',
        fr: 'Qui l’a dit (facultatif)',
      } as T,
      ctaLabel: { en: 'Button label', fr: 'Libellé du bouton' } as T,
      ctaLabelPlaceholder: {
        en: 'e.g. Book a consultation',
        fr: 'ex. Prendre rendez-vous',
      } as T,
      ctaUrl: { en: 'Button link', fr: 'Lien du bouton' } as T,
      ctaUrlPlaceholder: {
        en: 'https://… or /internal-path',
        fr: 'https://… ou /chemin-interne',
      } as T,
      ctaHelp: {
        en: 'Use a full https:// URL or an internal path starting with /.',
        fr: 'Utilisez une URL https:// complète ou un chemin interne commençant par /.',
      } as T,
      dividerHelp: {
        en: 'A horizontal divider — no settings needed.',
        fr: 'Un séparateur horizontal — aucun réglage nécessaire.',
      } as T,
      empty: {
        en: 'No content yet. Add your first block to start writing.',
        fr: 'Aucun contenu pour l’instant. Ajoutez votre premier bloc pour commencer à rédiger.',
      } as T,
    },

    // ─── Cover-image widget states ──────────────────────────────────
    cover: {
      none: { en: 'No cover image', fr: 'Aucune image de couverture' } as T,
      uploading: { en: 'Uploading…', fr: 'Téléversement…' } as T,
      uploadingPercent: {
        en: 'Uploading… {percent}%',
        fr: 'Téléversement… {percent} %',
      } as T,
    },

    // ─── List states ────────────────────────────────────────────────
    loading: { en: 'Loading articles…', fr: 'Chargement des articles…' } as T,
    error: {
      en: 'Articles could not be loaded. Please try again.',
      fr: 'Impossible de charger les articles. Veuillez réessayer.',
    } as T,
    empty: {
      en: 'No articles yet.',
      fr: 'Aucun article pour l’instant.',
    } as T,
    emptyHint: {
      en: 'Create your first article to get started.',
      fr: 'Créez votre premier article pour commencer.',
    } as T,
    emptyFiltered: {
      en: 'No articles match your filters.',
      fr: 'Aucun article ne correspond à vos filtres.',
    } as T,
    noCover: { en: 'No cover', fr: 'Sans couverture' } as T,
    uploading: { en: 'Uploading…', fr: 'Téléversement…' } as T,

    // ─── Reading time ───────────────────────────────────────────────
    readingTime: {
      en: '{count} min read',
      fr: '{count} min de lecture',
    } as T,

    // ─── Delete confirmation ────────────────────────────────────────
    deleteConfirm: {
      title: { en: 'Delete this article?', fr: 'Supprimer cet article ?' } as T,
      body: {
        en: 'This moves the article to the trash. It will no longer appear on the public site. This action can be undone by an administrator.',
        fr: 'L’article sera placé dans la corbeille. Il n’apparaîtra plus sur le site public. Cette action peut être annulée par un administrateur.',
      } as T,
      confirm: { en: 'Delete article', fr: 'Supprimer l’article' } as T,
    },
  },
};

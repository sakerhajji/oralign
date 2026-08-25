# Oralign — Cartographie SEO des mots-clés

> Source de vérité éditoriale du référencement. Le code qui l'implémente vit dans
> `oralign-frontend/src/app/(showcase)/_lib/seo/` (registre de routes + metadata +
> JSON-LD). **Une page = une intention de recherche = un jeu de mots-clés.**
> Jamais deux pages sur la même intention (risque de cannibalisation), jamais de
> bourrage : les mots-clés apparaissent dans le title, la description, le H1 et
> naturellement dans le corps — pas en liste.

## Architecture des langues

| Langue | URLs | Exemple |
|---|---|---|
| Français (canonique, marché principal) | racine | `/decouvrir`, `/praticiens` |
| Anglais | préfixe `/en` | `/en/discover`, `/en/for-dentists` |
| Arabe (RTL) | préfixe `/ar` | `/ar/discover`, `/ar/for-dentists` |

Chaque page marketing existe dans les trois langues, chacune étant une **URL
distincte** avec hreflang réciproque (`fr`/`fr-TN`/`en`/`ar`/`ar-TN` +
`x-default` → FR) déclaré dans les metadata **et** dans le sitemap.
Le blog et les pages légales restent mono-URL (canonique FR).
Exception : `/qui-sommes-nous` et `/contact` n'existent qu'en **fr + en**
(la prose légale n'a pas encore de traduction arabe — `PAGE_LANGS` dans
`routes.ts` ; y ajouter `ar` le jour où la traduction existe).

## Mapping intention → page

### 1. Patient — découverte (commercial + informationnel)

**Page : `/decouvrir` · `/en/discover` · `/ar/discover`** — priorité sitemap 1.0

- FR : aligneur dentaire, aligneurs transparents, gouttière dentaire, orthodontie
  invisible, appareil dentaire invisible, aligneur dentaire Tunisie,
  **prix aligneurs Tunisie**, **alternative Invisalign Tunisie**,
  **meilleur aligneur dentaire Tunisie**, **prix gouttière dentaire Tunisie**
- EN : clear aligners, dental aligners, transparent aligners, invisible braces,
  invisible orthodontics, teeth aligners, clear aligner treatment
- AR : تقويم شفاف، تقويم الأسنان الشفاف، تقويم غير مرئي، مصففات الأسنان،
  مصففات شفافة، تقويم الأسنان بدون أسلاك، تقويم الأسنان في تونس،
  **سعر تقويم الأسنان الشفاف**، **سعر التقويم الشفاف في تونس**،
  **أفضل تقويم أسنان شفاف**
- Long-tail « prix » : capté par la FAQ JSON-LD de la page (question
  « Combien coûte un traitement par aligneurs en Tunisie ? » dans les 3 langues).

### 2. Praticien / B2B — acquisition (commercial)

**Page : `/praticiens` · `/en/for-dentists` · `/ar/for-dentists`** — priorité 0.9
*(nouvelle page : le header « Espace praticien » et le footer y mènent)*

- FR : aligneurs pour dentistes, **fournisseur aligneurs dentaires**,
  **fabricant aligneurs dentaires**, laboratoire orthodontique, laboratoire
  dentaire, solution pour dentistes, orthodontie digitale, scanner intra-oral,
  planification orthodontique, traitement orthodontique numérique, partenaire
  dentiste, **devenir dentiste partenaire**, **fournisseur aligneurs pour
  dentistes**, **laboratoire aligneurs Tunisie**
- EN : clear aligners for dentists, **clear aligner supplier Tunisia**, aligner
  provider, aligner manufacturer, dental aligner supplier, orthodontic
  laboratory, dental laboratory, digital orthodontics, intraoral scanner,
  orthodontic treatment planning, **clear aligner system for dentists**,
  dentist partner program, orthodontist partner, dental professionals
- AR : مصففات الأسنان للأطباء، حلول لأطباء الأسنان، مورد مصففات الأسنان،
  مصنع مصففات الأسنان، مخبر أسنان، مخبر تقويم الأسنان، تقويم الأسنان الرقمي،
  ماسح ضوئي للأسنان، التخطيط الرقمي لتقويم الأسنان، شريك طبيب أسنان،
  **مصففات الأسنان للأطباء في تونس**
- JSON-LD : schéma `Service` (laboratoire orthodontique, audience = dentistes).

### 3. Local Tunisie — trouver un cabinet (commercial local)

**Page : `/trouver-un-praticien` · `/en/find-a-practitioner` · `/ar/find-a-practitioner`** — priorité 0.8

- FR : **dentiste Tunisie**, **orthodontiste Tunisie**, cabinet dentaire,
  clinique dentaire, orthodontiste aligneurs Tunis
- EN : dentist Tunisia, orthodontist Tunisia, dental clinic, dental practice
- AR : طبيب أسنان، طبيب تقويم الأسنان، أخصائي تقويم الأسنان، عيادة أسنان، مركز أسنان
- Renfort : JSON-LD `MedicalOrganization` avec adresse Tunis + `areaServed: TN`
  sur tout le site.

### 4. Preuve clinique (considération)

**Page : `/cas` · `/en/clinical-cases` · `/ar/clinical-cases`** — priorité 0.8

- FR : traitement par aligneurs, avant après aligneurs, encombrement dentaire,
  supraclusion, béance dentaire
- EN : clear aligner before and after, orthodontic clinical cases
- AR : علاج تقويم الأسنان، قبل وبعد التقويم الشفاف

### 5. Informationnel — usage (fidélisation + featured snippets)

**Page : `/guide` · `/en/guide` · `/ar/guide`** — priorité 0.7

- FR : porter gouttière dentaire, nettoyer aligneurs, entretien gouttière
  orthodontique
- EN : how to wear aligners, clean clear aligners
- AR : قالب الأسنان الشفاف، تنظيف مصففات الأسنان
- Le JSON-LD **FAQPage** vit ici (dérivé de la FAQ visible de la page,
  `dict.faq.items`) — jamais sur une page sans FAQ affichée.

### 6. Preuve sociale

**Page : `/communaute` · `/en/community` · `/ar/community`** — priorité 0.6

- FR : témoignages aligneurs, avis aligneurs Tunisie
- EN : clear aligner reviews · AR : تجارب التقويم الشفاف

### 7. Marque / confiance

**Pages : `/qui-sommes-nous`, `/contact` (+ variantes en/ar)** — priorité 0.5

- ORALIGN, Aura Aligners, fabricant aligneurs Tunisie /
  aligner manufacturer Tunisia / شركة تقويم شفاف تونس

### 8. Contenu frais — blog

**`/blog` + `/blog/<slug>`** — le long-tail informationnel vit ici
(articles patients ET praticiens, JSON-LD `BlogPosting`, SEO title/description
par article depuis le CMS). Sujets recommandés : « prix aligneurs Tunisie :
ce qui fait varier le devis », « scanner intra-oral vs empreinte classique »,
« aligneur ou bagues pour un ado ? ».

## Hors index (volontairement)

`/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`
→ **meta noindex** (crawl autorisé pour que la directive soit lue).
`/dashboard`, `/account`, `/onboarding`, `/created_for_you`, `/qr`, `/api` →
robots.txt **Disallow** d'abord (on ne veut même pas de crawl : surfaces
privées/tokenisées), meta noindex en ceinture-bretelles.
`/shop` → noindex tant que placeholder.

## Garde-fous

- Pas de bourrage : ≤ ~10 keywords/page, tous repris naturellement dans le copy.
- Pas de pages dupliquées : une intention = une page ; les variantes de langue
  sont reliées par hreflang réciproque, pas clonées silencieusement.
- JSON-LD servi inline côté serveur (visible dans le HTML source).
- Toute nouvelle page marketing s'ajoute dans
  `_lib/seo/routes.ts` (metadata + hreflang + sitemap suivent automatiquement).
